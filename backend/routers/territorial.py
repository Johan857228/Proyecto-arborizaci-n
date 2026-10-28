"""Tablero territorial e informe anual de la Secretaría (migración 014). Reglas: servicios/territorial.py.

- Territorios: los crea el administrador (municipios por DIVIPOLA y/o colegios sueltos) y les
  asigna funcionarios con rol territorial.
- Tablero: semáforo del PRAE de cada colegio, siembras, clases con guías, participación y
  servicio social del año. Solo cifras por colegio: ningún nombre de estudiante.
- Informe: textos editables guardados por territorio y año, y descarga en PDF o Word.

Los datos se leen con la llave de servicio después de comprobar el alcance: el funcionario
territorial no pertenece a ningún colegio, así que el RLS de cada tabla no lo dejaría verlos.
"""
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field, field_validator

import db
from auth import Perfil, admin_actual, perfil_actual
from comun import BUCKET_FOTOS, ahora, hoy, traer_todo
from routers import siembras as router_siembras
from routers.exportar import instituciones_con_dane
from routers.servicio_social import resumenes_institucion
from servicios import prae as reglas_prae
from servicios import siembras as reglas_siembras
from servicios import territorial as reglas

router = APIRouter(prefix="/territorial", tags=["Tablero territorial"])

TipoTerritorio = Literal["secretaria_educacion", "autoridad_ambiental", "gobernacion", "alcaldia", "otro"]
Formato = Literal["pdf", "docx"]
VIGENCIA_ENLACE_S = 600
TIPOS_MIME = {"pdf": "application/pdf", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}


def _falta_migracion(error: APIError) -> bool:
    return str(getattr(error, "code", "") or "") in ("PGRST205", "42P01")


# ===================================== Modelos =====================================
def _nombre_limpio(v):
    return " ".join(v.split()) if isinstance(v, str) else v


def _divipolas_validas(v: list[str] | None) -> list[str] | None:
    if v is None:
        return None
    limpios = sorted({c.strip() for c in v if c.strip()})
    if any(not (len(c) == 5 and c.isdigit()) for c in limpios):
        raise ValueError("Cada municipio va con su código DIVIPOLA de 5 dígitos (Valledupar: 20001)")
    return limpios


class TerritorioCambios(BaseModel):
    nombre: str | None = Field(default=None, min_length=3, max_length=160)
    tipo: TipoTerritorio | None = None
    divipolas: list[str] | None = Field(default=None, max_length=200, description="Municipios (5 dígitos, Valledupar: 20001)")
    institucion_ids: list[str] | None = Field(default=None, max_length=2000, description="Colegios sueltos, además de los municipios")

    @field_validator("nombre", mode="before")
    @classmethod
    def _limpiar(cls, v):
        return _nombre_limpio(v)

    @field_validator("divipolas")
    @classmethod
    def _divipolas(cls, v):
        return _divipolas_validas(v)


class TerritorioIn(TerritorioCambios):
    nombre: str = Field(min_length=3, max_length=160)
    tipo: TipoTerritorio = "secretaria_educacion"
    divipolas: list[str] = Field(default_factory=list, max_length=200)
    institucion_ids: list[str] = Field(default_factory=list, max_length=2000)


class MiembrosIn(BaseModel):
    usuario_ids: list[UUID] = Field(max_length=100)


class Miembro(BaseModel):
    usuario_id: str
    nombre: str
    correo: str | None = None


class TerritorioOut(BaseModel):
    id: str
    nombre: str
    tipo: TipoTerritorio
    divipolas: list[str]
    institucion_ids: list[str]
    instituciones: int = Field(description="Colegios que abarca")
    miembros: list[Miembro] = Field(default_factory=list, description="Solo para el administrador")


class PraeFila(BaseModel):
    id: str
    titulo: str
    tema: str | None = None
    tema_otro: str | None = None
    estado: str
    evaluaciones_faltantes: list[str]
    pct_cumplidas: float | None = None


