"""Configuración: versiones del método de cálculo (pesos y umbrales) y parámetros por institución."""
from collections import Counter
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator

import datos
import db
from auth import Perfil, admin_actual, perfil_actual, revisor_actual
from comun import ahora
from servicios.calificacion import Metodo, evaluar

router = APIRouter(prefix="/configuracion", tags=["Configuración"])


class MetodoCampos(BaseModel):
    """Pesos (0 a 100) y umbrales del puntaje de riesgo, y constantes ambientales."""

    nombre: str = Field(min_length=3, max_length=80)
    descripcion: str | None = Field(default=None, max_length=500)
    peso_follaje: float = Field(default=1, ge=0, le=100)
    peso_tronco: float = Field(default=1, ge=0, le=100)
    peso_raiz: float = Field(default=1, ge=0, le=100)
    peso_plagas: float = Field(default=1, ge=0, le=100)
    peso_interferencia: float = Field(default=0, ge=0, le=100)
    pesos_observacion: dict[str, float] = Field(default_factory=dict, max_length=100)
    umbral_riesgo: float = Field(gt=0, le=1000)
    umbral_critico: float = Field(gt=0, le=1000)
    densidad_madera_defecto: float = Field(default=0.6, ge=0.1, le=1.5)
    factor_raiz: float = Field(default=0.24, ge=0, le=1)
    fraccion_carbono: float = Field(default=0.47, ge=0.3, le=0.6)

    @field_validator("nombre", "descripcion")
    @classmethod
    def _limpiar(cls, v):
        v = v.strip() if v else v
        return v or None

    @field_validator("pesos_observacion")
    @classmethod
    def _pesos(cls, v: dict[str, float]) -> dict[str, float]:
        for codigo, peso in v.items():
            if not 0 <= peso <= 100:
                raise ValueError(f"El peso de {codigo} debe estar entre 0 y 100")
        return v

    @model_validator(mode="after")
    def _umbrales(self):
        if not self.nombre or len(self.nombre) < 3:
            raise ValueError("El nombre debe tener al menos 3 caracteres")
        if self.umbral_critico <= self.umbral_riesgo:
            raise ValueError("El umbral crítico debe ser mayor que el umbral de riesgo")
        return self


class MetodoOut(MetodoCampos):
    id: str
    version: int
    creado_en: datetime
    instituciones: list[str] = []


class SimulacionIn(BaseModel):
    metodo_id: UUID | None = None
    metodo: MetodoCampos | None = None
    institucion_id: str | None = None

    @model_validator(mode="after")
    def _uno(self):
        if (self.metodo_id is None) == (self.metodo is None):
            raise ValueError("Envía metodo_id (versión guardada) o metodo (borrador), solo uno")
        return self


class ParametrosIn(BaseModel):
    metodo_id: UUID
    dias_revisita: int = Field(ge=7, le=730)
    precision_gps_max_m: float = Field(gt=0, le=500)
    puntos_inspeccion: int = Field(ge=0, le=1000)
    puntos_arbol_nuevo: int = Field(ge=0, le=1000)


class ParametrosOut(BaseModel):
    institucion_id: str
    institucion_nombre: str
    metodo_id: str | None
    metodo_version: int
    metodo_nombre: str
    dias_revisita: int
    precision_gps_max_m: float
    puntos_inspeccion: int
    puntos_arbol_nuevo: int
    configurado: bool


def _codigos_validos(cliente, pesos: dict[str, float]):
    catalogo = datos.catalogo_observaciones(cliente)
    invalidos = sorted(c for c in pesos if c not in catalogo)
    if invalidos:
        raise HTTPException(status_code=422, detail=f"Observaciones no válidas en pesos_observacion: {invalidos}")


