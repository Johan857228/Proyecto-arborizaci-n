"""Supabase en memoria para probar los módulos: a diferencia del cliente falso de
conftest.py, este SÍ aplica filtros, orden, paginación, inserciones y actualizaciones.
No aplica RLS: las pruebas de API comprueban los permisos que valida el backend en Python
(el RLS se prueba aparte contra PostgreSQL)."""
import copy
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

from postgrest.exceptions import APIError

# Valores por defecto y únicos que en la base de datos ponen DEFAULT, triggers y UNIQUE.
DEFECTOS = {
    "inspecciones": lambda: {"estado_revision": "pendiente", "fecha": _ahora(), "revisado_por": None,
                             "revisado_en": None, "comentario_revision": None, "origen": "seguimiento"},
    "intervenciones": lambda: {"creado_en": _ahora(), "actualizado_en": _ahora(), "registrado_por": None},
    "cursos": lambda: {"activo": True, "creado_en": _ahora()},
    "presupuestos": lambda: {"creado_en": _ahora(), "notas": None},
    "metas": lambda: {"creado_en": _ahora(), "descripcion": None},
    "escenarios_presupuestales": lambda: {"creado_en": _ahora()},
    "metodos_calculo": lambda: {"creado_en": _ahora()},
    "tamizajes_riesgo": lambda: {"creado_en": _ahora()},
    "alertas_riesgo": lambda: {"estado": "por_confirmar", "creada_en": _ahora(), "actualizada_en": _ahora(),
                               "revisada_en": None, "comentario_revision": None, "rectoria_avisada_en": None,
                               "rectoria_medio": None, "atendida_en": None, "nota_cierre": None, "intervencion_id": None},
    "actividades_servicio": lambda: {"estado": "pendiente", "creado_en": _ahora(), "foto_path": None, "revisado_en": None,
                                     "revisado_por": None, "comentario": None, "arbol_id": None, "lat": None, "lng": None},
    "certificados_servicio": lambda: {"emitido_en": _ahora(), "anulado_en": None, "anulado_por": None, "anulado_motivo": None},
    "prae": lambda: {"creado_en": _ahora(), "actualizado_en": _ahora(), "diagnostico": None, "objetivo_general": None,
                     "objetivos_especificos": [], "comite": None, "tema_otro": None},
    "prae_acciones": lambda: {"creado_en": _ahora(), "estado": "pendiente", "orden": 0},
    "prae_evidencias": lambda: {"creado_en": _ahora(), "foto_path": None, "accion_id": None},
    "prae_evaluaciones": lambda: {"creado_en": _ahora()},
    "clases_guia": lambda: {"creado_en": _ahora(), "curso_id": None, "asistentes": None, "notas": None},
    "jornadas_siembra": lambda: {"creado_en": _ahora(), "actualizado_en": _ahora(), "lugar": None, "organizador": "colegio",
                                 "oficial": False, "area_de_vida": None, "patrocinador": None, "notas": None},
    "siembras": lambda: {"creado_en": _ahora(), "especie_otra": None, "precision_gps_m": None, "vivero": None,
                         "vivero_registro_ica": None, "altura_inicial_cm": None, "padrino_curso_id": None,
                         "padrino_usuario_id": None, "padrino_nombre": None, "arbol_id": None, "reemplaza_id": None, "notas": None},
    "controles_siembra": lambda: {"creado_en": _ahora(), "altura_cm": None, "mantenimiento": False, "observaciones": None},
    "asistentes_jornada": lambda: {"creado_en": _ahora(), "arboles_sembrados": None, "autoriza_certificado": False,
                                   "autorizacion_registrada_por": None, "autorizacion_registrada_en": None},
    "territorios": lambda: {"creado_en": _ahora(), "actualizado_en": _ahora(), "tipo": "secretaria_educacion",
                            "divipolas": [], "institucion_ids": []},
    "miembros_territorio": lambda: {"creado_en": _ahora()},
    "informes_territoriales": lambda: {"actualizado_en": _ahora(), "secciones": {}, "estado": "borrador"},
}
UNICOS = {
    "cursos": [("institucion_id", "nombre", "anio")],
    "metas": [("institucion_id", "indicador", "fecha_inicio", "fecha_fin")],
    "curso_zonas": [("curso_id", "zona")],
    "inspeccion_observaciones": [("inspeccion_id", "observacion_codigo")],
    "prae": [("institucion_id", "anio")],
}
SIN_ID = {"curso_zonas", "inspeccion_observaciones", "parametros_institucionales", "perfiles", "tipos_intervencion",
          "tamizajes_riesgo", "contactos_emergencia", "servicio_social_parametros", "miembros_territorio"}


def _ahora():
    return datetime.now(timezone.utc).isoformat()


