"""Exportación abierta de los datos de una institución y códigos DANE de las sedes.

- POST /exportar: genera el archivo (CSV, GeoJSON, Shapefile o el paquete completo en ZIP), lo
  deja en Storage y devuelve un enlace de descarga que vence en 10 minutos. Así funciona igual
  en web y en el teléfono (se abre en el navegador), sin poner el token en ninguna URL.
- GET /exportar/diccionario: qué significa cada columna.
- GET /instituciones y PATCH /instituciones/{id}: código DANE, DIVIPOLA y municipio de cada sede.
"""
import io
import zipfile
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field, field_validator, model_validator

import datos
import db
from auth import Perfil, admin_actual, perfil_actual, revisor_actual
from comun import BUCKET_FOTOS, ahora
from servicios import exportacion

router = APIRouter(tags=["Datos abiertos"])

Conjunto = Literal["arboles", "inspecciones", "intervenciones", "todo"]
Formato = Literal["csv", "geojson", "shp", "zip"]
TIPOS_MIME = {"csv": "text/csv", "geojson": "application/geo+json", "shp": "application/zip", "zip": "application/zip"}
EXTENSION = {"csv": "csv", "geojson": "geojson", "shp": "zip", "zip": "zip"}
VIGENCIA_ENLACE_S = 600
COLUMNAS_INSTITUCION = "id, nombre, nombre_corto, prefijo, codigo_dane, divipola, municipio"


# ==================================== Instituciones ====================================
class InstitucionOut(BaseModel):
    id: str
    nombre: str
    nombre_corto: str
    prefijo: str
    codigo_dane: str | None = None
    divipola: str | None = None
    municipio: str | None = None


class InstitucionEditar(BaseModel):
    codigo_dane: str | None = Field(default=None, description="12 dígitos; vacío para quitarlo")
    divipola: str | None = Field(default=None, description="5 dígitos; vacío para quitarlo")
    municipio: str | None = Field(default=None, max_length=80)

    @field_validator("codigo_dane", "divipola", "municipio", mode="before")
    @classmethod
    def _vacio(cls, v):
        if isinstance(v, str):
            v = " ".join(v.split())
            return v or None
        return v

    @field_validator("codigo_dane")
    @classmethod
    def _dane(cls, v: str | None) -> str | None:
        if v is not None and not (len(v) == 12 and v.isdigit()):
            raise ValueError("El código DANE de la sede tiene 12 dígitos")
        return v

    @field_validator("divipola")
    @classmethod
    def _divipola(cls, v: str | None) -> str | None:
        if v is not None and not (len(v) == 5 and v.isdigit()):
            raise ValueError("El código DIVIPOLA del municipio tiene 5 dígitos (Valledupar: 20001)")
        return v

    @field_validator("municipio")
    @classmethod
    def _municipio(cls, v: str | None) -> str | None:
        if v is not None and len(v) < 2:
            raise ValueError("Escribe el nombre del municipio")
        return v


def instituciones_con_dane() -> dict[str, dict]:
    """Instituciones con su código DANE. Sin la migración 006 se devuelven sin códigos."""
    admin = db.get_admin()
    try:
        filas = admin.table("instituciones").select(COLUMNAS_INSTITUCION).order("prefijo").execute().data
    except APIError:
        filas = admin.table("instituciones").select("id, nombre, nombre_corto, prefijo").order("prefijo").execute().data
    return {str(f["id"]): f for f in filas}


@router.get("/instituciones", response_model=list[InstitucionOut])
def listar_instituciones(perfil: Perfil = Depends(perfil_actual)):
    """Sedes con su código DANE, DIVIPOLA y municipio."""
    return list(instituciones_con_dane().values())


