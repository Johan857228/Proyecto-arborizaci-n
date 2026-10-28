"""Servicio social estudiantil obligatorio: de dónde salen las horas y cómo va cada estudiante.

Resolución MEN 4210 de 1996: lo prestan los estudiantes de la educación media (10.° y 11.°), con
una intensidad mínima de 80 horas (art. 6), y es requisito para obtener el título de bachiller
(art. 7). Lo organiza la institución dentro de su proyecto educativo; la app lleva la bitácora y
prepara el certificado, que expide el colegio.

Horas que cuentan:
- Cada inspección del estudiante que un docente confirma vale `horas_por_inspeccion` (1 h por
  defecto): ya trae foto, GPS y validación docente. Cuenta una por árbol y día.
- Las actividades que registra el estudiante (siembra, riego, mantenimiento, jornada, educación
  ambiental u otra), con foto, cuando un docente las aprueba.
- Máximo 8 horas por día entre todo.
"""
import calendar
import re
from collections import defaultdict
from datetime import date

META_POR_DEFECTO = 80.0
HORAS_POR_INSPECCION = 1.0
MAX_HORAS_DIA = 8.0
GRADOS_SERVICIO = (10, 11)
# Por debajo de esta fracción de las horas esperadas a la fecha, el estudiante va atrasado.
UMBRAL_ATRASO = 0.75
# Con menos horas esperadas que esto (los primeros días) nadie se marca atrasado.
MINIMO_ESPERADO = 4.0

TIPOS = {
    "inspeccion": "Inspecciones de árboles confirmadas",
    "siembra": "Siembra",
    "riego": "Riego",
    "mantenimiento": "Mantenimiento básico (limpieza, plateo, tutorado)",
    "jornada": "Jornada ambiental",
    "educacion": "Educación ambiental",
    "otra": "Otra actividad",
}
# Lo que no se registra como servicio social: no es apto para estudiantes menores de edad.
NO_PERMITIDAS = "trabajos en altura, con herramientas cortantes o motorizadas, o con agroquímicos"

_PALABRAS_GRADO = {"decimo": 10, "décimo": 10, "once": 11, "undecimo": 11, "undécimo": 11}


def grado_de_curso(curso: dict | None) -> int | None:
    """Grado del curso: el campo `grado` o, si está vacío, el que dice su nombre
    ("10-A", "11B", "1102", "Décimo A", "Once 2")."""
    if not curso:
        return None
    if curso.get("grado") is not None:
        return int(curso["grado"])
    nombre = (curso.get("nombre") or "").strip().lower()
    codigo = re.match(r"^(\d{3,4})$", nombre)  # 601, 1001, 1102: grado y grupo
    if codigo:
        grado = int(codigo.group(1)[:-2])
        return grado if 0 <= grado <= 11 else None
    numero = re.match(r"^(\d{1,2})(?!\d)", nombre)
    if numero:
        grado = int(numero.group(1))
        return grado if 0 <= grado <= 11 else None
    primera = re.split(r"[\s\-_°º.]+", nombre)[0] if nombre else ""
    return _PALABRAS_GRADO.get(primera)


def periodo(grado: int, anio: int) -> tuple[date, date]:
    """Del 1 de febrero de 10.° al 30 de noviembre de 11.° (calendario A). `anio` es el del curso."""
    inicio = anio if grado == 10 else anio - 1
    return date(inicio, 2, 1), date(inicio + 1, 11, 30)


def meses_escolares(inicio: date, dia: date) -> float:
    """Meses de clase (febrero a noviembre de los dos años) transcurridos hasta `dia`: de 0 a 20."""
    total = 0.0
    for anio in (inicio.year, inicio.year + 1):
        for mes in range(2, 12):
            dias_mes = calendar.monthrange(anio, mes)[1]
            primero, ultimo = date(anio, mes, 1), date(anio, mes, dias_mes)
            if dia >= ultimo:
                total += 1
            elif dia >= primero:
                total += dia.day / dias_mes
    return total


def horas_esperadas(meta: float, inicio: date, dia: date) -> float:
    """Horas que llevaría a esta fecha alguien que reparte la meta en parejo durante los dos años."""
    return round(meta * meses_escolares(inicio, dia) / 20, 1)


def estado(aprobadas: float, meta: float, esperadas: float) -> str:
    if aprobadas >= meta:
        return "completo"
    if esperadas >= MINIMO_ESPERADO and aprobadas < UMBRAL_ATRASO * esperadas:
        return "atrasado"
    return "al_dia"


def horas_de_inspecciones(
    inspecciones: list[dict], estudiante_id: str, horas_por: float, inicio: date, fin: date, a_dia
) -> tuple[list[dict], list[dict]]:
    """Inspecciones del estudiante que cuentan: (confirmadas, pendientes de revisión). Una por
    árbol y día, dentro del periodo. `a_dia` convierte la fecha de Supabase en fecha de Colombia."""
    vistas: set[tuple[str, date]] = set()
    confirmadas, pendientes = [], []
    for i in sorted(inspecciones, key=lambda x: str(x["fecha"])):
        if str(i.get("inspector_id")) != str(estudiante_id) or i["estado_revision"] == "anulada":
            continue
        dia = a_dia(i["fecha"])
        if dia is None or not (inicio <= dia <= fin):
            continue
        clave = (str(i["arbol_id"]), dia)
        if clave in vistas:
            continue
        vistas.add(clave)
        item = {"fecha": dia, "horas": horas_por, "tipo": "inspeccion", "inspeccion_id": str(i["id"]),
                "arbol_id": str(i["arbol_id"]), "origen": i.get("origen")}
        (confirmadas if i["estado_revision"] == "confirmada" else pendientes).append(item)
    return confirmadas, pendientes


def sumar(items: list[dict]) -> dict:
    """Total con el tope de 8 horas por día, horas por tipo y cuántas quedaron por fuera del tope."""
    por_dia: dict[date, float] = defaultdict(float)
    por_tipo: dict[str, float] = defaultdict(float)
    for item in items:
        por_dia[item["fecha"]] += float(item["horas"])
        por_tipo[item["tipo"]] += float(item["horas"])
    total = sum(min(MAX_HORAS_DIA, h) for h in por_dia.values())
    bruto = sum(por_dia.values())
    return {
        "total": round(total, 1),
        "por_tipo": {t: round(h, 1) for t, h in sorted(por_tipo.items())},
        "fuera_del_tope": round(bruto - total, 1),
    }


def iniciales(nombre: str) -> str:
    """"Laura Gómez Pérez" -> "L. G. P." (lo que muestra la verificación pública del certificado)."""
    partes = [p for p in re.split(r"\s+", nombre.strip()) if p]
    return " ".join(f"{p[0].upper()}." for p in partes[:4]) or "—"
