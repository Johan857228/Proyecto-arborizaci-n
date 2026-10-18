/**
 * Tamizaje visual del riesgo de caída: mismas reglas que backend/servicios/riesgo_caida.py (si
 * cambian allá, hay que cambiarlas aquí). Están en la app para orientar a quien inspecciona en el
 * momento, aunque no haya señal: la categoría oficial es la que guarda el servidor.
 *
 * Es un tamizaje, no un dictamen técnico: la poda o tala de un árbol urbano la autoriza la
 * autoridad ambiental, previa visita técnica (Decreto 1076 de 2015, art. 2.2.1.1.9.3).
 */
export const PROBABILIDADES = ['improbable', 'posible', 'probable', 'inminente'] as const;
export const OCUPACIONES = ['rara', 'ocasional', 'frecuente', 'constante'] as const;
export const CATEGORIAS = ['bajo', 'medio', 'alto', 'inminente'] as const;

export type Probabilidad = (typeof PROBABILIDADES)[number];
export type Ocupacion = (typeof OCUPACIONES)[number];
export type CategoriaRiesgo = (typeof CATEGORIAS)[number];

interface Opcion {
  valor: string;
  etiqueta: string;
  /** Probabilidad de falla que indica (sin valor: no es una señal de riesgo). */
  nivel?: Probabilidad;
  /** Cómo se explica en el resultado. */
  motivo?: string;
}

export interface Pregunta {
  clave: 'inclinacion' | 'raices' | 'ramas_secas' | 'cavidades' | 'hongos' | 'grietas';
  titulo: string;
  ayuda: string;
  opciones: Opcion[];
}

export const PREGUNTAS: Pregunta[] = [
  {
    clave: 'inclinacion',
    titulo: 'Inclinación',
    ayuda: 'Mira el tronco desde dos lados.',
    opciones: [
      { valor: 'ninguna', etiqueta: 'Derecho' },
      { valor: 'leve', etiqueta: 'Leve', nivel: 'posible', motivo: 'Inclinación leve' },
      { valor: 'marcada', etiqueta: 'Marcada', nivel: 'probable', motivo: 'Inclinación marcada' },
      { valor: 'reciente', etiqueta: 'Se inclinó hace poco (suelo levantado)', nivel: 'inminente', motivo: 'Se inclinó hace poco: suelo levantado o agrietado al pie' },
    ],
  },
  {
    clave: 'raices',
    titulo: 'Raíces',
    ayuda: 'Revisa el pie del árbol y el suelo alrededor.',
    opciones: [
      { valor: 'sanas', etiqueta: 'Sin daños visibles' },
      { valor: 'expuestas', etiqueta: 'Expuestas', nivel: 'posible', motivo: 'Raíces expuestas' },
      { valor: 'danadas', etiqueta: 'Cortadas, rotas o podridas', nivel: 'probable', motivo: 'Raíces cortadas, rotas o podridas' },
    ],
  },
  {
    clave: 'ramas_secas',
    titulo: 'Ramas secas',
    ayuda: 'Sin hojas ni corteza verde.',
    opciones: [
      { valor: 'ninguna', etiqueta: 'No hay' },
      { valor: 'pequenas', etiqueta: 'Delgadas (como un dedo)', nivel: 'posible', motivo: 'Ramas secas delgadas' },
      { valor: 'grandes', etiqueta: 'Gruesas (como un brazo o más)', nivel: 'probable', motivo: 'Ramas secas gruesas' },
      { valor: 'colgando', etiqueta: 'Rotas o colgando', nivel: 'inminente', motivo: 'Ramas rotas o colgando' },
    ],
  },
  {
    clave: 'cavidades',
    titulo: 'Huecos o pudrición',
    ayuda: 'En el tronco o en la base.',
    opciones: [
      { valor: 'ninguna', etiqueta: 'No hay' },
      { valor: 'pequena', etiqueta: 'Pequeños', nivel: 'posible', motivo: 'Cavidad pequeña' },
      { valor: 'grande', etiqueta: 'Grandes (más que una mano)', nivel: 'probable', motivo: 'Cavidad o pudrición grande en el tronco o la base' },
    ],
  },
  {
    clave: 'hongos',
    titulo: 'Hongos',
    ayuda: 'Setas, repisas o polvo de hongo.',
    opciones: [
      { valor: 'ninguno', etiqueta: 'No hay' },
      { valor: 'en_ramas', etiqueta: 'En ramas', nivel: 'posible', motivo: 'Hongos en ramas' },
      { valor: 'en_tronco_o_base', etiqueta: 'En tronco, base o raíces', nivel: 'probable', motivo: 'Hongos en el tronco, la base o las raíces' },
    ],
  },
  {
    clave: 'grietas',
    titulo: 'Grietas',
    ayuda: 'Rajaduras en la madera, no en la corteza.',
    opciones: [
      { valor: 'ninguna', etiqueta: 'No hay' },
      { valor: 'en_ramas', etiqueta: 'En ramas', nivel: 'posible', motivo: 'Grietas en ramas' },
      { valor: 'en_tronco_o_union', etiqueta: 'En el tronco o donde se unen ramas grandes', nivel: 'probable', motivo: 'Grietas en el tronco o en la unión de las ramas principales' },
      { valor: 'abriendose', etiqueta: 'Se abre o se mueve con el viento', nivel: 'inminente', motivo: 'Grieta que se abre o se mueve con el viento' },
    ],
  },
];