class SiembrasFila(BaseModel):
    jornadas: int
    sembradas: int
    nativas: int
    clasificadas: int
    pct_nativas: float | None = None
    evaluadas: int
    vivas: int
    supervivencia_pct: float | None = None
    asistentes: int


class FilaInstitucion(BaseModel):
    id: str
    nombre: str
    nombre_corto: str | None = None
    codigo_dane: str | None = None
    municipio: str | None = None
    divipola: str | None = None
    semaforo: Literal["verde", "amarillo", "rojo"]
    prae: PraeFila | None = None
    arboles: dict | None = None
    siembras: SiembrasFila | None = None
    clases: dict | None = None
    servicio_social: dict | None = None
    inspectores: int | None = None


class TableroOut(BaseModel):
    territorio_id: str | None = None
    territorio: str
    anio: int
    generado_en: datetime
    totales: dict
    instituciones: list[FilaInstitucion]


class InformeIn(BaseModel):
    territorio_id: UUID
    anio: int = Field(ge=2020, le=2100)
    secciones: dict[str, str] = Field(default_factory=dict)
    estado: Literal["borrador", "final"] = "borrador"

    @field_validator("secciones")
    @classmethod
    def _secciones(cls, v: dict[str, str]) -> dict[str, str]:
        desconocidas = set(v) - set(reglas.SECCIONES)
        if desconocidas:
            raise ValueError(f"Secciones que no existen: {', '.join(sorted(desconocidas))}")
        if any(len(t) > 6000 for t in v.values()):
            raise ValueError("Cada sección admite hasta 6.000 caracteres")
        return {k: t.strip() for k, t in v.items()}


class InformeOut(BaseModel):
    territorio_id: str
    anio: int
    secciones: dict[str, str]
    estado: Literal["borrador", "final"]
    actualizado_en: datetime | None = None
    titulos: dict[str, str] = Field(default_factory=lambda: dict(reglas.SECCIONES))


class ArchivoIn(BaseModel):
    territorio_id: UUID
    anio: int = Field(ge=2020, le=2100)
    formato: Formato = "pdf"


class DescargaOut(BaseModel):
    url: str
    nombre: str
    vence_en_segundos: int


# ==================================== Alcance ====================================
def _territorio(territorio_id: str) -> dict:
    try:
        filas = db.get_admin().table("territorios").select("*").eq("id", territorio_id).execute().data
    except APIError as error:
        if _falta_migracion(error):
            raise HTTPException(status_code=409, detail="Falta aplicar la migración 014 (tablero territorial) en Supabase")
        raise
    if not filas:
        raise HTTPException(status_code=404, detail="Territorio no encontrado")
    return filas[0]


def _mis_territorios(perfil: Perfil) -> list[str]:
    try:
        filas = db.get_admin().table("miembros_territorio").select("territorio_id").eq("usuario_id", perfil.usuario_id).execute().data
    except APIError as error:
        if _falta_migracion(error):
            return []
        raise
    return [str(f["territorio_id"]) for f in filas]


def _alcance(perfil: Perfil, territorio_id: str | None) -> dict | None:
    """El territorio que puede ver quien pide. None = todas las instituciones (solo administrador)."""
    if perfil.es_admin:
        return _territorio(territorio_id) if territorio_id else None
    if perfil.rol != "territorial":
        raise HTTPException(status_code=403, detail="El tablero territorial es para funcionarios de la Secretaría, la autoridad ambiental o la Gobernación")
    mios = _mis_territorios(perfil)
    if territorio_id is None and len(mios) == 1:
        territorio_id = mios[0]
    if territorio_id is None:
        raise HTTPException(status_code=422, detail="Elige el territorio" if mios else "Tu cuenta aún no tiene un territorio asignado")
    if territorio_id not in mios:
        raise HTTPException(status_code=403, detail="Ese territorio no está asignado a tu cuenta")
    return _territorio(territorio_id)


def instituciones_de(territorio: dict | None) -> list[dict]:
    todas = list(instituciones_con_dane().values())
    if territorio is None:
        return todas
    municipios = set(territorio.get("divipolas") or [])
    sueltas = set(territorio.get("institucion_ids") or [])
    return [i for i in todas if i.get("divipola") in municipios or str(i["id"]) in sueltas]


