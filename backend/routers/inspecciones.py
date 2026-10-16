"""Inspecciones (visitas sucesivas a un árbol) y su revisión por docentes y administradores."""
import math
import uuid
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field, field_validator, model_validator

import comun
import datos
import db
from auth import Perfil, perfil_actual, revisor_actual
from comun import BUCKET_FOTOS, MAX_FOTOS_ADICIONALES, leer_foto, resumen_por_id, traer_todo, url_firmada
from schemas import (
    ALTURA_MAX_M,
    COPA_MAX_M,
    DAP_MAX_CM,
    LAT_MAX,
    LAT_MIN,
    LNG_MAX,
    LNG_MIN,
    MAX_OBSERVACIONES,
    TEXTO_OTRA_MAX,
    TEXTO_OTRA_MIN,
    CodigoObservacion,
    Estado,
    EstadoRevision,
    Etapa,
    FotoOut,
    Interferencia,
    ObservacionOut,
    OrigenInspeccion,
    TipoFoto,
)
from servicios.calificacion import calcular_ambientales, evaluar

router = APIRouter(tags=["Inspecciones y revisión"])

DISTANCIA_AVISO_M = 50


# ==================================== Modelos ====================================
class InspeccionCrear(BaseModel):
    """Una visita al árbol: ubicación (opcional), medidas, hallazgos y notas. Usa los mismos
    límites que el registro del árbol (schemas.ArbolCrear)."""

    lat: float | None = Field(default=None, ge=LAT_MIN, le=LAT_MAX, description="Latitud dentro de Colombia")
    lng: float | None = Field(default=None, ge=LNG_MIN, le=LNG_MAX, description="Longitud dentro de Colombia")
    precision_gps_m: float | None = Field(default=None, ge=0, le=10000)
    dap_cm: float = Field(gt=0, le=DAP_MAX_CM, description="Diámetro a la altura del pecho, máximo 500 cm")
    altura_m: float = Field(gt=0, le=ALTURA_MAX_M, description="Altura total, máximo 25 m")
    copa_m: float = Field(gt=0, le=COPA_MAX_M, description="Diámetro de copa, máximo 40 m")
    etapa: Etapa
    interferencia: Interferencia
    interferencia_otra: str | None = Field(default=None, min_length=TEXTO_OTRA_MIN, max_length=TEXTO_OTRA_MAX)
    observaciones: list[CodigoObservacion] = Field(default_factory=list, max_length=MAX_OBSERVACIONES)
    notas: str | None = Field(default=None, max_length=1000)

    # mode="before": se limpian los espacios ANTES de medir el largo del texto
    @field_validator("interferencia_otra", "notas", mode="before")
    @classmethod
    def _limpiar_texto(cls, v):
        if isinstance(v, str):
            v = v.strip()
        return v or None

    @model_validator(mode="after")
    def _reglas(self):
        if (self.lat is None) != (self.lng is None):
            raise ValueError("Envía latitud y longitud juntas, o ninguna de las dos")
        if self.interferencia == "Otra infraestructura":
            if not self.interferencia_otra:
                raise ValueError("Si la interferencia es 'Otra infraestructura', escribe cuál en interferencia_otra")
        else:
            self.interferencia_otra = None
        self.observaciones = sorted(set(self.observaciones))
        return self


class InspeccionOut(BaseModel):
    id: str
    arbol_id: str
    fecha: datetime
    origen: OrigenInspeccion
    inspector_id: str | None = None
    inspector_nombre: str | None = None
    lat: float | None = None
    lng: float | None = None
    precision_gps_m: float | None = None
    dap_cm: float
    altura_m: float
    copa_m: float
    etapa: str
    interferencia: str
    interferencia_otra: str | None = None
    notas: str | None = None
    metodo_id: str
    metodo_version: int | None = None
    puntaje_riesgo: float
    calificacion: Estado
    estado_revision: EstadoRevision
    revisado_por: str | None = None
    revisado_por_nombre: str | None = None
    revisado_en: datetime | None = None
    comentario_revision: str | None = None
    observaciones: list[ObservacionOut] = []
    fotos: list[FotoOut] = []
    biomasa_total_kg: float
    carbono_kg: float
    co2_kg: float
    o2_kg: float
    advertencias: list[str] = []
    fotos_sugeridas: list[TipoFoto] = []


