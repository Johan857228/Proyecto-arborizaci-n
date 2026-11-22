"""Árboles de prueba para ver la app con datos, y para borrarlos después.

Crea árboles inventados repartidos entre las instituciones que tienen coordenadas, cerca de cada
sede: especies del catálogo, medidas acordes a la etapa, hallazgos (la mayoría sanos, otros en
riesgo o críticos), algunas interferencias, agentes bióticos y tamizaje de riesgo de caída. Cada
árbol nace con su inspección de registro pendiente de revisión, así que también sirven para probar
la revisión docente. La nota de esa inspección dice que es un dato de prueba: es la marca con la
que `borrar` los encuentra.

Usa la llave de servicio del .env, así que escribe en el proyecto de Supabase que diga ese archivo.

    python arboles_prueba.py crear --cantidad 65            # crea 65 árboles
    python arboles_prueba.py crear --cantidad 65 --simular  # muestra qué crearía, sin escribir
    python arboles_prueba.py borrar                         # borra todos los árboles de prueba

Opciones de crear: --autor <usuario_id> (quién aparece como registrador; por defecto el primer
administrador activo) y --semilla (la misma semilla da los mismos árboles).
"""
import argparse
import math
import random
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone

import db
from comun import traer_todo
from routers.inspecciones import InspeccionCrear, registrar_inspeccion
from routers import zonas as rutas_zonas
from schemas import ZONAS_POR_DEFECTO

MARCA = "Árbol de prueba: datos inventados para revisar cómo se ve la app."
DIAS_ATRAS = 120

# (etapa, peso, DAP cm, altura m, copa m)
ETAPAS = [
    ("Plántula", 12, (1.0, 4.0), (0.4, 1.6), (0.3, 1.2)),
    ("Juvenil", 30, (5.0, 18.0), (2.0, 6.0), (1.5, 4.5)),
    ("Adulto", 48, (20.0, 70.0), (6.0, 16.0), (4.0, 12.0)),
    ("Senescente", 10, (50.0, 110.0), (8.0, 18.0), (6.0, 14.0)),
]
# Especies más comunes en colegios de Valledupar: salen más seguido.
FRECUENTES = {"Mango": 5, "Nim": 4, "Mamón": 4, "Almendro": 3, "Cañaguate": 3, "Roble morado": 3, "Samán": 2, "Caracolí": 2}
INTERFERENCIAS = ["Levantamiento de pisos", "Cables eléctricos", "Afectación de muros"]
DEBAJO = ["aulas", "paso", "recreo", "cancha", "parqueadero", "via", "cables", "poco_uso"]


def _redondear(valor: float) -> float:
    return round(valor, 1)


def _punto_cerca(azar: random.Random, lat: float, lng: float, zona: int) -> tuple[float, float]:
    """Un punto a 15–70 m de la sede, en el sector de su zona (cada zona hacia un lado)."""
    angulo = zona * 1.6 + azar.uniform(-0.5, 0.5)
    distancia = azar.uniform(15, 70)
    dlat = distancia * math.cos(angulo) / 111_320
    dlng = distancia * math.sin(angulo) / (111_320 * math.cos(math.radians(lat)))
    return round(lat + dlat, 6), round(lng + dlng, 6)


def _hallazgos(azar: random.Random, codigos: list[str]) -> list[str]:
    """La mayoría sanos; unos con 1 a 3 hallazgos (en riesgo) y pocos con 4 o más (críticos)."""
    cuantos = azar.choices([0, azar.randint(1, 3), azar.randint(4, 6)], weights=[55, 30, 15])[0]
    return sorted(azar.sample(codigos, min(cuantos, len(codigos))))


def _bioticos(azar: random.Random) -> dict:
    datos: dict = {}
    if azar.random() < 0.15:
        datos |= {"insectos": azar.choice(["defoliadores", "chupadores", "escamas", "arrieras"]),
                  "insectos_parte": azar.choice(["hojas", "ramas", "tronco"]), "insectos_sev": azar.randint(1, 3)}
    if azar.random() < 0.08:
        datos |= {"enfermedad": azar.choice(["fungica", "indeterminada"]), "enfermedad_parte": azar.choice(["hojas", "tronco"]),
                  "enfermedad_sev": azar.randint(1, 3)}
    if azar.random() < 0.05:
        datos |= {"hemiparasitas": "pajarito", "pct_hemiparasitas": azar.choice([5, 10, 20])}
    if azar.random() < 0.10:
        datos["bejucos"] = azar.randint(1, 3)
    if azar.random() < 0.15:
        datos["epifitas"] = azar.sample(["bromelias", "liquenes", "musgos", "helechos"], azar.randint(1, 2))
    return datos


