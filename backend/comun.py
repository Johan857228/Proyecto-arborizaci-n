"""Utilidades compartidas por main.py y los routers: fechas, consultas paginadas y fotos."""
from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException
from postgrest.exceptions import APIError

# Colombia no tiene horario de verano: UTC-5 todo el año.
ZONA_HORARIA = timezone(timedelta(hours=-5), "America/Bogota")

BUCKET_FOTOS = "fotos-arboles"
MAX_FOTO_BYTES = 5 * 1024 * 1024
MAX_FOTOS_ADICIONALES = 3
EXTENSIONES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

# Versión vigente de la política de tratamiento de datos (la que se muestra en la app). Si cambia
# el texto, se sube la versión y la app vuelve a pedir que se acepte.
POLITICA_VERSION = "2026-10-v1"


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


# ============================= Metadatos de las fotos ==============================
# Las fotos del teléfono traen EXIF/XMP/IPTC: coordenadas, modelo del dispositivo, fecha y a
# veces el nombre del autor. Antes de guardarlas o enviarlas a la IA se quitan (Ley 1581: los
# datos de los estudiantes se tratan solo para lo necesario). En JPG se conserva únicamente la
# orientación, para que la foto no se vea girada.

def _orientacion_exif(tiff: bytes) -> int | None:
    """Lee la etiqueta Orientation (0x0112) del IFD0 de un bloque TIFF/EXIF."""
    if len(tiff) < 8 or tiff[:2] not in (b"II", b"MM"):
        return None
    orden = "little" if tiff[:2] == b"II" else "big"
    inicio = int.from_bytes(tiff[4:8], orden)
    if inicio + 2 > len(tiff):
        return None
    entradas = int.from_bytes(tiff[inicio:inicio + 2], orden)
    for k in range(entradas):
        e = inicio + 2 + 12 * k
        if e + 12 > len(tiff):
            break
        if int.from_bytes(tiff[e:e + 2], orden) == 0x0112:
            valor = int.from_bytes(tiff[e + 8:e + 10], orden)
            return valor if 1 <= valor <= 8 else None
    return None


def _app1_orientacion(valor: int) -> bytes:
    """Segmento APP1 mínimo con solo la orientación."""
    tiff = (
        b"II*\x00" + (8).to_bytes(4, "little")          # cabecera TIFF, IFD0 en el byte 8
        + (1).to_bytes(2, "little")                       # una entrada
        + (0x0112).to_bytes(2, "little") + (3).to_bytes(2, "little")   # Orientation, SHORT
        + (1).to_bytes(4, "little") + valor.to_bytes(2, "little") + b"\x00\x00"
        + (0).to_bytes(4, "little")                       # no hay más IFD
    )
    datos = b"Exif\x00\x00" + tiff
    return bytes([0xFF, 0xE1]) + (len(datos) + 2).to_bytes(2, "big") + datos


def _limpiar_jpeg(data: bytes) -> bytes:
    salida = bytearray([0xFF, 0xD8])
    orientacion = None
    segmentos = bytearray()
    i, n = 2, len(data)
    while i < n:
        if data[i] != 0xFF:
            segmentos += data[i:]
            break
        while i < n and data[i] == 0xFF:
            i += 1
        if i >= n:
            break
        marcador = data[i]
        i += 1
        if marcador == 0xD9:  # fin de imagen
            segmentos += bytes([0xFF, 0xD9])
            break
        if marcador == 0xDA:  # inicio de los datos comprimidos: el resto va igual
            segmentos += bytes([0xFF, 0xDA]) + data[i:]
            break
        if 0xD0 <= marcador <= 0xD7 or marcador == 0x01:
            segmentos += bytes([0xFF, marcador])
            continue
        if i + 2 > n:
            break
        largo = int.from_bytes(data[i:i + 2], "big")
        cuerpo = data[i + 2:i + largo]
        i += largo
        if marcador == 0xE1:  # APP1: EXIF o XMP
            if cuerpo.startswith(b"Exif\x00\x00"):
                orientacion = orientacion or _orientacion_exif(cuerpo[6:])
            continue
        if marcador in (0xED, 0xFE):  # APP13 (IPTC/Photoshop) y comentarios
            continue
        segmentos += bytes([0xFF, marcador]) + data[i - largo:i]
    if orientacion and orientacion != 1:
        salida += _app1_orientacion(orientacion)
    return bytes(salida + segmentos)


def _limpiar_png(data: bytes) -> bytes:
    quitar = {b"eXIf", b"tEXt", b"zTXt", b"iTXt", b"tIME"}
    salida = bytearray(data[:8])
    i = 8
    while i + 8 <= len(data):
        largo = int.from_bytes(data[i:i + 4], "big")
        tipo = data[i + 4:i + 8]
        fin = i + 12 + largo
        if tipo not in quitar:
            salida += data[i:fin]
        i = fin
        if tipo == b"IEND":
            break
    return bytes(salida)


