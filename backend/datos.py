"""Lectura de tablas que comparten varios módulos (siempre con el cliente que se reciba,
para que el RLS de Supabase aplique cuando es el cliente del usuario)."""
from collections import defaultdict
from dataclasses import dataclass

from comun import traer_todo
from servicios.calificacion import METODO_PROVISIONAL, Metodo
from servicios.gamificacion import PuntosInstitucion

COLUMNAS_INSPECCION = (
    "id, arbol_id, inspector_id, fecha, origen, lat, lng, precision_gps_m, dap_cm, altura_m, copa_m, etapa, "
    "interferencia, interferencia_otra, notas, metodo_id, puntaje_riesgo, calificacion, estado_revision, "
    "revisado_por, revisado_en, comentario_revision, "
    "insectos, insectos_parte, insectos_sev, enfermedad, enfermedad_parte, enfermedad_sev, "
    "muestra_lab, cod_muestra_lab, hemiparasitas, pct_hemiparasitas, bejucos, epifitas"
)
COLUMNAS_PERFIL = "usuario_id, nombre, rol, institucion_id, curso_id, activo"


@dataclass
class Parametros:
    institucion_id: str
    metodo: Metodo
    dias_revisita: int = 180
    precision_gps_max_m: float = 15.0
    puntos_inspeccion: int = 10
    puntos_arbol_nuevo: int = 15
    configurado: bool = False

    def puntos(self) -> PuntosInstitucion:
        return PuntosInstitucion(self.puntos_inspeccion, self.puntos_arbol_nuevo)


# ------------------------------------------------------------------ Configuración
def metodos(cliente) -> dict[str, Metodo]:
    return {str(f["id"]): Metodo.desde_fila(f) for f in traer_todo(cliente, "metodos_calculo", orden="version")}


def metodo_por_defecto(todos: dict[str, Metodo]) -> Metodo:
    """La versión más antigua: es la que la migración asigna a cada institución."""
    return min(todos.values(), key=lambda m: m.version) if todos else METODO_PROVISIONAL


def parametros(cliente, todos_metodos: dict[str, Metodo]) -> dict[str, Parametros]:
    defecto = metodo_por_defecto(todos_metodos)
    resultado = {}
    for f in traer_todo(cliente, "parametros_institucionales", orden="institucion_id"):
        resultado[f["institucion_id"]] = Parametros(
            institucion_id=f["institucion_id"],
            metodo=todos_metodos.get(str(f["metodo_id"]), defecto),
            dias_revisita=int(f["dias_revisita"]),
            precision_gps_max_m=float(f["precision_gps_max_m"]),
            puntos_inspeccion=int(f["puntos_inspeccion"]),
            puntos_arbol_nuevo=int(f["puntos_arbol_nuevo"]),
            configurado=True,
        )
    return resultado


def parametros_de(todos: dict[str, Parametros], institucion_id: str, todos_metodos: dict[str, Metodo]) -> Parametros:
    return todos.get(institucion_id) or Parametros(institucion_id=institucion_id, metodo=metodo_por_defecto(todos_metodos))


def parametros_institucion(cliente, institucion_id: str) -> Parametros:
    todos_metodos = metodos(cliente)
    return parametros_de(parametros(cliente, todos_metodos), institucion_id, todos_metodos)


# ------------------------------------------------------------------ Catálogos
def catalogo_observaciones(cliente) -> dict[str, dict]:
    filas = cliente.table("observaciones_catalogo").select("codigo, grupo, etiqueta, orden").execute().data
    return {f["codigo"]: f for f in filas}


def tipos_intervencion(cliente) -> dict[str, dict]:
    filas = traer_todo(cliente, "tipos_intervencion", orden="orden")
    return {f["codigo"]: f for f in filas}


def instituciones(cliente) -> dict[str, dict]:
    filas = cliente.table("instituciones").select("id, nombre, nombre_corto, prefijo").execute().data
    return {f["id"]: f for f in filas}


# ------------------------------------------------------------------ Árboles e historial
def arboles(cliente, institucion_id: str | None = None) -> list[dict]:
    filtros = [("eq", ("institucion_id", institucion_id))] if institucion_id else []
    return traer_todo(cliente, "arboles_resumen", filtros=filtros)


def inspecciones(cliente, filtros=()) -> list[dict]:
    return traer_todo(cliente, "inspecciones", COLUMNAS_INSPECCION, filtros=filtros)


def observaciones_por_inspeccion(cliente, ids: list[str] | None = None) -> dict[str, list[str]]:
    """Códigos de hallazgos de cada inspección. Sin `ids` trae todas."""
    resultado: dict[str, list[str]] = defaultdict(list)
    if ids is None:
        filas = traer_todo(
            cliente, "inspeccion_observaciones", "inspeccion_id, observacion_codigo",
            orden="inspeccion_id, observacion_codigo",
        )
    else:
        filas = []
        for inicio in range(0, len(ids), 100):
            lote = ids[inicio:inicio + 100]
            filas += (
                cliente.table("inspeccion_observaciones")
                .select("inspeccion_id, observacion_codigo")
                .in_("inspeccion_id", lote)
                .execute()
                .data
            )
    for f in filas:
        if f["observacion_codigo"] not in resultado[f["inspeccion_id"]]:
            resultado[f["inspeccion_id"]].append(f["observacion_codigo"])
    return dict(resultado)


def intervenciones(cliente, filtros=()) -> list[dict]:
    return traer_todo(cliente, "intervenciones", filtros=filtros)


# ------------------------------------------------------------------ Personas y cursos
def perfiles_publicos(cliente) -> dict[str, dict]:
    filas = traer_todo(cliente, "perfiles_publicos", COLUMNAS_PERFIL, orden="usuario_id")
    return {f["usuario_id"]: f for f in filas}


def cursos(cliente, institucion_id: str | None = None) -> dict[str, dict]:
    filtros = [("eq", ("institucion_id", institucion_id))] if institucion_id else []
    filas = traer_todo(cliente, "cursos", filtros=filtros)
    zonas = defaultdict(list)
    for z in traer_todo(cliente, "curso_zonas", "curso_id, zona", orden="curso_id, zona"):
        zonas[z["curso_id"]].append(z["zona"])
    return {f["id"]: {**f, "zonas": sorted(zonas.get(f["id"], []))} for f in filas}