def _lotes(ids: list[str], tam: int = 100):
    for inicio in range(0, len(ids), tam):
        yield ids[inicio:inicio + tam]


def _todo(tabla: str, columnas: str, columna: str, ids: list[str], filtros=(), orden: str = "id") -> list[dict]:
    filas: list[dict] = []
    for lote in _lotes(ids):
        filas += traer_todo(db.get_admin(), tabla, columnas, filtros=[("in_", (columna, lote)), *filtros], orden=orden)
    return filas


# ===================================== Datos =====================================
def _praes(ids: list[str], anio: int) -> dict[str, dict]:
    try:
        praes = _todo("prae", "id, institucion_id, titulo, tema, tema_otro", "institucion_id", ids, [("eq", ("anio", anio))])
    except APIError as error:
        if _falta_migracion(error):
            return {}
        raise
    prae_ids = [str(p["id"]) for p in praes]
    acciones = _todo("prae_acciones", "id, prae_id, estado", "prae_id", prae_ids)
    evaluaciones = _todo("prae_evaluaciones", "id, prae_id, instancia", "prae_id", prae_ids)
    salida = {}
    for p in praes:
        propias_a = [a for a in acciones if str(a["prae_id"]) == str(p["id"])]
        propias_e = [e for e in evaluaciones if str(e["prae_id"]) == str(p["id"])]
        instancias = {e["instancia"] for e in propias_e}
        salida[str(p["institucion_id"])] = {
            "id": str(p["id"]), "titulo": p["titulo"], "tema": p.get("tema"), "tema_otro": p.get("tema_otro"),
            "estado": reglas_prae.estado(propias_a, propias_e),
            "evaluaciones_faltantes": [i for i in reglas_prae.EVALUACIONES_OBLIGATORIAS if i not in instancias],
            "pct_cumplidas": reglas_prae.resumen_acciones(propias_a)["pct_cumplidas"],
        }
    return salida


def _siembras(ids: list[str], anio: int) -> dict[str, dict] | None:
    try:
        jornadas = _todo("jornadas_siembra", "id, institucion_id, fecha", "institucion_id", ids)
    except APIError as error:
        if _falta_migracion(error):
            return None
        raise
    plantas = router_siembras._por_id("siembras", "jornada_id", [str(j["id"]) for j in jornadas])
    del_anio = [s for s in plantas if str(s["fecha"])[:4] == str(anio)]
    controles: dict[str, list[dict]] = {}
    for c in router_siembras._por_id("controles_siembra", "siembra_id", [str(s["id"]) for s in del_anio]):
        controles.setdefault(str(c["siembra_id"]), []).append(c)
    origenes = router_siembras._origenes(del_anio, router_siembras._especies())
    jornadas_anio = [j for j in jornadas if str(j["fecha"])[:4] == str(anio)]
    asistentes = router_siembras._por_id("asistentes_jornada", "jornada_id", [str(j["id"]) for j in jornadas_anio])
    salida = {}
    for inst in ids:
        propias = [s for s in del_anio if str(s["institucion_id"]) == inst]
        r = reglas_siembras.resumen(propias, controles, origenes, hoy())
        mis_jornadas = {str(j["id"]) for j in jornadas_anio if str(j["institucion_id"]) == inst}
        salida[inst] = {
            "jornadas": len(mis_jornadas), "sembradas": r["sembradas"], "nativas": r["nativas"],
            "clasificadas": sum(1 for s in propias if origenes.get(str(s["id"])) in ("nativa", "exotica")),
            "pct_nativas": r["pct_nativas"], "evaluadas": r["evaluadas"], "vivas": r["vivas"],
            "supervivencia_pct": r["supervivencia_pct"],
            "asistentes": sum(1 for a in asistentes if str(a["jornada_id"]) in mis_jornadas),
        }
    return salida


