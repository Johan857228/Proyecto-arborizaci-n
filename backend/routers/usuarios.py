"""Perfil propio (nombre, foto y portada) y gestión de usuarios (rol, institución, curso y estado)."""
import uuid
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field, field_validator

import datos
import db
from auth import Perfil, perfil_actual, revisor_actual
from comun import BUCKET_FOTOS, MAX_FOTO_BYTES, leer_foto, url_firmada
from schemas import Rol

router = APIRouter(tags=["Usuarios"])


class PerfilOut(BaseModel):
    usuario_id: str
    nombre: str
    correo: str | None = None
    rol: Rol
    institucion_id: str | None = None
    curso_id: str | None = None
    activo: bool


class MiPerfilOut(PerfilOut):
    institucion_nombre: str | None = None
    curso_nombre: str | None = None
    foto_url: str | None = Field(default=None, description="Foto de perfil: URL firmada temporal (1 hora)")
    portada_url: str | None = Field(default=None, description="Foto de la portada del inicio: URL firmada temporal (1 hora)")


class MiPerfilEditar(BaseModel):
    nombre: str = Field(min_length=1, max_length=120)

    @field_validator("nombre")
    @classmethod
    def _limpiar(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Escribe tu nombre")
        return v


class UsuarioEditar(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=120)
    rol: Rol | None = None
    institucion_id: str | None = None
    curso_id: UUID | None = None
    activo: bool | None = None

    @field_validator("nombre")
    @classmethod
    def _limpiar(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("El nombre no puede quedar vacío")
        return v


COLUMNAS = "usuario_id, nombre, correo, rol, institucion_id, curso_id, activo"


# ============================ Foto de perfil y portada ============================
# Las imágenes van al bucket de fotos, en perfiles/<usuario>/, y su ruta se guarda en el
# app_metadata de Supabase Auth (no hace falta cambiar la base de datos). Solo el backend sube,
# firma y borra estos archivos, siempre dentro de la carpeta de quien hace la petición.
ImagenPerfil = Literal["foto", "portada"]
CLAVE_IMAGEN: dict[str, str] = {"foto": "foto_path", "portada": "portada_path"}


def _carpeta(perfil: Perfil) -> str:
    return f"perfiles/{perfil.usuario_id}/"


def _ruta_imagen(perfil: Perfil, imagen: str) -> str | None:
    """Ruta guardada de la imagen, solo si está en la carpeta de esa persona."""
    ruta = perfil.sesion.metadatos_app.get(CLAVE_IMAGEN[imagen])
    return ruta if isinstance(ruta, str) and ruta.startswith(_carpeta(perfil)) else None


def _url_imagen(perfil: Perfil, imagen: str) -> str | None:
    ruta = _ruta_imagen(perfil, imagen)
    return url_firmada(db.get_admin(), ruta) if ruta else None


def _borrar_archivo(ruta: str) -> None:
    try:
        db.get_admin().storage.from_(BUCKET_FOTOS).remove([ruta])
    except Exception:
        pass  # un archivo viejo que no se pudo borrar no impide el cambio


def _guardar_ruta(perfil: Perfil, imagen: str, ruta: str | None) -> None:
    """Guarda (o borra, con None) la ruta en el app_metadata del usuario."""
    clave = CLAVE_IMAGEN[imagen]
    db.get_admin().auth.admin.update_user_by_id(perfil.usuario_id, {"app_metadata": {clave: ruta}})
    if ruta is None:
        perfil.sesion.metadatos_app.pop(clave, None)
    else:
        perfil.sesion.metadatos_app[clave] = ruta


def _mi_perfil(cliente, perfil: Perfil) -> dict:
    instituciones = datos.instituciones(cliente)
    curso = None
    if perfil.curso_id:
        filas = cliente.table("cursos").select("id, nombre").eq("id", perfil.curso_id).execute().data
        curso = filas[0] if filas else None
    return {
        "usuario_id": perfil.usuario_id,
        "nombre": perfil.nombre,
        "correo": perfil.correo or perfil.sesion.email,
        "rol": perfil.rol,
        "institucion_id": perfil.institucion_id,
        "curso_id": perfil.curso_id,
        "activo": perfil.activo,
        "institucion_nombre": instituciones.get(perfil.institucion_id or "", {}).get("nombre_corto"),
        "curso_nombre": curso["nombre"] if curso else None,
        "foto_url": _url_imagen(perfil, "foto"),
        "portada_url": _url_imagen(perfil, "portada"),
    }


@router.get("/perfil", response_model=MiPerfilOut)
def mi_perfil(perfil: Perfil = Depends(perfil_actual)):
    """Quién soy: rol, institución y curso (el frontend muestra los módulos según el rol)."""
    return _mi_perfil(db.cliente_de_usuario(perfil.sesion.token), perfil)


@router.patch("/perfil", response_model=MiPerfilOut)
def editar_mi_perfil(d: MiPerfilEditar, perfil: Perfil = Depends(perfil_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    cliente.table("perfiles").update({"nombre": d.nombre}).eq("usuario_id", perfil.usuario_id).execute()
    perfil.nombre = d.nombre
    return _mi_perfil(cliente, perfil)


@router.put("/perfil/{imagen}", response_model=MiPerfilOut)
def cambiar_imagen(imagen: ImagenPerfil, archivo: UploadFile = File(...), perfil: Perfil = Depends(perfil_actual)):
    """Cambia la foto de perfil (`foto`) o la portada del inicio (`portada`).
    JPG, PNG o WebP de máximo 5 MB; reemplaza la anterior."""
    contenido, tipo_real, extension = leer_foto(archivo, MAX_FOTO_BYTES)
    anterior = _ruta_imagen(perfil, imagen)
    ruta = f"{_carpeta(perfil)}{imagen}-{uuid.uuid4().hex}.{extension}"
    db.get_admin().storage.from_(BUCKET_FOTOS).upload(ruta, contenido, {"content-type": tipo_real})
    try:
        _guardar_ruta(perfil, imagen, ruta)
    except Exception:
        _borrar_archivo(ruta)  # no dejar el archivo huérfano en Storage
        raise HTTPException(status_code=502, detail="No se pudo guardar la imagen. Intenta de nuevo.")
    if anterior:
        _borrar_archivo(anterior)
    return _mi_perfil(db.cliente_de_usuario(perfil.sesion.token), perfil)


@router.delete("/perfil/{imagen}", response_model=MiPerfilOut)
def quitar_imagen(imagen: ImagenPerfil, perfil: Perfil = Depends(perfil_actual)):
    """Quita la foto de perfil o la portada (el inicio vuelve a mostrar la foto del campus)."""
    anterior = _ruta_imagen(perfil, imagen)
    if anterior:
        try:
            _guardar_ruta(perfil, imagen, None)
        except Exception:
            raise HTTPException(status_code=502, detail="No se pudo quitar la imagen. Intenta de nuevo.")
        _borrar_archivo(anterior)
    return _mi_perfil(db.cliente_de_usuario(perfil.sesion.token), perfil)


@router.get("/usuarios", response_model=list[PerfilOut])
def listar(institucion_id: str | None = None, perfil: Perfil = Depends(revisor_actual)):
    """Administrador: todos (o los de una institución). Docente: los de su institución."""
    if not perfil.es_admin:
        institucion_id = perfil.institucion_id
        if not institucion_id:
            return []
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    consulta = cliente.table("perfiles").select(COLUMNAS)
    if institucion_id:
        consulta = consulta.eq("institucion_id", institucion_id)
    filas = consulta.order("nombre").execute().data
    return filas


@router.patch("/usuarios/{usuario_id}", response_model=PerfilOut)
def editar_usuario(usuario_id: UUID, d: UsuarioEditar, perfil: Perfil = Depends(revisor_actual)):
    """El administrador cambia nombre, rol, institución, curso y estado. El docente solo
    asigna o quita el curso a usuarios de su institución."""
    cambios = d.model_dump(mode="json", exclude_unset=True)
    if not cambios:
        raise HTTPException(status_code=422, detail="No hay cambios para guardar")
    for campo in ("nombre", "rol", "activo"):
        if campo in cambios and cambios[campo] is None:
            raise HTTPException(status_code=422, detail=f"El campo {campo} no puede quedar vacío")

    cliente = db.cliente_de_usuario(perfil.sesion.token)
    filas = cliente.table("perfiles").select(COLUMNAS).eq("usuario_id", str(usuario_id)).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    actual = filas[0]

    if not perfil.es_admin:
        if set(cambios) - {"curso_id"}:
            raise HTTPException(status_code=403, detail="Un docente solo puede asignar el curso")
        if actual.get("institucion_id") != perfil.institucion_id:
            raise HTTPException(status_code=403, detail="Solo puedes gestionar usuarios de tu institución")
    elif str(usuario_id) == perfil.usuario_id and (
        cambios.get("rol", "administrador") != "administrador" or cambios.get("activo") is False
    ):
        raise HTTPException(status_code=409, detail="No puedes quitarte el rol de administrador ni desactivar tu propia cuenta")

    if "institucion_id" in cambios:
        if cambios["institucion_id"] is not None and cambios["institucion_id"] not in datos.instituciones(cliente):
            raise HTTPException(status_code=422, detail="La institución no existe")
        if cambios["institucion_id"] != actual.get("institucion_id") and "curso_id" not in cambios:
            cambios["curso_id"] = None  # el curso anterior era de otra institución

    institucion_final = cambios.get("institucion_id", actual.get("institucion_id"))
    if cambios.get("curso_id"):
        cursos = cliente.table("cursos").select("id, institucion_id").eq("id", cambios["curso_id"]).execute().data
        if not cursos:
            raise HTTPException(status_code=422, detail="El curso no existe")
        if cursos[0]["institucion_id"] != institucion_final:
            raise HTTPException(status_code=422, detail="El curso no pertenece a la institución del usuario")

    actualizadas = cliente.table("perfiles").update(cambios).eq("usuario_id", str(usuario_id)).execute().data
    if not actualizadas:
        raise HTTPException(status_code=403, detail="No tienes permiso para editar este usuario")
    return actualizadas[0]
