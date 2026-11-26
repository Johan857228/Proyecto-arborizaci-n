"""Zonas de cada sede (patio, cancha, salones...), que define la propia institución.

Hasta la migración 016 eran cinco fijas para todos los colegios. Ahora cada institución tiene las
suyas: las crea, renombra o borra un docente de esa institución o el administrador. "Otra" no es una
zona guardada: siempre está disponible y lleva el nombre en zona_otra.

Cada zona tiene un tipo y, si se dibujó en el plano del colegio, un contorno: la lista de esquinas
[latitud, longitud] tocadas sobre el mapa. Con el contorno la app pinta las zonas en el mapa y elige
sola la zona de un árbol nuevo a partir de su GPS.

Sin la migración 016 todo sigue funcionando con las zonas de siempre, pero no se pueden editar.
"""
from collections import Counter
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field, field_validator

import datos
import db
from auth import Perfil, perfil_actual
from comun import es_columna_faltante, traer_todo
from routers.inspecciones import distancia_m
from schemas import LAT_MAX, LAT_MIN, LNG_MAX, LNG_MIN, ZONA_OTRA, ZONAS_POR_DEFECTO, Zona

router = APIRouter(tags=["Zonas"])

TABLA = "zonas"
MAX_ZONAS = 30
MAX_PUNTOS = 100
# Un contorno debe quedar cerca de la sede: más lejos casi siempre es un toque en el lugar equivocado.
DISTANCIA_MAX_SEDE_M = 2000
SIN_MIGRACION = "Para editar las zonas aplica la migración backend/sql/016_zonas_y_bajas.sql"
SIN_COLUMNAS = "Para dibujar las zonas vuelve a aplicar la migración backend/sql/016_zonas_y_bajas.sql (agrega tipo y contorno)"

TipoZona = Literal["patio", "cancha", "salones", "biblioteca", "entrada", "parqueadero", "otro"]
TIPO_POR_DEFECTO: dict[str, str] = {
    "Patio central": "patio", "Entrada principal": "entrada", "Zona deportiva": "cancha", "Bloques académicos": "salones",
}


class ZonaIn(BaseModel):
    nombre: Zona
    tipo: TipoZona = "patio"


class ZonaEditar(BaseModel):
    nombre: Zona | None = None
    tipo: TipoZona | None = None


class ContornoIn(BaseModel):
    """Esquinas del área en orden, como [latitud, longitud]. null quita la zona del plano."""

    contorno: list[tuple[float, float]] | None = Field(default=None, max_length=MAX_PUNTOS)

    @field_validator("contorno")
    @classmethod
    def _validar(cls, v):
        if v is None:
            return v
        puntos = []
        for lat, lng in v:
            if not (LAT_MIN <= lat <= LAT_MAX and LNG_MIN <= lng <= LNG_MAX):
                raise ValueError("Cada esquina debe estar dentro de Colombia")
            punto = (round(lat, 7), round(lng, 7))
            if not puntos or puntos[-1] != punto:  # un doble toque en el mismo sitio no es otra esquina
                puntos.append(punto)
        if len(puntos) > 1 and puntos[0] == puntos[-1]:
            puntos.pop()
        if len(puntos) < 3:
            raise ValueError("Marca al menos tres esquinas distintas")
        return puntos


class ZonaOut(BaseModel):
    id: str | None = None
    nombre: str
    tipo: TipoZona = "patio"
    contorno: list[tuple[float, float]] | None = None
    orden: int = 0
    arboles: int = 0
    cursos: int = 0


class ZonasOut(BaseModel):
    institucion_id: str
    # False si falta la migración 016: se muestran las de siempre y no se pueden cambiar.
    editable: bool
    puede_editar: bool
    zonas: list[ZonaOut]


def es_tabla_faltante(error: APIError) -> bool:
    return str(getattr(error, "code", "") or "") in ("42P01", "PGRST205")


def _filas(cliente, institucion_id: str) -> list[dict] | None:
    """Zonas guardadas de la institución, en orden. None si falta la tabla (migración 016). Si la
    tabla es de una versión anterior de la 016, sin tipo ni contorno, se completan con lo de siempre."""
    def consulta(columnas: str):
        return cliente.table(TABLA).select(columnas).eq("institucion_id", institucion_id).order("orden").order("nombre").execute().data
    try:
        return consulta("id, nombre, orden, tipo, contorno")
    except APIError as error:
        if es_tabla_faltante(error):
            return None
        if not es_columna_faltante(error):
            raise
    return [{**f, "tipo": TIPO_POR_DEFECTO.get(f["nombre"], "patio"), "contorno": None} for f in consulta("id, nombre, orden")]


def _insertar(admin, filas: list[dict]) -> None:
    try:
        admin.table(TABLA).insert(filas).execute()
    except APIError as error:
        if not es_columna_faltante(error):
            raise
        admin.table(TABLA).insert([{k: v for k, v in f.items() if k != "tipo"} for f in filas]).execute()