def _clases(ids: list[str], anio: int) -> dict[str, dict] | None:
    try:
        filas = _todo("clases_guia", "id, institucion_id, guia_id, fecha, asistentes", "institucion_id", ids,
                      [("gte", ("fecha", f"{anio}-01-01")), ("lte", ("fecha", f"{anio}-12-31"))])
    except APIError as error:
        if _falta_migracion(error):
            return None
        raise
    salida = {i: {"clases": 0, "guias": 0, "asistentes": 0} for i in ids}
    guias: dict[str, set] = {i: set() for i in ids}
    for c in filas:
        x = salida[str(c["institucion_id"])]
        x["clases"] += 1
        x["asistentes"] += c.get("asistentes") or 0
        guias[str(c["institucion_id"])].add(c["guia_id"])
    for i in ids:
        salida[i]["guias"] = len(guias[i])
    return salida


def _arboles_e_inspectores(ids: list[str], anio: int) -> tuple[dict[str, dict], dict[str, int]]:
    arboles = _todo("arboles_resumen", "id, institucion_id, estado", "institucion_id", ids)
    conteo = {i: {"total": 0, "sano": 0, "riesgo": 0, "critico": 0} for i in ids}
    de = {}
    for a in arboles:
        c = conteo[str(a["institucion_id"])]
        c["total"] += 1
        if a.get("estado") in c:
            c[a["estado"]] += 1
        de[str(a["id"])] = str(a["institucion_id"])
    inspecciones = traer_todo(db.get_admin(), "inspecciones", "id, arbol_id, inspector_id, fecha, estado_revision",
                              filtros=[("gte", ("fecha", f"{anio}-01-01")), ("lte", ("fecha", f"{anio}-12-31T23:59:59"))])
    personas: dict[str, set] = {i: set() for i in ids}
    for i in inspecciones:
        inst = de.get(str(i.get("arbol_id")))
        if inst and i.get("inspector_id") and i.get("estado_revision") != "anulada":
            personas[inst].add(str(i["inspector_id"]))
    return conteo, {i: len(p) for i, p in personas.items()}


def _servicio(ids: list[str]) -> dict[str, dict] | None:
    salida = {}
    try:
        for inst in ids:
            estudiantes = resumenes_institucion(inst)
            salida[inst] = {
                "estudiantes": len(estudiantes),
                "completaron": sum(1 for e in estudiantes if e.get("estado") == "completo"),
                "horas_aprobadas": round(sum(e.get("horas_aprobadas", 0) for e in estudiantes), 1),
            }
    except APIError as error:
        if _falta_migracion(error):
            return None
        raise
    return salida


def tablero_de(territorio: dict | None, anio: int) -> dict:
    instituciones = sorted(instituciones_de(territorio), key=lambda i: str(i.get("nombre") or ""))
    ids = [str(i["id"]) for i in instituciones]
    praes = _praes(ids, anio)
    siembras = _siembras(ids, anio)
    clases = _clases(ids, anio)
    arboles, inspectores = _arboles_e_inspectores(ids, anio)
    servicio = _servicio(ids)
    filas = []
    for i in instituciones:
        iid = str(i["id"])
        prae = praes.get(iid)
        filas.append({
            "id": iid, "nombre": i["nombre"], "nombre_corto": i.get("nombre_corto"), "codigo_dane": i.get("codigo_dane"),
            "municipio": i.get("municipio"), "divipola": i.get("divipola"), "semaforo": reglas.semaforo(prae), "prae": prae,
            "arboles": arboles.get(iid), "siembras": (siembras or {}).get(iid), "clases": (clases or {}).get(iid),
            "servicio_social": (servicio or {}).get(iid), "inspectores": inspectores.get(iid),
        })
    orden = {"rojo": 0, "amarillo": 1, "verde": 2}
    filas.sort(key=lambda f: (orden[f["semaforo"]], f["nombre"]))
    return {
        "territorio_id": str(territorio["id"]) if territorio else None,
        "territorio": territorio["nombre"] if territorio else "Todas las instituciones",
        "anio": anio, "generado_en": ahora(), "totales": reglas.totales(filas), "instituciones": filas,
    }