def _tamizaje(azar: random.Random, hallazgos: int, etapa: str) -> dict:
    """Casi todos sin señales; unos pocos árboles grandes con señales que abren una alerta."""
    debajo = azar.sample(DEBAJO, azar.randint(1, 2))
    if etapa in ("Adulto", "Senescente") and hallazgos >= 4 and azar.random() < 0.5:
        return {"ramas_secas": "grandes", "cavidades": azar.choice(["pequena", "grande"]), "debajo": ["recreo", "paso"]}
    if hallazgos and azar.random() < 0.3:
        return {"ramas_secas": "pequenas", "debajo": debajo}
    return {"debajo": debajo}


def _zonas(admin, institucion_id: str) -> list[str]:
    """Zonas de la institución sin escribir nada: las guardadas o, si no hay, las de siempre."""
    filas = rutas_zonas._filas(admin, institucion_id)
    return [f["nombre"] for f in filas] if filas else list(ZONAS_POR_DEFECTO)


def _inspeccion(a: dict) -> InspeccionCrear:
    return InspeccionCrear(lat=a["lat"], lng=a["lng"], precision_gps_m=a["precision_gps_m"], dap_cm=a["dap_cm"],
                           altura_m=a["altura_m"], copa_m=a["copa_m"], etapa=a["etapa"], interferencia=a["interferencia"],
                           observaciones=a["observaciones"], notas=MARCA, tamizaje=a["tamizaje"], **a["bioticos"])


def _plan(cantidad: int, semilla: int, instituciones: list[dict], zonas_por_inst: dict[str, list[str]],
          especies: list[dict], codigos: list[str]) -> list[dict]:
    azar = random.Random(semilla)
    # La primera institución lleva la mitad; el resto se reparte entre las demás.
    pesos = [3] + [2] * (len(instituciones) - 1)
    pesos_especie = [FRECUENTES.get(e["nombre_comun"], 1) for e in especies]
    ahora = datetime.now(timezone.utc)
    arboles = []
    for _ in range(cantidad):
        inst = azar.choices(instituciones, weights=pesos)[0]
        zonas = zonas_por_inst[inst["id"]]
        zona_i = azar.randrange(len(zonas))
        etapa, _, dap, alt, copa = azar.choices(ETAPAS, weights=[e[1] for e in ETAPAS])[0]
        lat, lng = _punto_cerca(azar, float(inst["lat"]), float(inst["lng"]), zona_i)
        hallazgos = _hallazgos(azar, codigos)
        arboles.append({
            "institucion_id": inst["id"],
            "zona": zonas[zona_i],
            "lat": lat,
            "lng": lng,
            "especie_id": azar.choices(especies, weights=pesos_especie)[0]["id"],
            "dap_cm": _redondear(azar.uniform(*dap)),
            "altura_m": _redondear(min(azar.uniform(*alt), 25)),
            "copa_m": _redondear(azar.uniform(*copa)),
            "etapa": etapa,
            "interferencia": azar.choice(INTERFERENCIAS) if azar.random() < 0.15 else "Ninguna",
            "observaciones": hallazgos,
            "bioticos": _bioticos(azar),
            "tamizaje": _tamizaje(azar, len(hallazgos), etapa),
            "precision_gps_m": _redondear(azar.uniform(3, 12)),
            "registrado_en": (ahora - timedelta(days=azar.uniform(0, DIAS_ATRAS))).isoformat(),
        })
    return sorted(arboles, key=lambda a: a["registrado_en"])