export const DEBAJO = [
  { valor: 'aulas', etiqueta: 'Aulas o edificios', ocupacion: 'constante', nombre: 'aulas o edificios' },
  { valor: 'paso', etiqueta: 'Pasillos, entradas o caminos', ocupacion: 'constante', nombre: 'pasillos, entradas o caminos' },
  { valor: 'recreo', etiqueta: 'Zona de recreo o descanso', ocupacion: 'constante', nombre: 'zona de recreo o de descanso' },
  { valor: 'cancha', etiqueta: 'Cancha', ocupacion: 'frecuente', nombre: 'cancha o zona deportiva' },
  { valor: 'parqueadero', etiqueta: 'Parqueadero', ocupacion: 'frecuente', nombre: 'parqueadero' },
  { valor: 'via', etiqueta: 'Vía o andén público', ocupacion: 'frecuente', nombre: 'vía o andén público' },
  { valor: 'cables', etiqueta: 'Cables eléctricos', ocupacion: 'frecuente', nombre: 'cables eléctricos' },
  { valor: 'poco_uso', etiqueta: 'Zona verde con poco paso', ocupacion: 'ocasional', nombre: 'zona verde con poco paso' },
  { valor: 'cerrada', etiqueta: 'Área cerrada, sin acceso', ocupacion: 'rara', nombre: 'área cerrada, sin acceso' },
] as const satisfies readonly { valor: string; etiqueta: string; ocupacion: Ocupacion; nombre: string }[];

export type DebajoDelArbol = (typeof DEBAJO)[number]['valor'];

export interface Tamizaje {
  inclinacion: 'ninguna' | 'leve' | 'marcada' | 'reciente';
  raices: 'sanas' | 'expuestas' | 'danadas';
  ramas_secas: 'ninguna' | 'pequenas' | 'grandes' | 'colgando';
  cavidades: 'ninguna' | 'pequena' | 'grande';
  hongos: 'ninguno' | 'en_ramas' | 'en_tronco_o_base';
  grietas: 'ninguna' | 'en_ramas' | 'en_tronco_o_union' | 'abriendose';
  debajo: DebajoDelArbol[];
}

export const TAMIZAJE_INICIAL: Tamizaje = {
  inclinacion: 'ninguna',
  raices: 'sanas',
  ramas_secas: 'ninguna',
  cavidades: 'ninguna',
  hongos: 'ninguno',
  grietas: 'ninguna',
  debajo: [],
};