@router.get("/metodos", response_model=list[MetodoOut])
def listar_metodos(perfil: Perfil = Depends(perfil_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    filas = sorted(cliente.table("metodos_calculo").select("*").execute().data, key=lambda m: -m["version"])
    metodos = datos.metodos(cliente)
    usos: dict[str, list[str]] = {}
    for inst, p in datos.parametros(cliente, metodos).items():
        usos.setdefault(p.metodo.id, []).append(inst)
    return [{**f, "id": str(f["id"]), "instituciones": sorted(usos.get(str(f["id"]), []))} for f in filas]


@router.post("/metodos", response_model=MetodoOut, status_code=201)
def crear_metodo(d: MetodoCampos, perfil: Perfil = Depends(admin_actual)):
    """Crea una versión nueva (las versiones no se editan). Para usarla, asígnala a una
    institución en los parámetros."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    _codigos_validos(cliente, d.pesos_observacion)
    creado = cliente.table("metodos_calculo").insert(d.model_dump()).execute().data[0]
    return {**creado, "id": str(creado["id"]), "instituciones": []}


@router.post("/metodos/simular")
def simular_metodo(d: SimulacionIn, perfil: Perfil = Depends(revisor_actual)):
    """Vista previa: cómo quedaría el semáforo de los árboles con un método, usando su última
    inspección válida. No cambia nada en la base de datos."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    if d.metodo_id is not None:
        metodos = datos.metodos(cliente)
        if str(d.metodo_id) not in metodos:
            raise HTTPException(status_code=404, detail="Método no encontrado")
        metodo = metodos[str(d.metodo_id)]
    else:
        _codigos_validos(cliente, d.metodo.pesos_observacion)
        metodo = Metodo.desde_fila({**d.metodo.model_dump(), "id": None, "version": 0})

    arboles = [a for a in datos.arboles(cliente, d.institucion_id) if a.get("ultima_inspeccion_id")]
    observaciones = datos.observaciones_por_inspeccion(
        cliente, [str(a["ultima_inspeccion_id"]) for a in arboles]
    ) if arboles else {}
    catalogo = datos.catalogo_observaciones(cliente)
    actual, simulado = Counter(), Counter()
    cambios = []
    for a in arboles:
        codigos = observaciones.get(str(a["ultima_inspeccion_id"]), [])
        puntaje, calificacion = evaluar(metodo, [(c, catalogo[c]["grupo"]) for c in codigos if c in catalogo], a["interferencia"])
        actual[a["estado"]] += 1
        simulado[calificacion] += 1
        if calificacion != a["estado"]:
            cambios.append({
                "arbol_id": a["id"],
                "codigo": a["codigo"],
                "nombre_comun": a["nombre_comun"],
                "estado_actual": a["estado"],
                "estado_simulado": calificacion,
                "puntaje_simulado": puntaje,
            })
    estados = ("sano", "riesgo", "critico")
    return {
        "arboles_evaluados": len(arboles),
        "actual": {e: actual.get(e, 0) for e in estados},
        "simulado": {e: simulado.get(e, 0) for e in estados},
        "cambian": len(cambios),
        "cambios": sorted(cambios, key=lambda c: c["codigo"])[:100],
    }


@router.get("/parametros", response_model=list[ParametrosOut])
def listar_parametros(perfil: Perfil = Depends(perfil_actual)):
    """Parámetros de cada institución (las que no tienen fila usan los valores por defecto)."""
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    metodos = datos.metodos(cliente)
    todos = datos.parametros(cliente, metodos)
    resultado = []
    for inst_id, inst in sorted(datos.instituciones(cliente).items(), key=lambda kv: kv[1]["prefijo"]):
        p = datos.parametros_de(todos, inst_id, metodos)
        resultado.append({
            "institucion_id": inst_id,
            "institucion_nombre": inst["nombre_corto"],
            "metodo_id": p.metodo.id,
            "metodo_version": p.metodo.version,
            "metodo_nombre": p.metodo.nombre,
            "dias_revisita": p.dias_revisita,
            "precision_gps_max_m": p.precision_gps_max_m,
            "puntos_inspeccion": p.puntos_inspeccion,
            "puntos_arbol_nuevo": p.puntos_arbol_nuevo,
            "configurado": p.configurado,
        })
    return resultado


@router.put("/parametros/{institucion_id}", response_model=ParametrosOut)
def guardar_parametros(institucion_id: str, d: ParametrosIn, perfil: Perfil = Depends(admin_actual)):
    cliente = db.cliente_de_usuario(perfil.sesion.token)
    instituciones = datos.instituciones(cliente)
    if institucion_id not in instituciones:
        raise HTTPException(status_code=404, detail="Institución no encontrada")
    metodos = datos.metodos(cliente)
    if str(d.metodo_id) not in metodos:
        raise HTTPException(status_code=422, detail="El método indicado no existe")
    fila = {
        **d.model_dump(mode="json"),
        "institucion_id": institucion_id,
        "actualizado_por": perfil.usuario_id,
        "actualizado_en": ahora().isoformat(),
    }
    guardada = cliente.table("parametros_institucionales").upsert(fila, on_conflict="institucion_id").execute().data[0]
    metodo = metodos[str(guardada["metodo_id"])]
    return {
        "institucion_id": institucion_id,
        "institucion_nombre": instituciones[institucion_id]["nombre_corto"],
        "metodo_id": metodo.id,
        "metodo_version": metodo.version,
        "metodo_nombre": metodo.nombre,
        "dias_revisita": int(guardada["dias_revisita"]),
        "precision_gps_max_m": float(guardada["precision_gps_max_m"]),
        "puntos_inspeccion": int(guardada["puntos_inspeccion"]),
        "puntos_arbol_nuevo": int(guardada["puntos_arbol_nuevo"]),
        "configurado": True,
    }