class Consulta:
    def __init__(self, base: "BaseMemoria", tabla: str):
        self.base, self.tabla = base, tabla
        self.op, self.columnas = "select", "*"
        self.filtros, self.orden = [], []
        self.desde = self.cuantos = None
        self.datos = None
        self.conflicto, self.ignorar = "", False

    def select(self, *columnas, count=None):
        if columnas:
            self.columnas = ",".join(columnas)
        return self

    def _filtro(self, fn):
        self.filtros.append(fn)
        return self

    def eq(self, c, v): return self._filtro(lambda f: str(f.get(c)) == str(v))
    def neq(self, c, v): return self._filtro(lambda f: str(f.get(c)) != str(v))
    def gt(self, c, v): return self._filtro(lambda f: f.get(c) is not None and str(f[c]) > str(v))
    def gte(self, c, v): return self._filtro(lambda f: f.get(c) is not None and str(f[c]) >= str(v))
    def lt(self, c, v): return self._filtro(lambda f: f.get(c) is not None and str(f[c]) < str(v))
    def lte(self, c, v): return self._filtro(lambda f: f.get(c) is not None and str(f[c]) <= str(v))
    def in_(self, c, v): return self._filtro(lambda f, v=set(map(str, v)): str(f.get(c)) in v)
    def is_(self, c, v): return self._filtro(lambda f: f.get(c) is None if v in (None, "null") else f.get(c) is v)

    def ilike(self, c, patron):
        texto = patron.strip("%").lower()
        return self._filtro(lambda f: texto in str(f.get(c, "")).lower())

    def order(self, columna, desc=False, **_):
        self.orden.append((columna, desc))
        return self

    def range(self, a, b):
        self.desde, self.cuantos = a, b - a + 1
        return self

    def limit(self, n):
        self.cuantos = n
        return self

    def insert(self, datos, **_):
        self.op, self.datos = "insert", datos
        return self

    def upsert(self, datos, on_conflict="", ignore_duplicates=False, **_):
        self.op, self.datos, self.conflicto, self.ignorar = "upsert", datos, on_conflict, ignore_duplicates
        return self

    def update(self, datos, **_):
        self.op, self.datos = "update", datos
        return self

    def delete(self, **_):
        self.op = "delete"
        return self

    def _coinciden(self, filas):
        return [f for f in filas if all(fn(f) for fn in self.filtros)]

    def _proyectar(self, fila):
        cols = [c.strip() for c in self.columnas.split(",") if c.strip()]
        return copy.deepcopy(fila) if cols == ["*"] else {c: copy.deepcopy(fila.get(c)) for c in cols}

    def execute(self):
        self.base.llamadas.append((self.tabla, self.op))
        # fallar[tabla] = "insert" (error 23503) o ("select", "42703") para elegir el código.
        falla = self.base.fallar.get(self.tabla)
        op_falla, codigo = (falla, "23503") if isinstance(falla, str) else (falla or (None, None))
        if op_falla == self.op:
            raise APIError({"message": "falla simulada", "code": codigo, "hint": None, "details": None})
        filas = self.base.tablas.setdefault(self.tabla, [])
        if self.op == "select":
            resultado = self._coinciden(filas)
            for columna, desc in reversed(self.orden):
                resultado.sort(key=lambda f: (f.get(columna) is None, str(f.get(columna))), reverse=desc)
            inicio = self.desde or 0
            resultado = resultado[inicio:inicio + self.cuantos] if self.cuantos is not None else resultado[inicio:]
            return SimpleNamespace(data=[self._proyectar(f) for f in resultado])
        if self.op in ("insert", "upsert"):
            nuevas = self.datos if isinstance(self.datos, list) else [self.datos]
            guardadas = []
            for fila in nuevas:
                if self.op == "upsert":
                    claves = [c.strip() for c in self.conflicto.split(",") if c.strip()]
                    existente = next((f for f in filas if all(str(f.get(c)) == str(fila.get(c)) for c in claves)), None)
                    if existente is not None:
                        if not self.ignorar:
                            existente.update(copy.deepcopy(fila))
                            guardadas.append(copy.deepcopy(existente))
                        continue
                completa = {**DEFECTOS.get(self.tabla, dict)(), **copy.deepcopy(fila)}
                if self.tabla not in SIN_ID:
                    completa.setdefault("id", str(uuid.uuid4()))
                if self.tabla == "metodos_calculo":
                    completa["version"] = max((f["version"] for f in filas), default=0) + 1
                for grupo in UNICOS.get(self.tabla, []):
                    if any(all(str(f.get(c)) == str(completa.get(c)) for c in grupo) for f in filas):
                        raise APIError({"message": "duplicate key value", "code": "23505", "hint": None, "details": None})
                filas.append(completa)
                guardadas.append(copy.deepcopy(completa))
            return SimpleNamespace(data=guardadas)
        if self.op == "update":
            cambiadas = []
            for f in self._coinciden(filas):
                f.update(copy.deepcopy(self.datos))
                cambiadas.append(copy.deepcopy(f))
            return SimpleNamespace(data=cambiadas)
        borradas = self._coinciden(filas)
        self.base.tablas[self.tabla] = [f for f in filas if f not in borradas]
        return SimpleNamespace(data=copy.deepcopy(borradas))


class Almacen:
    def __init__(self, base):
        self.base = base

    def from_(self, bucket):
        return self

    def upload(self, ruta, contenido, opciones=None):
        self.base.archivos[ruta] = contenido

    def remove(self, rutas):
        for r in rutas:
            self.base.archivos.pop(r, None)

    def create_signed_url(self, ruta, segundos, opciones=None):
        return {"signedURL": f"https://memoria/{ruta}"}

    def create_signed_urls(self, rutas, segundos):
        return [{"path": r, "signedURL": f"https://memoria/{r}", "error": None} for r in rutas]


class BaseMemoria:
    def __init__(self, tablas: dict[str, list[dict]]):
        self.tablas = copy.deepcopy(tablas)
        self.llamadas: list[tuple[str, str]] = []
        self.fallar: dict[str, str] = {}
        self.archivos: dict[str, bytes] = {}
        self.storage = Almacen(self)

    def table(self, nombre):
        return Consulta(self, nombre)