// Filas: probabilidad de falla. Columnas: ocupación (rara, ocasional, frecuente, constante).
const MATRIZ: Record<Probabilidad, readonly [CategoriaRiesgo, CategoriaRiesgo, CategoriaRiesgo, CategoriaRiesgo]> = {
  improbable: ['bajo', 'bajo', 'bajo', 'bajo'],
  posible: ['bajo', 'bajo', 'medio', 'medio'],
  probable: ['bajo', 'medio', 'alto', 'alto'],
  inminente: ['medio', 'alto', 'inminente', 'inminente'],
};

export const ACCIONES: Record<CategoriaRiesgo, string> = {
  inminente:
    'Aleja a las personas y acordona el área ahora. Avisa a rectoría y, si hay peligro inmediato, llama al 123. Pide la visita técnica urgente de la autoridad ambiental.',
  alto: 'Restringe el paso debajo del árbol, avisa a rectoría y pide la visita técnica de la autoridad ambiental en los próximos días. Programa la intervención.',
  medio: 'Programa una revisión de seguimiento en uno a tres meses y el mantenimiento que haga falta.',
  bajo: 'Seguimiento normal en la próxima ronda de inspección.',
};

export const NOMBRE_CATEGORIA: Record<CategoriaRiesgo, string> = {
  bajo: 'Bajo',
  medio: 'Medio',
  alto: 'Alto',
  inminente: 'Inminente',
};

/** Alto e inminente abren una alerta que confirma un docente y se avisa a rectoría. */
export function abreAlerta(categoria: CategoriaRiesgo | null | undefined) {
  return categoria === 'alto' || categoria === 'inminente';
}

const PEQUENO_ALTURA_M = 3;
const PEQUENO_DAP_CM = 10;

export interface ResultadoLocal {
  probabilidad: Probabilidad;
  ocupacion: Ocupacion;
  categoria: CategoriaRiesgo;
  motivos: string[];
  accion: string;
}

export function evaluarTamizaje(respuestas: Tamizaje, alturaM?: number | null, dapCm?: number | null): ResultadoLocal {
  let probabilidad: Probabilidad = 'improbable';
  const motivos: string[] = [];
  for (const pregunta of PREGUNTAS) {
    const opcion = pregunta.opciones.find((o) => o.valor === respuestas[pregunta.clave]);
    if (opcion?.nivel && opcion.motivo) {
      motivos.push(opcion.motivo);
      if (PROBABILIDADES.indexOf(opcion.nivel) > PROBABILIDADES.indexOf(probabilidad)) probabilidad = opcion.nivel;
    }
  }

  const debajo = DEBAJO.filter((d) => respuestas.debajo.includes(d.valor));
  const ocupacion = debajo.length
    ? debajo.map((d) => d.ocupacion).reduce((a, b) => (OCUPACIONES.indexOf(b) > OCUPACIONES.indexOf(a) ? b : a))
    : 'ocasional';
  let categoria = MATRIZ[probabilidad][OCUPACIONES.indexOf(ocupacion)];
  // Mismo orden que el servidor (que las recibe ordenadas por su código), no el orden en que se tocaron.
  const ordenadas = [...debajo].sort((a, b) => (a.valor < b.valor ? -1 : a.valor > b.valor ? 1 : 0));
  if (debajo.length) motivos.push(`Debajo: ${ordenadas.map((d) => d.nombre).join(', ')}`);

  const pequeno = alturaM != null && dapCm != null && alturaM <= PEQUENO_ALTURA_M && dapCm <= PEQUENO_DAP_CM;
  if (pequeno && categoria !== 'bajo') {
    categoria = CATEGORIAS[CATEGORIAS.indexOf(categoria) - 1];
    motivos.push('Árbol pequeño: si falla, el daño posible es menor');
  }
  return { probabilidad, ocupacion, categoria, motivos, accion: ACCIONES[categoria] };
}