# ==================================== Territorios ====================================
def _territorio_out(t: dict, con_miembros: bool) -> dict:
    miembros = []
    if con_miembros:
        ids = [str(m["usuario_id"]) for m in db.get_admin().table("miembros_territorio").select("usuario_id").eq("territorio_id", str(t["id"])).execute().data]
        if ids:
            miembros = [{"usuario_id": str(p["usuario_id"]), "nombre": p["nombre"], "correo": p.get("correo")}
                        for p in db.get_admin().table("perfiles").select("usuario_id, nombre, correo").in_("usuario_id", ids).execute().data]
    return {**{k: t.get(k) for k in ("nombre", "tipo")}, "id": str(t["id"]), "divipolas": t.get("divipolas") or [],
            "institucion_ids": t.get("institucion_ids") or [], "instituciones": len(instituciones_de(t)), "miembros": miembros}


@router.get("/territorios", response_model=list[TerritorioOut])
def listar_territorios(perfil: Perfil = Depends(perfil_actual)):
    """El administrador ve todos (con sus funcionarios); el funcionario, los suyos."""
    try:
        filas = traer_todo(db.get_admin(), "territorios")
    except APIError as error:
        if _falta_migracion(error):
            return []
        raise
    if not perfil.es_admin:
        mios = set(_mis_territorios(perfil))
        filas = [t for t in filas if str(t["id"]) in mios]
    filas.sort(key=lambda t: t["nombre"])
    return [_territorio_out(t, perfil.es_admin) for t in filas]


def _validar_instituciones(ids: list[str]):
    existentes = set(instituciones_con_dane())
    faltan = [i for i in ids if i not in existentes]
    if faltan:
        raise HTTPException(status_code=422, detail=f"Instituciones que no existen: {', '.join(faltan)}")


@router.post("/territorios", response_model=TerritorioOut, status_code=201)
def crear_territorio(d: TerritorioIn, perfil: Perfil = Depends(admin_actual)):
    _validar_instituciones(d.institucion_ids)
    try:
        creado = db.get_admin().table("territorios").insert(d.model_dump()).execute().data[0]
    except APIError as error:
        if _falta_migracion(error):
            raise HTTPException(status_code=409, detail="Falta aplicar la migración 014 (tablero territorial) en Supabase")
        raise
    return _territorio_out(creado, True)


@router.patch("/territorios/{territorio_id}", response_model=TerritorioOut)
def editar_territorio(territorio_id: UUID, d: TerritorioCambios, perfil: Perfil = Depends(admin_actual)):
    _territorio(str(territorio_id))
    cambios = {k: v for k, v in d.model_dump(include=d.model_fields_set).items() if v is not None}
    if "institucion_ids" in cambios:
        _validar_instituciones(cambios["institucion_ids"])
    actualizado = db.get_admin().table("territorios").update({**cambios, "actualizado_en": ahora().isoformat()}).eq("id", str(territorio_id)).execute().data[0]
    return _territorio_out(actualizado, True)


@router.delete("/territorios/{territorio_id}", status_code=204)
def borrar_territorio(territorio_id: UUID, perfil: Perfil = Depends(admin_actual)):
    _territorio(str(territorio_id))
    db.get_admin().table("territorios").delete().eq("id", str(territorio_id)).execute()
    return Response(status_code=204)


@router.put("/territorios/{territorio_id}/miembros", response_model=TerritorioOut)
def asignar_miembros(territorio_id: UUID, d: MiembrosIn, perfil: Perfil = Depends(admin_actual)):
    """Funcionarios que ven el territorio. Deben tener el rol territorial (se cambia en Usuarios)."""
    t = _territorio(str(territorio_id))
    ids = sorted({str(u) for u in d.usuario_ids})
    admin = db.get_admin()
    perfiles = {str(p["usuario_id"]): p for p in (admin.table("perfiles").select("usuario_id, rol").in_("usuario_id", ids).execute().data if ids else [])}
    if len(perfiles) != len(ids):
        raise HTTPException(status_code=422, detail="Hay usuarios que no existen")
    sin_rol = [u for u, p in perfiles.items() if p["rol"] != "territorial"]
    if sin_rol:
        raise HTTPException(status_code=422, detail="Asigna primero el rol territorial a esas cuentas en Usuarios")
    admin.table("miembros_territorio").delete().eq("territorio_id", str(territorio_id)).execute()
    if ids:
        admin.table("miembros_territorio").insert([{"territorio_id": str(territorio_id), "usuario_id": u} for u in ids]).execute()
    return _territorio_out(t, True)


