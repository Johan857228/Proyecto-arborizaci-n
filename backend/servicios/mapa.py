"""Capas del mapa del arbolado: sedes, árboles por estado, riesgo de caída, especie, origen
(nativa o exótica) y siembras recientes.

Origen de cada especie: lo que guardó el administrador en `especies.origen` (migración 011) y,
si no hay nada guardado, la lista de abajo, que solo incluye especies cuyo origen en Colombia
no se discute. Las demás quedan "sin clasificar" hasta que alguien las clasifique.

Siembra reciente: plántula registrada en los últimos 12 meses. La app no tiene un registro
de siembras aparte, y un árbol grande que se registra por primera vez no es una siembra.
"""
from collections import Counter
from datetime import date, datetime, timedelta

NATIVA, EXOTICA = "nativa", "exotica"
DIAS_SIEMBRA = 365
ESTADOS = ("sano", "riesgo", "critico")
RIESGOS = ("bajo", "medio", "alto", "inminente")

# Nombre científico (género y especie, sin autor) -> origen en Colombia.
ORIGEN_CONOCIDO: dict[str, str] = {
    **dict.fromkeys(
        [
            "tabebuia rosea", "handroanthus chrysanthus", "tabebuia chrysantha", "handroanthus billbergii",
            "tabebuia billbergii", "handroanthus serratifolius", "tabebuia serratifolia", "bulnesia arborea",
            "guaiacum officinale", "samanea saman", "albizia saman", "enterolobium cyclocarpum",
            "anacardium excelsum", "ceiba pentandra", "pachira quinata", "bombacopsis quinata", "hura crepitans",
            "guazuma ulmifolia", "cassia grandis", "crescentia cujete", "spondias mombin", "cordia alliodora",
            "cedrela odorata", "swietenia macrophylla", "platymiscium pinnatum", "astronium graveolens",
            "brownea ariza", "coccoloba uvifera", "ficus insipida", "psidium guajava",
            "melicoccus bijugatus", "sabal mauritiiformis", "attalea butyracea",
            "copernicia tectorum", "bursera simaruba", "bursera graveolens", "prosopis juliflora",
            "libidibia ebano", "caesalpinia ebano", "cochlospermum vitifolium", "jacaranda caucana",
            "pseudosamanea guachapele", "albizia guachapele", "ochroma pyramidale", "tecoma stans",
            "cecropia peltata", "inga edulis", "sterculia apetala", "myrospermum frutescens",
            "erythrina fusca", "erythrina poeppigiana", "pithecellobium dulce", "genipa americana",
            "hymenaea courbaril", "calycophyllum candidissimum", "triplaris americana", "zygia longifolia",
        ],
        NATIVA,
    ),
    **dict.fromkeys(
        [
            "mangifera indica", "azadirachta indica", "terminalia catappa", "ficus benjamina", "ficus microcarpa",
            "ficus elastica", "delonix regia", "cassia fistula", "leucaena leucocephala", "albizia lebbeck",
            "senna siamea", "cassia siamea", "tamarindus indica", "melia azedarach", "cocos nucifera",
            "citrus limon", "citrus sinensis", "citrus aurantiifolia", "citrus reticulata", "eucalyptus camaldulensis",
            "eucalyptus globulus", "casuarina equisetifolia", "spathodea campanulata", "acacia mangium",
            "gmelina arborea", "tectona grandis", "artocarpus altilis", "syzygium malaccense", "syzygium jambos",
            "syzygium cumini", "moringa oleifera", "polyalthia longifolia", "pinus caribaea",
            "bambusa vulgaris", "dypsis lutescens", "adonidia merrillii", "veitchia merrillii", "terminalia mantaly",
            "peltophorum pterocarpum", "cassia javanica", "kigelia africana", "jacaranda mimosifolia",
            "averrhoa carambola", "melaleuca quinquenervia", "callistemon citrinus",
        ],
        EXOTICA,
    ),
}


def clave_cientifica(nombre: str | None) -> str:
    """'Tabebuia rosea (Bertol.) DC.' -> 'tabebuia rosea'. Quita el signo de híbrido."""
    palabras = [p for p in (nombre or "").lower().replace("×", " ").split() if p not in ("x", "×")]
    return " ".join(palabras[:2])


def origen_sugerido(nombre_cientifico: str | None) -> str | None:
    return ORIGEN_CONOCIDO.get(clave_cientifica(nombre_cientifico))


def origen_de(nombre_cientifico: str | None, guardado: str | None = None) -> str | None:
    """Lo que guardó el administrador manda sobre la lista."""
    return guardado if guardado in (NATIVA, EXOTICA) else origen_sugerido(nombre_cientifico)


def _fecha(valor) -> date | None:
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    if isinstance(valor, str) and len(valor) >= 10:
        try:
            return date.fromisoformat(valor[:10])
        except ValueError:
            return None
    return None