@router.patch("/instituciones/{institucion_id}", response_model=InstitucionOut)
def editar_institucion(institucion_id: str, d: InstitucionEditar, perfil: Perfil = Depends(admin_actual)):
    """Asigna el código DANE de la sede, el DIVIPOLA y el municipio (solo administradores)."""
    if institucion_id not in instituciones_con_dane():
        raise HTTPException(status_code=404, detail="Institución no encontrada")
    try:
        filas = (
            db.get_admin().table("instituciones")
            .update(d.model_dump(include=d.model_fields_set))
            .eq("id", institucion_id)
            .execute()
            .data
        )
    except APIError as error:
        if str(getattr(error, "code", "")) == "23505":
            raise HTTPException(status_code=409, detail="Ese código DANE ya está asignado a otra sede")
        raise
    if not filas:
        raise HTTPException(status_code=404, detail="Institución no encontrada")
    return {**instituciones_con_dane()[institucion_id], **filas[0]}


# ==================================== Exportar ====================================
class ExportarIn(BaseModel):
    conjunto: Conjunto
    formato: Formato
    institucion_id: str | None = Field(default=None, description="Vacío = todas (solo administradores)")

    @model_validator(mode="after")
    def _combinacion(self):
        if self.conjunto == "todo" and self.formato != "zip":
            raise ValueError("El paquete completo se descarga en ZIP")
        if self.formato == "zip" and self.conjunto != "todo":
            raise ValueError("Elige CSV, GeoJSON o Shapefile para un solo conjunto")
        if self.formato in ("geojson", "shp") and self.conjunto != "arboles":
            raise ValueError("GeoJSON y Shapefile están disponibles para el inventario de árboles")
        return self


class ExportarOut(BaseModel):
    url: str
    nombre: str
    conjunto: Conjunto
    formato: Formato
    filas: int
    generado_en: str
    vence_en_segundos: int
    sin_codigo_dane: list[str] = Field(default_factory=list, description="Sedes incluidas que aún no tienen código DANE")


@router.get("/exportar/diccionario")
def diccionario_de_datos(perfil: Perfil = Depends(perfil_actual)):
    """Qué significa cada columna de los archivos exportados."""
    return {
        "conjuntos": {clave: descripcion for clave, (descripcion, _c) in exportacion.CONJUNTOS.items()},
        "campos": exportacion.diccionario(),
        "sistema_de_coordenadas": "WGS84 (EPSG:4326)",
    }


def _datos(cliente, institucion_id: str | None, conjunto: str):
    arboles = datos.arboles(cliente, institucion_id)
    por_id = {str(a["id"]): a for a in arboles}
    inspecciones = observaciones = intervenciones = None
    if conjunto in ("inspecciones", "todo"):
        inspecciones = [i for i in datos.inspecciones(cliente) if str(i["arbol_id"]) in por_id]
        observaciones = datos.observaciones_por_inspeccion(cliente, [str(i["id"]) for i in inspecciones]) if inspecciones else {}
    if conjunto in ("intervenciones", "todo"):
        intervenciones = [v for v in datos.intervenciones(cliente) if str(v["arbol_id"]) in por_id]
    return arboles, por_id, inspecciones, observaciones, intervenciones