def _autor(admin, autor: str | None) -> str:
    perfiles = traer_todo(admin, "perfiles", "usuario_id, rol, activo", orden="usuario_id")
    if autor:
        if not any(str(p["usuario_id"]) == autor for p in perfiles):
            sys.exit(f"No hay un usuario con id {autor}")
        return autor
    admins = [p for p in perfiles if p["rol"] == "administrador" and p.get("activo", True)]
    if not admins:
        sys.exit("No hay un administrador activo: indica --autor <usuario_id>")
    return str(admins[0]["usuario_id"])


def crear(cantidad: int, semilla: int, autor: str | None, simular: bool) -> None:
    admin = db.get_admin()
    instituciones = [i for i in admin.table("instituciones").select("id, nombre_corto, lat, lng").order("prefijo").execute().data
                     if i.get("lat") is not None and i.get("lng") is not None]
    especies = admin.table("especies").select("id, nombre_comun").order("id").execute().data
    codigos = [o["codigo"] for o in admin.table("observaciones_catalogo").select("codigo").execute().data]
    if not instituciones or not especies:
        sys.exit("Faltan instituciones con coordenadas o especies en el catálogo")
    zonas_por_inst = {i["id"]: _zonas(admin, i["id"]) for i in instituciones}
    plan = _plan(cantidad, semilla, instituciones, zonas_por_inst, especies, codigos)
    for a in plan:
        _inspeccion(a)  # valida con las mismas reglas del backend antes de escribir nada
    usuario = _autor(admin, autor)

    nombres = {i["id"]: i["nombre_corto"] for i in instituciones}
    print(f"{len(plan)} árboles: " + ", ".join(f"{nombres[k]} {n}" for k, n in Counter(a["institucion_id"] for a in plan).items()))
    print("Por etapa:", dict(Counter(a["etapa"] for a in plan)), "· con hallazgos:", sum(1 for a in plan if a["observaciones"]))
    if simular:
        print("Simulación: no se escribió nada.")
        return

    creados = 0
    for a in plan:
        fila = {k: a[k] for k in ("institucion_id", "zona", "lat", "lng", "especie_id", "dap_cm", "altura_m", "copa_m",
                                  "etapa", "interferencia", "registrado_en")}
        fila["registrado_por"] = usuario
        arbol = admin.table("arboles").insert(fila).execute().data[0]
        try:
            inspeccion = registrar_inspeccion(admin, arbol, _inspeccion(a), "registro", usuario)
            # Con la llave de servicio la base no pone inspector ni fecha: se ponen las del registro.
            admin.table("inspecciones").update({"inspector_id": usuario, "fecha": a["registrado_en"]}).eq("id", inspeccion["id"]).execute()
        except Exception:
            admin.table("arboles").delete().eq("id", arbol["id"]).execute()
            raise
        creados += 1
        print(f"  {arbol.get('codigo', arbol['id'])} · {a['etapa']} · {len(a['observaciones'])} hallazgos")
    print(f"Listo: {creados} árboles de prueba.")


def borrar() -> None:
    admin = db.get_admin()
    marcadas = traer_todo(admin, "inspecciones", "id, arbol_id, notas, origen", filtros=[("eq", ("notas", MARCA))])
    ids = sorted({str(i["arbol_id"]) for i in marcadas if i["origen"] == "registro"})
    for inicio in range(0, len(ids), 50):
        # Inspecciones, hallazgos, tamizajes y alertas se borran en cascada con el árbol.
        admin.table("arboles").delete().in_("id", ids[inicio:inicio + 50]).execute()
    print(f"Borrados {len(ids)} árboles de prueba.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Árboles de prueba en la base de Supabase del .env")
    orden = parser.add_subparsers(dest="orden", required=True)
    p_crear = orden.add_parser("crear", help="crea árboles de prueba")
    p_crear.add_argument("--cantidad", type=int, default=65)
    p_crear.add_argument("--semilla", type=int, default=7)
    p_crear.add_argument("--autor", help="usuario_id de quien aparece como registrador")
    p_crear.add_argument("--simular", action="store_true", help="muestra el plan sin escribir")
    orden.add_parser("borrar", help="borra todos los árboles de prueba")
    args = parser.parse_args()
    if args.orden == "crear":
        crear(args.cantidad, args.semilla, args.autor, args.simular)
    else:
        borrar()


if __name__ == "__main__":
    main()
