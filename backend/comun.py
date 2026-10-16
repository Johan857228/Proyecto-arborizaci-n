"""Utilidades compartidas por main.py y los routers: fechas, consultas paginadas y fotos."""
from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException

# Colombia no tiene horario de verano: UTC-5 todo el año.
ZONA_HORARIA = timezone(timedelta(hours=-5), "America/Bogota")

BUCKET_FOTOS = "fotos-arboles"
MAX_FOTO_BYTES = 5 * 1024 * 1024
MAX_FOTOS_ADICIONALES = 3
EXTENSIONES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


# ==================================== Fechas =====================================
def ahora() -> datetime:
    return datetime.now(ZONA_HORARIA)


def hoy() -> date:
    return ahora().date()


def inicio_del_dia(dia: date) -> datetime:
    return datetime.combine(dia, time.min, ZONA_HORARIA)


def fin_del_dia(dia: date) -> datetime:
    return datetime.combine(dia, time.max, ZONA_HORARIA)


def a_fecha_hora(valor) -> datetime | None:
    """Convierte el texto ISO 8601 que devuelve Supabase en datetime con zona horaria."""
    if valor is None or isinstance(valor, datetime):
        return valor
    texto = str(valor).replace("Z", "+00:00")
    resultado = datetime.fromisoformat(texto)
    return resultado if resultado.tzinfo else resultado.replace(tzinfo=timezone.utc)


def a_fecha(valor) -> date | None:
    if valor is None or isinstance(valor, date):
        return valor
    return date.fromisoformat(str(valor)[:10])


def fecha_local(valor) -> date | None:
    """Día calendario en Colombia de una fecha y hora guardada en UTC."""
    momento = a_fecha_hora(valor)
    return momento.astimezone(ZONA_HORARIA).date() if momento else None


def validar_periodo(desde: date | None, hasta: date | None, dias_por_defecto: int = 365) -> tuple[date, date]:
    """Periodo [desde, hasta] en días calendario; por defecto el último año hasta hoy."""
    hasta = hasta or hoy()
    desde = desde or (hasta - timedelta(days=dias_por_defecto - 1))
    if desde > hasta:
        raise HTTPException(status_code=422, detail="La fecha inicial no puede ser posterior a la final")
    return desde, hasta


# =================================== Consultas ===================================
def traer_todo(cliente, tabla: str, columnas: str = "*", filtros=(), orden: str = "id", tam: int = 1000) -> list[dict]:
    """PostgREST devuelve máximo 1000 filas por petición: se pide por páginas, en orden estable.

    filtros: lista de (método, argumentos), p. ej. [("eq", ("institucion_id", "sj"))].
    orden: una o varias columnas separadas por coma que identifiquen cada fila.
    """
    filas: list[dict] = []
    inicio = 0
    while True:
        consulta = cliente.table(tabla).select(columnas)
        for metodo, argumentos in filtros:
            consulta = getattr(consulta, metodo)(*argumentos)
        for columna in orden.split(","):
            consulta = consulta.order(columna.strip())
        lote = consulta.range(inicio, inicio + tam - 1).execute().data
        filas.extend(lote)
        if len(lote) < tam:
            return filas
        inicio += tam


def resumen_por_id(cliente, arbol_id: str) -> dict:
    filas = cliente.table("arboles_resumen").select("*").eq("id", arbol_id).execute().data
    if not filas:
        raise HTTPException(status_code=404, detail="Árbol no encontrado")
    return filas[0]


def url_firmada(cliente, ruta: str, segundos: int = 3600) -> str | None:
    try:
        r = cliente.storage.from_(BUCKET_FOTOS).create_signed_url(ruta, segundos)
        return r.get("signedURL") or r.get("signedUrl")
    except Exception:
        return None