@router.post("/exportar", response_model=ExportarOut)
def exportar(d: ExportarIn, perfil: Perfil = Depends(revisor_actual)):
    """Genera el archivo y devuelve un enlace de descarga (vence en 10 minutos). El docente
    exporta su institución; el administrador, la que elija o todas."""
    institucion_id = d.institucion_id if perfil.es_admin else perfil.institucion_id
    if not perfil.es_admin and not institucion_id:
        raise HTTPException(status_code=422, detail="Tu cuenta no tiene institución asignada")
    instituciones = instituciones_con_dane()
    if institucion_id and institucion_id not in instituciones:
        raise HTTPException(status_code=404, detail="Institución no encontrada")

    cliente = db.cliente_de_usuario(perfil.sesion.token)
    arboles, por_id, inspecciones, observaciones, intervenciones = _datos(cliente, institucion_id, d.conjunto)
    generado = ahora()
    prefijo = instituciones[institucion_id]["prefijo"] if institucion_id else "todas"
    base = f"arbolado-{prefijo}-{d.conjunto}-{generado.date().isoformat()}"

    filas_a = exportacion.filas_arboles(arboles, instituciones)
    if d.conjunto == "arboles":
        campos = exportacion.CAMPOS_ARBOLES
        filas = len(filas_a)
        if d.formato == "csv":
            contenido = exportacion.a_csv(filas_a, campos)
        elif d.formato == "geojson":
            contenido = exportacion.a_geojson(filas_a, campos)
        else:
            contenido = exportacion.a_shapefile(filas_a, campos, base, generado.date())
    elif d.conjunto == "inspecciones":
        filas_i = exportacion.filas_inspecciones(inspecciones or [], por_id, observaciones or {}, instituciones)
        filas, contenido = len(filas_i), exportacion.a_csv(filas_i, exportacion.CAMPOS_INSPECCIONES)
    elif d.conjunto == "intervenciones":
        filas_v = exportacion.filas_intervenciones(intervenciones or [], por_id, instituciones)
        filas, contenido = len(filas_v), exportacion.a_csv(filas_v, exportacion.CAMPOS_INTERVENCIONES)
    else:
        filas_i = exportacion.filas_inspecciones(inspecciones or [], por_id, observaciones or {}, instituciones)
        filas_v = exportacion.filas_intervenciones(intervenciones or [], por_id, instituciones)
        alcance = instituciones[institucion_id]["nombre"] if institucion_id else "Todas las instituciones"
        paquete = io.BytesIO()
        with zipfile.ZipFile(paquete, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("LEEME.txt", exportacion.leeme(alcance, generado, {"arboles": len(filas_a), "inspecciones": len(filas_i), "intervenciones": len(filas_v)}))
            z.writestr("arboles.csv", exportacion.a_csv(filas_a, exportacion.CAMPOS_ARBOLES))
            z.writestr("arboles.geojson", exportacion.a_geojson(filas_a, exportacion.CAMPOS_ARBOLES))
            with zipfile.ZipFile(io.BytesIO(exportacion.a_shapefile(filas_a, exportacion.CAMPOS_ARBOLES, "arboles", generado.date()))) as shp:
                for interno in shp.namelist():
                    z.writestr(f"arboles_shp/{interno}", shp.read(interno))
            z.writestr("inspecciones.csv", exportacion.a_csv(filas_i, exportacion.CAMPOS_INSPECCIONES))
            z.writestr("intervenciones.csv", exportacion.a_csv(filas_v, exportacion.CAMPOS_INTERVENCIONES))
            z.writestr("diccionario.csv", exportacion.a_csv_diccionario())
        filas, contenido = len(filas_a) + len(filas_i) + len(filas_v), paquete.getvalue()

    nombre = f"{base}.{EXTENSION[d.formato]}"
    # Un archivo por persona y tipo de exportación: el siguiente reemplaza al anterior.
    ruta = f"exportaciones/{perfil.usuario_id}/{d.conjunto}-{d.formato}.{EXTENSION[d.formato]}"
    almacen = db.get_admin().storage.from_(BUCKET_FOTOS)
    almacen.upload(ruta, contenido, {"content-type": TIPOS_MIME[d.formato], "upsert": "true"})
    firmada = almacen.create_signed_url(ruta, VIGENCIA_ENLACE_S, {"download": nombre})
    url = firmada.get("signedURL") or firmada.get("signedUrl")
    if not url:
        raise HTTPException(status_code=502, detail="No se pudo preparar la descarga. Intenta de nuevo.")

    usadas = {str(a.get("institucion_id")) for a in arboles} or ({institucion_id} if institucion_id else set())
    sin_dane = sorted(instituciones[i]["nombre_corto"] for i in usadas if i in instituciones and not instituciones[i].get("codigo_dane"))
    return ExportarOut(
        url=url, nombre=nombre, conjunto=d.conjunto, formato=d.formato, filas=filas,
        generado_en=generado.isoformat(), vence_en_segundos=VIGENCIA_ENLACE_S, sin_codigo_dane=sin_dane,
    )
