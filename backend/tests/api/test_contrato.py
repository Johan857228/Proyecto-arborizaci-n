"""Pruebas de regresión del contrato con el frontend.

Si alguien quita o renombra una ruta, o un campo que el frontend usa, estas pruebas
fallan. Si el cambio es intencional, se actualiza aquí y se avisa al equipo de frontend
(como pide el README del repositorio).
"""

RUTAS = {
    ("GET", "/api/salud"),
    ("POST", "/api/auth/login"),
    ("GET", "/api/auth/yo"),
    ("GET", "/api/usuarios"),
    ("POST", "/api/usuarios"),
    ("GET", "/api/catalogos"),
    ("GET", "/api/arboles"),
    ("POST", "/api/arboles"),
    ("GET", "/api/arboles/{codigo}"),
    ("GET", "/api/arboles/{codigo}/observaciones"),
    ("POST", "/api/arboles/{codigo}/observaciones"),
    ("POST", "/api/arboles/{codigo}/baja"),
    ("GET", "/api/fotos/{foto_id}"),
    ("GET", "/api/reportes/resumen"),
}

CAMPOS = {
    "ArbolResponse": {
        "codigo",
        "consecutivo",
        "estado",
        "motivo_baja",
        "institucion",
        "especie",
        "zona",
        "zona_otra",
        "latitud",
        "longitud",
        "creado_en",
        "total_observaciones",
        "ultima_observacion",
    },
    "ObservacionResponse": {
        "id",
        "fecha_hora",
        "latitud",
        "longitud",
        "dap_cm",
        "cap_cm",
        "altura_m",
        "copa_m",
        "etapa",
        "interferencia",
        "interferencia_otra",
        "hallazgos",
        "estado_sanitario",
        "regla_calificacion",
        "calculos",
        "fotos",
        "registrado_por",
    },
    "CalculosResponse": {
        "area_copa_m2",
        "biomasa_kg",
        "carbono_kg",
        "co2_kg",
        "o2_kg",
        "densidad_usada",
        "densidad_estimada",
        "version",
    },
    "ArbolResumen": {
        "codigo",
        "institucion_id",
        "especie",
        "cientifico",
        "zona",
        "estado",
        "estado_sanitario",
        "latitud",
        "longitud",
    },
    "ListaArboles": {"total", "desde", "limite", "conteos", "items"},
    "TokenResponse": {"access_token", "token_type", "usuario"},
    "UsuarioResponse": {"id", "nombre", "correo", "rol", "activo"},
}


def test_rutas_publicadas(app):
    openapi = app.openapi()
    publicadas = {(metodo.upper(), ruta) for ruta, ops in openapi["paths"].items() for metodo in ops}
    assert publicadas == RUTAS


def test_campos_de_las_respuestas(app):
    esquemas = app.openapi()["components"]["schemas"]
    for nombre, campos in CAMPOS.items():
        assert set(esquemas[nombre]["properties"]) == campos, nombre


def test_errores_con_el_mismo_formato(cliente):
    r = cliente.get("/api/arboles")
    assert set(r.json()) == {"detail"}
    r = cliente.post("/api/auth/login", data={})
    assert set(r.json()) == {"detail", "errores"}