# ===================================== Tablero =====================================
@router.get("/tablero", response_model=TableroOut)
def tablero(
    territorio_id: UUID | None = Query(None),
    anio: int | None = Query(None, ge=2020, le=2100),
    perfil: Perfil = Depends(perfil_actual),
):
    """Semáforo y cifras del año de cada colegio del territorio (el administrador puede ver todos)."""
    territorio = _alcance(perfil, str(territorio_id) if territorio_id else None)
    return tablero_de(territorio, anio or hoy().year)


# ===================================== Informe =====================================
def _informe(territorio_id: str, anio: int) -> dict | None:
    filas = db.get_admin().table("informes_territoriales").select("*").eq("territorio_id", territorio_id).eq("anio", anio).execute().data
    return filas[0] if filas else None


@router.get("/informe", response_model=InformeOut)
def ver_informe(territorio_id: UUID, anio: int = Query(..., ge=2020, le=2100), perfil: Perfil = Depends(perfil_actual)):
    """Los textos del informe anual (vacíos si aún no se han escrito)."""
    _alcance(perfil, str(territorio_id))
    guardado = _informe(str(territorio_id), anio) or {}
    return {"territorio_id": str(territorio_id), "anio": anio, "secciones": guardado.get("secciones") or {},
            "estado": guardado.get("estado") or "borrador", "actualizado_en": guardado.get("actualizado_en")}


@router.put("/informe", response_model=InformeOut)
def guardar_informe(d: InformeIn, perfil: Perfil = Depends(perfil_actual)):
    _alcance(perfil, str(d.territorio_id))
    fila = {"territorio_id": str(d.territorio_id), "anio": d.anio, "secciones": d.secciones, "estado": d.estado,
            "actualizado_por": perfil.usuario_id, "actualizado_en": ahora().isoformat()}
    db.get_admin().table("informes_territoriales").upsert(fila, on_conflict="territorio_id,anio").execute()
    return ver_informe(d.territorio_id, d.anio, perfil)


@router.post("/informe/archivo", response_model=DescargaOut)
def archivo_informe(d: ArchivoIn, perfil: Perfil = Depends(perfil_actual)):
    """El informe con las cifras del año y los textos guardados, en PDF o en Word para editarlo."""
    territorio = _alcance(perfil, str(d.territorio_id))
    datos = tablero_de(territorio, d.anio)
    secciones = (_informe(str(d.territorio_id), d.anio) or {}).get("secciones") or {}
    generar = reglas.informe_pdf if d.formato == "pdf" else reglas.informe_docx
    contenido = generar(territorio, d.anio, datos["instituciones"], datos["totales"], secciones, hoy())
    nombre = f"informe-prae-{d.anio}.{d.formato}"
    ruta = f"territorial/{d.territorio_id}/{d.anio}/informe-prae-{d.anio}.{d.formato}"
    almacen = db.get_admin().storage.from_(BUCKET_FOTOS)
    almacen.upload(ruta, contenido, {"content-type": TIPOS_MIME[d.formato], "upsert": "true"})
    firmada = almacen.create_signed_url(ruta, VIGENCIA_ENLACE_S, {"download": nombre})
    url = firmada.get("signedURL") or firmada.get("signedUrl")
    if not url:
        raise HTTPException(status_code=502, detail="No se pudo preparar la descarga. Intenta de nuevo.")
    return {"url": url, "nombre": nombre, "vence_en_segundos": VIGENCIA_ENLACE_S}
