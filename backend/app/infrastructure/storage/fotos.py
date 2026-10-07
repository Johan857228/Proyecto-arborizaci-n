"""Almacenamiento de fotografías en disco.

La base de datos solo guarda la ruta y los datos de cada foto; el archivo vive en
STORAGE_PATH. Para usar otro proveedor (por ejemplo S3) basta con otra clase que
tenga los mismos métodos.
"""

import io
import uuid
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, UnidentifiedImageError

FORMATOS = {
    "JPEG": ("image/jpeg", ".jpg"),
    "PNG": ("image/png", ".png"),
    "WEBP": ("image/webp", ".webp"),
}


@dataclass(frozen=True)
class ImagenVerificada:
    mime: str
    extension: str
    ancho: int
    alto: int


def verificar_imagen(contenido: bytes) -> ImagenVerificada | None:
    """Revisa que el archivo sea de verdad una imagen JPEG, PNG o WebP (no solo por el nombre)."""
    try:
        with Image.open(io.BytesIO(contenido)) as imagen:
            formato = imagen.format
            ancho, alto = imagen.size
            imagen.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        return None
    if formato not in FORMATOS:
        return None
    mime, extension = FORMATOS[formato]
    return ImagenVerificada(mime, extension, ancho, alto)


class AlmacenFotos:
    def __init__(self, carpeta: Path):
        self.carpeta = Path(carpeta).resolve()

    def guardar(self, subcarpeta: str, tipo: str, contenido: bytes, extension: str) -> str:
        """Escribe el archivo y devuelve su ruta relativa a la carpeta de fotos."""
        relativa = Path(subcarpeta) / f"{tipo}-{uuid.uuid4().hex}{extension}"
        destino = self.ruta(relativa.as_posix())
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_bytes(contenido)
        return relativa.as_posix()

    def ruta(self, relativa: str) -> Path:
        """Ruta absoluta de un archivo, sin permitir salirse de la carpeta de fotos."""
        destino = (self.carpeta / relativa).resolve()
        if not destino.is_relative_to(self.carpeta):
            raise ValueError(f"Ruta de foto fuera del almacenamiento: {relativa}")
        return destino

    def borrar(self, relativas: list[str]) -> None:
        for relativa in relativas:
            self.ruta(relativa).unlink(missing_ok=True)