def _limpiar_webp(data: bytes) -> bytes:
    trozos = bytearray()
    i = 12
    while i + 8 <= len(data):
        tipo = data[i:i + 4]
        largo = int.from_bytes(data[i + 4:i + 8], "little")
        fin = i + 8 + largo + (largo & 1)
        trozo = bytearray(data[i:fin])
        if tipo == b"VP8X" and len(trozo) > 8:
            trozo[8] &= ~0x0C & 0xFF  # ya no hay EXIF (0x08) ni XMP (0x04)
        if tipo not in (b"EXIF", b"XMP "):
            trozos += trozo
        i = fin
    return b"RIFF" + (len(trozos) + 4).to_bytes(4, "little") + b"WEBP" + bytes(trozos)


def limpiar_metadatos(contenido: bytes, tipo_real: str) -> bytes:
    """Quita los metadatos de una foto ya validada. Si algo sale mal, la foto queda como llegó."""
    try:
        if tipo_real == "image/jpeg":
            return _limpiar_jpeg(contenido)
        if tipo_real == "image/png":
            return _limpiar_png(contenido)
        if tipo_real == "image/webp":
            return _limpiar_webp(contenido)
    except Exception:
        pass
    return contenido


def leer_foto(archivo, max_bytes: int) -> tuple[bytes, str, str]:
    """Valida una foto subida: tipo declarado permitido, tamaño y formato real por su firma.
    Devuelve (contenido sin metadatos, tipo real, extensión)."""
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
    return limpiar_metadatos(contenido, tipo_real), tipo_real, EXTENSIONES[tipo_real]


# ============================ Registros sin conexión =============================
# La app guarda en el teléfono lo que se registra sin señal y lo envía cuando vuelve la
# conexión. Cada envío lleva un id_cliente (UUID que genera la app): si se repite porque la
# respuesta no alcanzó a llegar, se devuelve lo que ya quedó guardado en vez de duplicarlo.
# Las columnas son de la migración 007; sin ella, los registros se guardan igual, sin esa
# protección.
COLUMNAS_SIN_CONEXION = ("id_cliente", "capturado_en")
# La hora de captura la pone el teléfono: si está fuera de este rango se descarta (el registro
# se guarda igual, con la hora del servidor).
CAPTURA_TOLERANCIA_FUTURO = timedelta(minutes=10)
CAPTURA_MAX_ANTIGUEDAD = timedelta(days=90)


def es_columna_faltante(error: APIError) -> bool:
    """La base de datos no tiene la columna: falta aplicar una migración."""
    return str(getattr(error, "code", "") or "") in ("PGRST204", "42703")


def hora_de_captura(valor: datetime | None) -> datetime | None:
    """Hora en que se tomó el registro en campo, o None si el reloj del teléfono no es creíble."""
    if valor is None:
        return None
    if valor.tzinfo is None:
        valor = valor.replace(tzinfo=timezone.utc)
    momento = datetime.now(timezone.utc)
    if valor > momento + CAPTURA_TOLERANCIA_FUTURO or valor < momento - CAPTURA_MAX_ANTIGUEDAD:
        return None
    return valor


def buscar_por_id_cliente(cliente, tabla: str, id_cliente, columnas: str = "*") -> dict | None:
    """El registro que ya se guardó con ese id_cliente (None si no hay o falta la migración)."""
    if id_cliente is None:
        return None
    try:
        filas = cliente.table(tabla).select(columnas).eq("id_cliente", str(id_cliente)).limit(1).execute().data
    except APIError as error:
        if es_columna_faltante(error):
            return None
        raise
    return filas[0] if filas else None


def insertar_sin_duplicar(cliente, tabla: str, fila: dict) -> tuple[dict, bool]:
    """Inserta la fila y devuelve (fila guardada, True). Si otro envío con el mismo id_cliente
    llegó primero, devuelve (esa fila, False). Sin la migración 007 inserta sin esas columnas."""
    try:
        return cliente.table(tabla).insert(fila).execute().data[0], True
    except APIError as error:
        if str(getattr(error, "code", "")) == "23505" and fila.get("id_cliente"):
            existente = buscar_por_id_cliente(cliente, tabla, fila["id_cliente"])
            if existente:
                return existente, False
            raise
        if es_columna_faltante(error) and any(c in fila for c in COLUMNAS_SIN_CONEXION):
            sin_columnas = {k: v for k, v in fila.items() if k not in COLUMNAS_SIN_CONEXION}
            return cliente.table(tabla).insert(sin_columnas).execute().data[0], True
        raise


def ajeno(fila: dict, campo: str, usuario_id: str) -> bool:
    """True si el registro encontrado por id_cliente es de otra persona."""
    return fila.get(campo) is not None and str(fila[campo]) != str(usuario_id)