def urls_firmadas(cliente, rutas: list[str], segundos: int = 3600) -> dict[str, str]:
    """Firma varias fotos en una sola llamada a Storage. Las que fallen quedan sin URL:
    una foto perdida no debe tumbar una lista completa."""
    rutas = list(dict.fromkeys(r for r in rutas if r))
    if not rutas:
        return {}
    try:
        respuesta = cliente.storage.from_(BUCKET_FOTOS).create_signed_urls(rutas, segundos)
    except Exception:
        return {}
    firmadas = {}
    for item in respuesta or []:
        url = item.get("signedURL") or item.get("signedUrl")
        if item.get("path") and url and not item.get("error"):
            firmadas[item["path"]] = url
    return firmadas


def portadas_de_arboles(cliente, arbol_ids: list[str], tam: int = 100) -> dict[str, str]:
    """Foto general más reciente de cada árbol: la de su última inspección de seguimiento no
    anulada que tenga una, o si no la del registro. Devuelve {arbol_id: URL firmada}."""
    rutas: dict[str, str] = {}
    for inicio in range(0, len(arbol_ids), tam):
        grupo = arbol_ids[inicio:inicio + tam]
        for foto in (
            cliente.table("arbol_fotos").select("arbol_id, storage_path")
            .in_("arbol_id", grupo).eq("tipo", "completo").execute().data
        ):
            rutas[foto["arbol_id"]] = foto["storage_path"]
        visitas = (
            cliente.table("inspecciones").select("id, arbol_id, fecha")
            .in_("arbol_id", grupo).eq("origen", "seguimiento").neq("estado_revision", "anulada")
            .execute().data
        )
        if visitas:
            por_visita = {v["id"]: v for v in visitas}
            recientes: dict[str, tuple[str, str]] = {}
            for foto in (
                cliente.table("inspeccion_fotos").select("inspeccion_id, storage_path")
                .in_("inspeccion_id", list(por_visita)).eq("tipo", "completo").execute().data
            ):
                visita = por_visita[foto["inspeccion_id"]]
                actual = recientes.get(visita["arbol_id"])
                if actual is None or str(visita["fecha"]) > actual[0]:
                    recientes[visita["arbol_id"]] = (str(visita["fecha"]), foto["storage_path"])
            for arbol_id, (_, ruta) in recientes.items():
                rutas[arbol_id] = ruta
    firmadas = urls_firmadas(cliente, list(rutas.values()))
    return {arbol_id: firmadas[ruta] for arbol_id, ruta in rutas.items() if ruta in firmadas}


def escapar_like(texto: str) -> str:
    """Busca el texto tal cual: en LIKE, % y _ son comodines y PostgREST trata * como %."""
    texto = texto.replace("*", "")
    return texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def tipo_real_imagen(contenido: bytes) -> str | None:
    """Reconoce el formato por los primeros bytes del archivo (su firma), no por lo que dice el navegador."""
    if contenido.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if contenido.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if contenido[:4] == b"RIFF" and contenido[8:12] == b"WEBP":
        return "image/webp"
    return None


def leer_foto(archivo, max_bytes: int) -> tuple[bytes, str, str]:
    """Valida una foto subida: tipo declarado permitido, tamaño y formato real por su firma.
    Devuelve (contenido, tipo real, extensión)."""
    if archivo.content_type not in EXTENSIONES:
        raise HTTPException(status_code=422, detail="Formato no permitido. Usa JPG, PNG o WebP.")
    contenido = archivo.file.read(max_bytes + 1)  # no se lee más de lo necesario para saber si se pasa
    if not contenido:
        raise HTTPException(status_code=422, detail="El archivo está vacío")
    if len(contenido) > max_bytes:
        raise HTTPException(status_code=413, detail="La foto supera el máximo de 5 MB")
    tipo_real = tipo_real_imagen(contenido)
    if tipo_real is None:
        raise HTTPException(status_code=422, detail="El archivo no es una imagen JPG, PNG o WebP válida.")
    return contenido, tipo_real, EXTENSIONES[tipo_real]