class InspeccionConArbol(InspeccionOut):
    codigo: str
    nombre_comun: str
    nombre_cientifico: str
    zona: str
    zona_otra: str | None = None
    institucion_id: str
    nombre_corto: str
    puede_revisar: bool
    motivo_no_revisable: str | None = None


class PendientesOut(BaseModel):
    total: int
    items: list[InspeccionConArbol]


class ConfirmarIn(BaseModel):
    comentario: str | None = Field(default=None, max_length=500)

    @field_validator("comentario")
    @classmethod
    def _limpiar(cls, v: str | None) -> str | None:
        v = v.strip() if v else v
        return v or None


class AnularIn(BaseModel):
    motivo: str = Field(min_length=5, max_length=500, description="Por qué se anula (obligatorio)")

    @field_validator("motivo")
    @classmethod
    def _limpiar(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 5:
            raise ValueError("Explica el motivo en al menos 5 caracteres")
        return v


# ==================================== Lógica =====================================
def registrar_inspeccion(cliente, arbol: dict, d: InspeccionCrear, origen: str) -> dict:
    """Califica con el método vigente de la institución y guarda la inspección y sus hallazgos.
    Si fallan los hallazgos, borra la inspección para no dejarla a medias.
    arbol: fila con id, institucion_id, lat y lng."""
    catalogo = datos.catalogo_observaciones(cliente)
    invalidos = [c for c in d.observaciones if c not in catalogo]
    if invalidos:
        raise HTTPException(status_code=422, detail=f"Observaciones no válidas: {invalidos}")

    parametros = datos.parametros_institucion(cliente, arbol["institucion_id"])
    metodo = parametros.metodo
    if metodo.id is None:
        raise HTTPException(
            status_code=503,
            detail="La base de datos no tiene métodos de cálculo. Aplica la migración backend/sql/001_fase1_modulos.sql",
        )
    puntaje, calificacion = evaluar(metodo, [(c, catalogo[c]["grupo"]) for c in d.observaciones], d.interferencia)

    fila = {
        "arbol_id": arbol["id"],
        "origen": origen,
        "lat": d.lat,
        "lng": d.lng,
        "precision_gps_m": d.precision_gps_m,
        "dap_cm": d.dap_cm,
        "altura_m": d.altura_m,
        "copa_m": d.copa_m,
        "etapa": d.etapa,
        "interferencia": d.interferencia,
        "interferencia_otra": d.interferencia_otra,
        "notas": d.notas,
        "metodo_id": metodo.id,
        "puntaje_riesgo": puntaje,
        "calificacion": calificacion,
    }
    creada = cliente.table("inspecciones").insert(fila).execute().data[0]

    if d.observaciones:
        try:
            cliente.table("inspeccion_observaciones").insert(
                [{"inspeccion_id": creada["id"], "observacion_codigo": c} for c in d.observaciones]
            ).execute()
        except Exception:
            db.get_admin().table("inspecciones").delete().eq("id", creada["id"]).execute()
            raise

    creada["_advertencias"] = _advertencias(d, parametros.precision_gps_max_m, arbol.get("lat"), arbol.get("lng"))
    return creada


def _advertencias(d: InspeccionCrear, precision_max: float, lat_arbol=None, lng_arbol=None) -> list[str]:
    avisos = []
    if d.precision_gps_m is not None and d.precision_gps_m > precision_max:
        avisos.append(
            f"La precisión del GPS ({d.precision_gps_m:g} m) es peor que el máximo recomendado de {precision_max:g} m"
        )
    if d.lat is not None and lat_arbol is not None and lng_arbol is not None:
        distancia = distancia_m(d.lat, d.lng, float(lat_arbol), float(lng_arbol))
        if distancia > DISTANCIA_AVISO_M:
            avisos.append(f"La ubicación capturada está a {distancia:.0f} m del punto registrado del árbol")
    return avisos


def distancia_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distancia sobre la superficie terrestre (fórmula del haversine)."""
    radio = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radio * math.asin(math.sqrt(a))


def motivo_no_revisable(perfil: Perfil, inspeccion: dict, institucion_arbol: str) -> str | None:
    if not perfil.es_revisor:
        return "Solo docentes y administradores revisan inspecciones"
    if inspeccion["estado_revision"] != "pendiente":
        return "La inspección ya fue revisada"
    if perfil.es_admin:
        return None
    if perfil.institucion_id != institucion_arbol:
        return "Solo puedes revisar inspecciones de tu institución"
    if inspeccion.get("inspector_id") == perfil.usuario_id:
        return "No puedes revisar tus propias inspecciones"
    return None


def armar(cliente, inspecciones: list[dict], arboles: dict[str, dict], perfil: Perfil | None = None) -> list[dict]:
    """Completa inspecciones con nombres, hallazgos, fotos, versión del método y cálculos."""
    if not inspecciones:
        return []
    ids = [str(i["id"]) for i in inspecciones]
    catalogo = datos.catalogo_observaciones(cliente)
    observaciones = datos.observaciones_por_inspeccion(cliente, ids)
    metodos = datos.metodos(cliente)

    personas = {i.get("inspector_id") for i in inspecciones} | {i.get("revisado_por") for i in inspecciones}
    personas.discard(None)
    nombres = {}
    if personas:
        filas = cliente.table("perfiles_publicos").select("usuario_id, nombre").in_("usuario_id", sorted(personas)).execute().data
        nombres = {f["usuario_id"]: f["nombre"] for f in filas}

    fotos_insp: dict[str, list[dict]] = {}
    for f in cliente.table("inspeccion_fotos").select("id, inspeccion_id, tipo, storage_path").in_("inspeccion_id", ids).execute().data:
        fotos_insp.setdefault(f["inspeccion_id"], []).append(f)
    arboles_con_registro = sorted({i["arbol_id"] for i in inspecciones if i["origen"] == "registro"})
    fotos_arbol: dict[str, list[dict]] = {}
    if arboles_con_registro:
        for f in cliente.table("arbol_fotos").select("id, arbol_id, tipo, storage_path").in_("arbol_id", arboles_con_registro).execute().data:
            fotos_arbol.setdefault(f["arbol_id"], []).append(f)
    admin = db.get_admin()

    resultado = []
    for i in inspecciones:
        arbol = arboles[i["arbol_id"]]
        metodo = metodos.get(str(i["metodo_id"])) or datos.metodo_por_defecto(metodos)
        codigos = observaciones.get(str(i["id"]), [])
        fotos = [
            FotoOut(id=str(f["id"]), tipo=f["tipo"], url=url_firmada(admin, f["storage_path"]))
            for f in fotos_insp.get(str(i["id"]), [])
        ]
        if i["origen"] == "registro":
            fotos = [
                FotoOut(id=str(f["id"]), tipo=f["tipo"], url=url_firmada(cliente, f["storage_path"]))
                for f in fotos_arbol.get(i["arbol_id"], [])
            ] + fotos
        valores = calcular_ambientales(metodo, float(i["dap_cm"]), float(i["altura_m"]), arbol["nombre_comun"])
        item = {
            **i,
            "id": str(i["id"]),
            "metodo_id": str(i["metodo_id"]),
            "metodo_version": metodo.version or None,
            "inspector_nombre": nombres.get(i.get("inspector_id")),
            "revisado_por_nombre": nombres.get(i.get("revisado_por")),
            "observaciones": [
                ObservacionOut(codigo=c, grupo=catalogo[c]["grupo"], etiqueta=catalogo[c]["etiqueta"])
                for c in codigos
                if c in catalogo
            ],
            "fotos": fotos,
            "biomasa_total_kg": valores["biomasa_total_kg"],
            "carbono_kg": valores["carbono_kg"],
            "co2_kg": valores["co2_kg"],
            "o2_kg": valores["o2_kg"],
            "advertencias": i.get("_advertencias", []),
            "fotos_sugeridas": ["completo", "detalle"] if codigos else ["completo"],
            "codigo": arbol["codigo"],
            "nombre_comun": arbol["nombre_comun"],
            "nombre_cientifico": arbol["nombre_cientifico"],
            "zona": arbol["zona"],
            "zona_otra": arbol.get("zona_otra"),
            "institucion_id": arbol["institucion_id"],
            "nombre_corto": arbol["nombre_corto"],
        }
        if perfil is not None:
            motivo = motivo_no_revisable(perfil, i, arbol["institucion_id"])
            item["puede_revisar"] = motivo is None
            item["motivo_no_revisable"] = motivo
        resultado.append(item)
    return resultado


def _inspeccion(cliente, inspeccion_id: str) -> dict:
    filas = cliente.table("inspecciones").select(datos.COLUMNAS_INSPECCION).eq("id", inspeccion_id).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")
    return filas[0]


# =================================== Endpoints ===================================
@router.get("/arboles/{arbol_id}/inspecciones", response_model=list[InspeccionOut])
def historial(arbol_id: UUID, perfil: Perfil = Depends(perfil_actual)):
    """Historial del árbol: todas sus inspecciones, de la más reciente a la más antigua
    (las anuladas también aparecen, marcadas como tales)."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    arbol = resumen_por_id(cliente, str(arbol_id))
    filas = traer_todo(
        cliente, "inspecciones", datos.COLUMNAS_INSPECCION, filtros=[("eq", ("arbol_id", str(arbol_id)))], orden="fecha, id"
    )
    filas.reverse()
    return armar(cliente, filas, {arbol["id"]: arbol})


@router.post("/arboles/{arbol_id}/inspecciones", response_model=InspeccionOut, status_code=201)
def crear_inspeccion(arbol_id: UUID, d: InspeccionCrear, perfil: Perfil = Depends(perfil_actual)):
    """Registra una visita de seguimiento. Queda pendiente de revisión hasta que un
    docente o administrador la confirme o la anule."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    arbol = resumen_por_id(cliente, str(arbol_id))
    creada = registrar_inspeccion(cliente, arbol, d, "seguimiento")
    return armar(cliente, [creada], {arbol["id"]: arbol})[0]


@router.get("/inspecciones/{inspeccion_id}", response_model=InspeccionConArbol)
def detalle_inspeccion(inspeccion_id: UUID, perfil: Perfil = Depends(perfil_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    inspeccion = _inspeccion(cliente, str(inspeccion_id))
    arbol = resumen_por_id(cliente, inspeccion["arbol_id"])
    return armar(cliente, [inspeccion], {arbol["id"]: arbol}, perfil)[0]


@router.post("/inspecciones/{inspeccion_id}/fotos", status_code=201)
def subir_foto_inspeccion(
    inspeccion_id: UUID,
    tipo: TipoFoto = Query(..., description="completo, detalle o adicional"),
    archivo: UploadFile = File(...),
    perfil: Perfil = Depends(perfil_actual),
):
    """Foto de una inspección. Solo quien la registró, mientras esté pendiente de revisión.
    Una 'completo', una 'detalle' y hasta 3 'adicional'; JPG, PNG o WebP de máximo 5 MB."""
    contenido, tipo_real, extension = leer_foto(archivo, comun.MAX_FOTO_BYTES)
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    inspeccion = _inspeccion(cliente, str(inspeccion_id))
    if inspeccion.get("inspector_id") != perfil.usuario_id:
        raise HTTPException(status_code=403, detail="Solo quien registró la inspección puede agregarle fotos")
    if inspeccion["estado_revision"] != "pendiente":
        raise HTTPException(status_code=409, detail="La inspección ya fue revisada: no admite fotos nuevas")

    existentes = cliente.table("inspeccion_fotos").select("id, tipo").eq("inspeccion_id", str(inspeccion_id)).execute().data
    if tipo == "adicional" and sum(1 for f in existentes if f["tipo"] == "adicional") >= MAX_FOTOS_ADICIONALES:
        raise HTTPException(status_code=409, detail="Ya hay 3 fotos adicionales")
    if tipo != "adicional" and any(f["tipo"] == tipo for f in existentes):
        raise HTTPException(status_code=409, detail="Esta inspección ya tiene una foto de ese tipo")

    admin = db.get_admin()
    ruta = f"{inspeccion['arbol_id']}/inspecciones/{inspeccion_id}/{uuid.uuid4().hex}.{extension}"
    admin.storage.from_(BUCKET_FOTOS).upload(ruta, contenido, {"content-type": tipo_real})
    try:
        fila = (
            cliente.table("inspeccion_fotos")
            .insert({"inspeccion_id": str(inspeccion_id), "tipo": tipo, "storage_path": ruta})
            .execute()
            .data[0]
        )
    except Exception:
        try:  # no dejar el archivo huérfano en Storage
            admin.storage.from_(BUCKET_FOTOS).remove([ruta])
        except Exception:
            pass
        raise
    return {"id": str(fila["id"]), "tipo": tipo, "storage_path": ruta}


@router.get("/revision/pendientes", response_model=PendientesOut)
def pendientes(
    institucion_id: str | None = None,
    limite: int = Query(20, ge=1, le=100),
    desplazamiento: int = Query(0, ge=0),
    perfil: Perfil = Depends(revisor_actual),
):
    """Inspecciones pendientes de revisión, de la más antigua a la más reciente.
    El docente ve solo las de su institución."""
    if not perfil.es_admin:
        if not perfil.institucion_id:
            raise HTTPException(status_code=409, detail="Tu perfil no tiene institución asignada. Habla con el administrador.")
        institucion_id = perfil.institucion_id
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    arboles = {a["id"]: a for a in datos.arboles(cliente, institucion_id)}
    filas = [
        i
        for i in datos.inspecciones(cliente, [("eq", ("estado_revision", "pendiente"))])
        if i["arbol_id"] in arboles
    ]
    filas.sort(key=lambda i: (i["fecha"], str(i["id"])))
    pagina = filas[desplazamiento:desplazamiento + limite]
    return PendientesOut(total=len(filas), items=armar(cliente, pagina, arboles, perfil))


def _revisar(inspeccion_id: str, perfil: Perfil, estado: str, comentario: str | None) -> dict:
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    inspeccion = _inspeccion(cliente, inspeccion_id)
    arbol = resumen_por_id(cliente, inspeccion["arbol_id"])
    motivo = motivo_no_revisable(perfil, inspeccion, arbol["institucion_id"])
    if motivo:
        codigo = 409 if inspeccion["estado_revision"] != "pendiente" else 403
        raise HTTPException(status_code=codigo, detail=motivo)
    actualizadas = (
        cliente.table("inspecciones")
        .update({"estado_revision": estado, "comentario_revision": comentario})
        .eq("id", inspeccion_id)
        .eq("estado_revision", "pendiente")
        .execute()
        .data
    )
    if not actualizadas:
        raise HTTPException(status_code=409, detail="La inspección ya fue revisada por otra persona")
    revisada = _inspeccion(cliente, inspeccion_id)
    return armar(cliente, [revisada], {arbol["id"]: arbol}, perfil)[0]


@router.post("/inspecciones/{inspeccion_id}/confirmar", response_model=InspeccionConArbol)
def confirmar(inspeccion_id: UUID, d: ConfirmarIn, perfil: Perfil = Depends(revisor_actual)):
    """Confirma una inspección pendiente: sus datos pasan a ser válidos y suma puntos a quien la hizo."""
    return _revisar(str(inspeccion_id), perfil, "confirmada", d.comentario)


@router.post("/inspecciones/{inspeccion_id}/anular", response_model=InspeccionConArbol)
def anular(inspeccion_id: UUID, d: AnularIn, perfil: Perfil = Depends(revisor_actual)):
    """Anula una inspección pendiente (con motivo). El árbol vuelve a tomar su estado de la
    inspección válida anterior."""
    return _revisar(str(inspeccion_id), perfil, "anulada", d.motivo)
