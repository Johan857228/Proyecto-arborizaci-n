"""Catálogos iniciales. Los valores son los del prototipo del frontend.

Se cargan al arrancar el backend y solo se insertan los que falten, así que se puede
ejecutar muchas veces sin duplicar nada.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.infrastructure.database.models import (
    EspecieModel,
    HallazgoModel,
    InstitucionModel,
    InterferenciaModel,
    ZonaModel,
)

INSTITUCIONES = [
    {
        "id": "sj",
        "nombre": "Institución Educativa San José",
        "corto": "San José",
        "prefijo": "IE001",
        "latitud": 10.463722,
        "longitud": -73.253981,
    },
    {
        "id": "la",
        "nombre": "Institución Educativa Los Almendros",
        "corto": "Los Almendros",
        "prefijo": "IE002",
        "latitud": 10.47591,
        "longitud": -73.24412,
    },
    {
        "id": "vv",
        "nombre": "Institución Educativa Villa Verde",
        "corto": "Villa Verde",
        "prefijo": "IE003",
        "latitud": 10.45218,
        "longitud": -73.2654,
    },
]

ZONAS = [
    ("patio_central", "Patio central"),
    ("entrada_principal", "Entrada principal"),
    ("zona_deportiva", "Zona deportiva"),
    ("bloques_academicos", "Bloques académicos"),
    ("otra", "Otra"),
]

INTERFERENCIAS = [
    ("ninguna", "Ninguna"),
    ("levantamiento_pisos", "Levantamiento de pisos"),
    ("afectacion_muros", "Afectación de muros"),
    ("cables_electricos", "Cables eléctricos"),
    ("otra_infraestructura", "Otra infraestructura"),
]

# (nombre común, nombre científico). La densidad de la madera queda vacía hasta que
# A. Datos entregue el valor de cada especie.
ESPECIES = [
    ("Mango", "Mangifera indica"),
    ("Cañaguate", "Handroanthus chrysanthus"),
    ("Ceiba", "Ceiba pentandra"),
    ("Almendro", "Terminalia catappa"),
    ("Mamón", "Melicoccus bijugatus"),
    ("Oití", "Licania tomentosa"),
    ("Roble morado", "Tabebuia rosea"),
    ("Totumo", "Crescentia cujete"),
    ("Nim", "Azadirachta indica"),
    ("Samán", "Samanea saman"),
    ("Caracolí", "Anacardium excelsum"),
    ("Tamarindo", "Tamarindus indica"),
    ("Guácimo", "Guazuma ulmifolia"),
    ("Trupillo", "Prosopis juliflora"),
]

# (grupo, [(código, nombre)])
HALLAZGOS = [
    (
        "follaje",
        [
            ("f_manchas", "Manchas"),
            ("f_clorosis", "Clorosis"),
            ("f_necrosis", "Necrosis"),
            ("f_hojas", "Hojas comidas/perforadas"),
        ],
    ),
    (
        "tronco",
        [
            ("t_micelio", "Micelio visible"),
            ("t_exudados", "Exudados / gomosis / resinas"),
            ("t_descamacion", "Descamación / perforaciones / pudrición"),
        ],
    ),
    ("raiz", [("r_pudricion", "Pudrición en la base"), ("r_cortes", "Cortes por podas mal realizadas")]),
    (
        "plagas",
        [
            ("p_termitas", "Nidos de termitas"),
            ("p_arrieras", "Hormigas arrieras"),
            ("p_telaranas", "Telarañas densas"),
            ("p_pulgones", "Pulgones"),
            ("p_cochinillas", "Cochinillas"),
        ],
    ),
]


def cargar_catalogos(db: Session) -> None:
    for datos in INSTITUCIONES:
        if db.get(InstitucionModel, datos["id"]) is None:
            db.add(InstitucionModel(**datos))
    for modelo, lista in ((ZonaModel, ZONAS), (InterferenciaModel, INTERFERENCIAS)):
        for orden, (codigo, nombre) in enumerate(lista, start=1):
            if db.get(modelo, codigo) is None:
                db.add(modelo(codigo=codigo, nombre=nombre, orden=orden))
    existentes = set(db.scalars(select(EspecieModel.nombre_cientifico)))
    for comun, cientifico in ESPECIES:
        if cientifico not in existentes:
            db.add(EspecieModel(nombre_comun=comun, nombre_cientifico=cientifico))
    orden = 0
    for grupo, items in HALLAZGOS:
        for codigo, nombre in items:
            orden += 1
            if db.get(HallazgoModel, codigo) is None:
                db.add(HallazgoModel(codigo=codigo, grupo=grupo, nombre=nombre, orden=orden))
    db.commit()