def es_siembra(arbol: dict, hoy: date) -> bool:
    registrado = _fecha(arbol.get("registrado_en"))
    return arbol.get("etapa") == "Plántula" and registrado is not None and registrado >= hoy - timedelta(days=DIAS_SIEMBRA)


def limites(puntos: list[tuple[float, float]]) -> dict | None:
    """Rectángulo que encierra los puntos (lat, lng)."""
    if not puntos:
        return None
    lats, lngs = [p[0] for p in puntos], [p[1] for p in puntos]
    return {"sur": min(lats), "oeste": min(lngs), "norte": max(lats), "este": max(lngs)}


def capas(
    arboles: list[dict],
    sedes: list[dict],
    riesgos: dict[str, str],
    alertas: dict[str, str],
    origenes_guardados: dict[str, str | None],
    hoy: date,
) -> dict:
    """Arma todas las capas con una sola pasada por los árboles.

    riesgos: arbol_id -> categoría vigente del tamizaje. alertas: arbol_id -> estado de la
    alerta abierta. origenes_guardados: especie_id -> origen guardado (o None)."""
    filas = []
    especies: dict[str, dict] = {}
    por_sede: Counter = Counter()
    alertas_por_sede: Counter = Counter()
    for a in arboles:
        if a.get("lat") is None or a.get("lng") is None:
            continue
        arbol_id = str(a["id"])
        especie_id = a.get("especie_id")
        clave_especie = str(especie_id) if especie_id is not None else f"nombre:{a.get('nombre_comun')}"
        origen = origen_de(a.get("nombre_cientifico"), origenes_guardados.get(str(especie_id)))
        alerta = alertas.get(arbol_id)
        fila = {
            "id": arbol_id,
            "codigo": a.get("codigo"),
            "institucion_id": a.get("institucion_id"),
            "lat": float(a["lat"]),
            "lng": float(a["lng"]),
            "especie_id": especie_id,
            "nombre_comun": a.get("nombre_comun") or "Sin especie",
            "nombre_cientifico": a.get("nombre_cientifico"),
            "origen": origen,
            "estado": a.get("estado"),
            "riesgo": riesgos.get(arbol_id),
            "alerta": alerta,
            "etapa": a.get("etapa"),
            "siembra": es_siembra(a, hoy),
            "zona": a.get("zona_otra") if a.get("zona") == "Otra" and a.get("zona_otra") else a.get("zona"),
            "registrado_en": (_fecha(a.get("registrado_en")) or hoy).isoformat(),
        }
        filas.append(fila)
        por_sede[str(a.get("institucion_id"))] += 1
        if alerta:
            alertas_por_sede[str(a.get("institucion_id"))] += 1
        especie = especies.setdefault(clave_especie, {
            "especie_id": especie_id, "nombre_comun": fila["nombre_comun"],
            "nombre_cientifico": fila["nombre_cientifico"], "origen": origen,
            "origen_sugerido": origen_sugerido(fila["nombre_cientifico"]), "total": 0,
        })
        especie["total"] += 1

    filas.sort(key=lambda f: str(f["codigo"] or ""))
    sedes_out = [
        {
            "id": str(s["id"]), "nombre": s.get("nombre"), "nombre_corto": s.get("nombre_corto") or s.get("nombre"),
            "prefijo": s.get("prefijo"), "lat": s.get("lat"), "lng": s.get("lng"),
            "arboles": por_sede.get(str(s["id"]), 0), "alertas": alertas_por_sede.get(str(s["id"]), 0),
        }
        for s in sedes
    ]
    origenes = Counter(f["origen"] or "sin_dato" for f in filas)
    clasificados = origenes[NATIVA] + origenes[EXOTICA]
    puntos = [(f["lat"], f["lng"]) for f in filas] or [
        (s["lat"], s["lng"]) for s in sedes_out if s["lat"] is not None and s["lng"] is not None
    ]
    return {
        "arboles": filas,
        "sedes": sedes_out,
        "especies": sorted(especies.values(), key=lambda e: (-e["total"], str(e["nombre_comun"]))),
        "resumen": {
            "total": len(filas),
            "por_estado": {e: sum(1 for f in filas if f["estado"] == e) for e in ESTADOS},
            "por_riesgo": {
                **{r: sum(1 for f in filas if f["riesgo"] == r) for r in RIESGOS},
                "sin_tamizaje": sum(1 for f in filas if f["riesgo"] is None),
            },
            "por_origen": {NATIVA: origenes[NATIVA], EXOTICA: origenes[EXOTICA], "sin_dato": origenes["sin_dato"]},
            "pct_nativas": round(100 * origenes[NATIVA] / clasificados, 1) if clasificados else None,
            "siembras": sum(1 for f in filas if f["siembra"]),
            "alertas": sum(1 for f in filas if f["alerta"]),
            "especies": len(especies),
        },
        "limites": limites(puntos),
    }