def _asegurar(institucion_id: str) -> list[dict] | None:
    """Las zonas de la institución; si es nueva y aún no tiene, se le crean las de siempre."""
    admin = db.get_admin()
    filas = _filas(admin, institucion_id)
    if filas is None or filas:
        return filas
    _insertar(admin, [{"institucion_id": institucion_id, "nombre": nombre, "tipo": TIPO_POR_DEFECTO.get(nombre, "patio"), "orden": i}
                      for i, nombre in enumerate(ZONAS_POR_DEFECTO, 1)])
    return _filas(admin, institucion_id)


def nombres_de_zonas(institucion_id: str) -> list[str]:
    """Nombres de las zonas de la institución (sin "Otra")."""
    filas = _asegurar(institucion_id)
    return list(ZONAS_POR_DEFECTO) if filas is None else [f["nombre"] for f in filas]


def zona_valida(institucion_id: str, zona: str) -> bool:
    return zona == ZONA_OTRA or zona in nombres_de_zonas(institucion_id)


def _respuesta(cliente, perfil: Perfil, institucion_id: str) -> dict:
    filas = _asegurar(institucion_id)
    arboles = Counter(
        f.get("zona") for f in traer_todo(cliente, "arboles_resumen", "id, zona", filtros=[("eq", ("institucion_id", institucion_id))])
    )
    cursos = Counter(zona for curso in datos.cursos(cliente, institucion_id).values() for zona in curso.get("zonas", []))
    editable = filas is not None
    lista = filas if editable else [
        {"id": None, "nombre": n, "orden": i, "tipo": TIPO_POR_DEFECTO.get(n, "patio"), "contorno": None}
        for i, n in enumerate(ZONAS_POR_DEFECTO, 1)
    ]
    return {
        "institucion_id": institucion_id,
        "editable": editable,
        "puede_editar": editable and perfil.gestiona(institucion_id),
        "zonas": [
            {"id": str(f["id"]) if f.get("id") else None, "nombre": f["nombre"], "tipo": f.get("tipo") or "patio",
             "contorno": f.get("contorno"), "orden": f.get("orden") or 0,
             "arboles": arboles.get(f["nombre"], 0), "cursos": cursos.get(f["nombre"], 0)}
            for f in lista
        ],
    }


def _exigir_gestion(perfil: Perfil, institucion_id: str) -> None:
    if not perfil.gestiona(institucion_id):
        raise HTTPException(status_code=403, detail="Solo un docente de esta institución o un administrador puede cambiar sus zonas")


def _zona(zona_id: UUID) -> dict:
    try:
        filas = db.get_admin().table(TABLA).select("id, institucion_id, nombre, orden").eq("id", str(zona_id)).execute().data
    except APIError as error:
        if es_tabla_faltante(error):
            raise HTTPException(status_code=503, detail=SIN_MIGRACION)
        raise
    if not filas:
        raise HTTPException(status_code=404, detail="Zona no encontrada")
    return filas[0]


def _repetida(nombre: str, existentes: list[dict], salvo: str | None = None) -> bool:
    clave = nombre.strip().lower()
    return clave == ZONA_OTRA.lower() or any(f["nombre"].strip().lower() == clave and str(f["id"]) != salvo for f in existentes)


def _cursos_de(cliente, institucion_id: str) -> list[str]:
    return list(datos.cursos(cliente, institucion_id))


def _actualizar(admin, zona_id: UUID, cambios: dict) -> None:
    try:
        admin.table(TABLA).update(cambios).eq("id", str(zona_id)).execute()
    except APIError as error:
        if es_columna_faltante(error):
            raise HTTPException(status_code=503, detail=SIN_COLUMNAS)
        raise


@router.get("/instituciones/{institucion_id}/zonas", response_model=ZonasOut)
def listar(institucion_id: str, perfil: Perfil = Depends(perfil_actual)):
    """Zonas de la institución con su tipo, su contorno y cuántos árboles y cursos tiene cada una."""
    perfil.institucion_para_leer(institucion_id)
    return _respuesta(db.cliente_de_usuario(perfil.sesion.token), perfil, institucion_id)


@router.post("/instituciones/{institucion_id}/zonas", response_model=ZonasOut, status_code=201)
def crear(institucion_id: str, d: ZonaIn, perfil: Perfil = Depends(perfil_actual)):
    _exigir_gestion(perfil, institucion_id)
    filas = _asegurar(institucion_id)
    if filas is None:
        raise HTTPException(status_code=503, detail=SIN_MIGRACION)
    if _repetida(d.nombre, filas):
        raise HTTPException(status_code=409, detail=f"Ya existe la zona «{d.nombre}»")
    if len(filas) >= MAX_ZONAS:
        raise HTTPException(status_code=409, detail=f"Una institución puede tener hasta {MAX_ZONAS} zonas")
    orden = max((f.get("orden") or 0 for f in filas), default=0) + 1
    _insertar(db.get_admin(), [{"institucion_id": institucion_id, "nombre": d.nombre, "tipo": d.tipo, "orden": orden}])
    return _respuesta(db.cliente_de_usuario(perfil.sesion.token), perfil, institucion_id)


@router.patch("/zonas/{zona_id}", response_model=ZonasOut)
def editar(zona_id: UUID, d: ZonaEditar, perfil: Perfil = Depends(perfil_actual)):
    """Cambia el nombre o el tipo de la zona. Con un nombre nuevo, sus árboles y los cursos que la
    tienen asignada pasan a ese nombre."""
    zona = _zona(zona_id)
    institucion_id = zona["institucion_id"]
    _exigir_gestion(perfil, institucion_id)
    admin = db.get_admin()
    if d.tipo is not None:
        _actualizar(admin, zona_id, {"tipo": d.tipo})

    anterior = zona["nombre"]
    if d.nombre is not None and d.nombre != anterior:
        if _repetida(d.nombre, _filas(admin, institucion_id) or [], salvo=str(zona["id"])):
            raise HTTPException(status_code=409, detail=f"Ya existe la zona «{d.nombre}»")
        admin.table(TABLA).update({"nombre": d.nombre}).eq("id", str(zona_id)).execute()
        admin.table("arboles").update({"zona": d.nombre}).eq("institucion_id", institucion_id).eq("zona", anterior).execute()
        cursos = _cursos_de(db.cliente_de_usuario(perfil.sesion.token), institucion_id)
        if cursos:
            admin.table("curso_zonas").update({"zona": d.nombre}).in_("curso_id", cursos).eq("zona", anterior).execute()
    return _respuesta(db.cliente_de_usuario(perfil.sesion.token), perfil, institucion_id)


@router.put("/zonas/{zona_id}/contorno", response_model=ZonasOut)
def dibujar(zona_id: UUID, d: ContornoIn, perfil: Perfil = Depends(perfil_actual)):
    """Guarda el contorno de la zona en el plano del colegio (o lo quita con null). Las esquinas
    deben quedar a menos de 2 km de la sede."""
    zona = _zona(zona_id)
    institucion_id = zona["institucion_id"]
    _exigir_gestion(perfil, institucion_id)
    admin = db.get_admin()
    if d.contorno:
        filas = admin.table("instituciones").select("nombre_corto, lat, lng").eq("id", institucion_id).execute().data
        sede = filas[0] if filas else {}
        if sede.get("lat") is not None and sede.get("lng") is not None:
            lejos = max(distancia_m(lat, lng, float(sede["lat"]), float(sede["lng"])) for lat, lng in d.contorno)
            if lejos > DISTANCIA_MAX_SEDE_M:
                raise HTTPException(
                    status_code=422,
                    detail=f"El contorno queda a {lejos / 1000:.1f} km de {sede.get('nombre_corto') or 'la sede'}: dibújalo sobre el colegio",
                )
    _actualizar(admin, zona_id, {"contorno": [list(p) for p in d.contorno] if d.contorno else None})
    return _respuesta(db.cliente_de_usuario(perfil.sesion.token), perfil, institucion_id)


@router.delete("/zonas/{zona_id}", response_model=ZonasOut)
def borrar(
    zona_id: UUID,
    mover_a: str | None = Query(None, max_length=60, description="Zona a la que pasan sus árboles, si tiene"),
    perfil: Perfil = Depends(perfil_actual),
):
    """Borra una zona. Si tiene árboles, hay que decir a qué otra zona pasan (`mover_a`). Los cursos
    que la tenían asignada la pierden."""
    zona = _zona(zona_id)
    institucion_id = zona["institucion_id"]
    _exigir_gestion(perfil, institucion_id)
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    admin = db.get_admin()
    con_arboles = traer_todo(
        cliente, "arboles_resumen", "id", filtros=[("eq", ("institucion_id", institucion_id)), ("eq", ("zona", zona["nombre"]))]
    )
    if con_arboles:
        n = len(con_arboles)
        otras = [nombre for nombre in nombres_de_zonas(institucion_id) if nombre != zona["nombre"]]
        if not mover_a:
            raise HTTPException(
                status_code=409,
                detail=f"«{zona['nombre']}» tiene {n} {'árbol' if n == 1 else 'árboles'}: elige a qué zona pasarlos antes de borrarla.",
            )
        if mover_a not in otras:
            raise HTTPException(status_code=422, detail=f"«{mover_a}» no es otra zona de esta institución")
        admin.table("arboles").update({"zona": mover_a}).eq("institucion_id", institucion_id).eq("zona", zona["nombre"]).execute()
    cursos = _cursos_de(cliente, institucion_id)
    if cursos:
        admin.table("curso_zonas").delete().in_("curso_id", cursos).eq("zona", zona["nombre"]).execute()
    admin.table(TABLA).delete().eq("id", str(zona_id)).execute()
    return _respuesta(cliente, perfil, institucion_id)
