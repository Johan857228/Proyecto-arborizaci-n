import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { InstitucionSelector, useInstitucionElegida } from '@/features/perfil/components/InstitucionSelector';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin } from '@/features/perfil/schemas';
import { useLaboratorio, VARIABLES, type DatoLaboratorio, type Variable } from '@/features/laboratorio/api';
import { Dispersion, Histograma } from '@/features/laboratorio/components/Graficas';
import {
  clasesModales,
  describirCorrelacion,
  medidas,
  muestraAleatoria,
  regresion,
  tablaFrecuencias,
  type ClaseFrecuencia,
} from '@/features/laboratorio/estadistica';
import { ChoiceChip, PrimaryButton, SelectField } from '@/shared/components/FormControls';
import { AppHeader, Card, EmptyState, ErrorState, LoadingState, NumberField, Page, StatGrid, StatTile, Tabs } from '@/shared/components/UI';
import { formatFechaHora, formatNumero, hoyIso } from '@/shared/format';
import { crearEstilos } from '@/theme';

type Vista = 'tabla' | 'histograma' | 'medidas' | 'dispersion' | 'datos';
const VISTAS: { label: string; value: Vista }[] = [
  { label: 'Tabla', value: 'tabla' },
  { label: 'Histograma', value: 'histograma' },
  { label: 'Medidas', value: 'medidas' },
  { label: 'Dispersión', value: 'dispersion' },
  { label: 'Datos', value: 'datos' },
];
const TODAS = '__todas__';
const TAMANOS = [10, 20, 30];

const PREGUNTAS: Record<Vista, string[]> = {
  tabla: ['¿En qué intervalo hay más árboles?', '¿Qué porcentaje de árboles está por debajo del intervalo del centro?', '¿Cómo cambiaría la tabla con intervalos más anchos?'],
  histograma: ['¿Dónde se concentran los datos? ¿La forma es simétrica o tiene una cola?', '¿Hay valores muy alejados del resto? ¿De qué árboles son?'],
  medidas: ['¿Por qué la media y la mediana pueden ser distintas?', '¿Qué dice la desviación estándar sobre lo parecidos que son los árboles?', 'Si sacas otra muestra, ¿cambian las medidas? ¿Cuánto?'],
  dispersion: ['¿Al aumentar el DAP aumenta la altura?', '¿Hay árboles que se salen de la tendencia? ¿Por qué podría ser (poda, especie, edad)?', '¿Para qué valores de DAP no conviene usar la recta?'],
  datos: ['Ordena los datos de menor a mayor y busca la mediana a mano.', 'Compara dos especies: ¿cuál tiene árboles más gruesos?'],
};

/** Número de muestra del día: estable mientras dura la clase. */
function semillaDe(fecha: string) {
  return (Number(fecha.replace(/-/g, '')) % 9973) + 1;
}

function TablaFrecuencias({ tabla, unidad }: { tabla: ClaseFrecuencia[]; unidad: string }) {
  const styles = useStyles();
  const fmt = (v: number) => formatNumero(v, Number.isInteger(v) ? 0 : 1);
  return (
    <View accessibilityLabel="Tabla de frecuencias">
      <View style={[styles.fila, styles.filaTitulo]}>
        <Text style={[styles.celda, styles.celdaAncha, styles.encabezado]}>Intervalo ({unidad})</Text>
        <Text style={[styles.celda, styles.encabezado]}>Marca</Text>
        <Text style={[styles.celda, styles.encabezado]}>f</Text>
        <Text style={[styles.celda, styles.encabezado]}>fr %</Text>
        <Text style={[styles.celda, styles.encabezado]}>F</Text>
      </View>
      {tabla.map((c, i) => (
        <View key={c.desde} style={styles.fila}>
          <Text style={[styles.celda, styles.celdaAncha]}>{`[${fmt(c.desde)}, ${fmt(c.hasta)}${i === tabla.length - 1 ? ']' : ')'}`}</Text>
          <Text style={styles.celda}>{fmt(c.marca)}</Text>
          <Text style={[styles.celda, styles.negrita]}>{c.frecuencia}</Text>
          <Text style={styles.celda}>{formatNumero(c.relativa, 1)}</Text>
          <Text style={styles.celda}>{c.acumulada}</Text>
        </View>
      ))}
    </View>
  );
}

function Explicacion({ children }: { children: string }) {
  const styles = useStyles();
  return <Text style={styles.explicacion}>{children}</Text>;
}

/** Laboratorio de Matemáticas con las medidas reales de los árboles del colegio. */
export function LaboratorioScreen() {
  const styles = useStyles();
  const params = useLocalSearchParams<{ variable?: string; vista?: string }>();
  const perfil = useMiPerfil();
  const admin = esAdmin(perfil.data);
  const institucion = useInstitucionElegida();
  const datos = useLaboratorio(institucion.institucionId, !perfil.isLoading);

  const [variable, setVariable] = useState<Variable>(params.variable && params.variable in VARIABLES ? (params.variable as Variable) : 'dap_cm');
  const [vista, setVista] = useState<Vista>(VISTAS.some((v) => v.value === params.vista) ? (params.vista as Vista) : 'tabla');
  const [especie, setEspecie] = useState(TODAS);
  const [tamano, setTamano] = useState<number | null>(null);
  const [semilla, setSemilla] = useState(() => semillaDe(hoyIso()));
  const [dapEstimar, setDapEstimar] = useState<number>();
  const [todasLasFilas, setTodasLasFilas] = useState(false);

  const arboles = useMemo(() => datos.data?.arboles ?? [], [datos.data]);
  const especies = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const a of arboles) conteo.set(a.especie, (conteo.get(a.especie) ?? 0) + 1);
    return [...conteo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [arboles]);

  const filtrados = useMemo<DatoLaboratorio[]>(
    () => arboles.filter((a) => especie === TODAS || a.especie === especie).filter((a) => variable !== 'copa_m' || a.copa_m != null),
    [arboles, especie, variable],
  );
  const usados = useMemo(() => (tamano ? muestraAleatoria(filtrados, tamano, semilla) : filtrados), [filtrados, tamano, semilla]);
  const esMuestra = tamano != null && tamano < filtrados.length;
  const valores = usados.map((a) => a[variable] as number);
  const info = VARIABLES[variable];
  const tabla = tablaFrecuencias(valores);
  const m = medidas(valores, !esMuestra);
  const modales = clasesModales(tabla);
  const recta = regresion(usados.map((a) => a.dap_cm), usados.map((a) => a.altura_m));
  const fmt = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${formatNumero(v, d)} ${info.unidad}`);

  return (
    <Page onRefresh={() => void datos.refetch()} refreshing={datos.isRefetching}>
      <AppHeader
        eyebrow="Matemáticas"
        title="Laboratorio de datos"
        subtitle="Tablas de frecuencias, histogramas, medidas y la relación DAP-altura con las medidas reales de los árboles del colegio."
      />
      {admin ? <InstitucionSelector value={institucion.institucionId} onChange={institucion.setInstitucionId} /> : null}

      {datos.isLoading || perfil.isLoading ? (
        <LoadingState text="Cargando los datos…" />
      ) : datos.error && !datos.data ? (
        <ErrorState error={datos.error} onRetry={() => void datos.refetch()} />
      ) : !arboles.length ? (
        <EmptyState title="Aún no hay árboles medidos" text="Cuando se registren árboles con DAP y altura, aquí aparecerán sus datos." />
      ) : (
        <>
          <Card title="Datos" subtitle={`${arboles.length} árboles con DAP y altura · datos del ${formatFechaHora(datos.data?.generado_en)}`} icon="laboratorio">
            <Text style={styles.etiqueta}>Variable</Text>
            <View style={styles.chips}>
              {(Object.keys(VARIABLES) as Variable[]).map((v) => (
                <ChoiceChip key={v} label={`${VARIABLES[v].etiqueta} (${VARIABLES[v].unidad})`} selected={variable === v} onPress={() => setVariable(v)} />
              ))}
            </View>
            <SelectField<string>
              label="Especie"
              value={especie}
              options={[{ label: 'Todas las especies', value: TODAS }, ...especies.map(([nombre, n]) => ({ label: `${nombre} (${n})`, value: nombre }))]}
              onChange={setEspecie}
            />
            <Text style={styles.etiqueta}>¿Con cuáles árboles?</Text>
            <View style={styles.chips}>
              <ChoiceChip label={`Todos (${filtrados.length})`} selected={tamano == null} onPress={() => setTamano(null)} />
              {TAMANOS.filter((t) => t < filtrados.length).map((t) => (
                <ChoiceChip key={t} label={`Muestra de ${t}`} selected={tamano === t} onPress={() => setTamano(t)} />
              ))}
            </View>
            {esMuestra ? (
              <View style={styles.muestra}>
                <Text style={styles.meta}>Muestra aleatoria n.° {semilla}: con el mismo número sale la misma muestra.</Text>
                <PrimaryButton title="Otra muestra" icon="refresh" compact variant="secondary" onPress={() => setSemilla(1 + Math.floor(Math.random() * 9999))} />
              </View>
            ) : (
              <Text style={styles.meta}>Con todos los árboles del colegio se trabaja con la población completa.</Text>
            )}
          </Card>

          <Tabs<Vista> value={vista} onChange={setVista} options={VISTAS} />

          {vista === 'tabla' ? (
            <Card title={`Tabla de frecuencias · ${info.etiqueta}`} subtitle={`${valores.length} datos`} icon="list">
              <TablaFrecuencias tabla={tabla} unidad={info.unidad} />
              <Explicacion>
                {`Número de intervalos por la regla de Sturges (k = 1 + 3,322 · log n) y amplitud redondeada a ${formatNumero(tabla.length ? tabla[0].hasta - tabla[0].desde : 0, 1)} ${info.unidad}. Cada intervalo incluye su límite inferior y no el superior, salvo el último. f: frecuencia; fr: frecuencia relativa; F: frecuencia acumulada.`}
              </Explicacion>
            </Card>
          ) : null}

          {vista === 'histograma' ? (
            <Card title={`Histograma · ${info.nombre}`} subtitle={`${valores.length} datos`} icon="chart">
              <Histograma tabla={tabla} unidad={info.unidad} etiqueta={info.etiqueta} />
              <Explicacion>En un histograma las barras van pegadas porque la variable es continua: cada barra es un intervalo de la tabla de frecuencias.</Explicacion>
            </Card>
          ) : null}

          {vista === 'medidas' && m ? (
            <Card title={`Medidas · ${info.etiqueta}`} subtitle={esMuestra ? `Muestra de ${m.n} árboles` : `Los ${m.n} árboles (población)`} icon="chart">
              <StatGrid>
                <StatTile label="Media" value={fmt(m.media)} hint="Suma de los datos ÷ cantidad" />
                <StatTile label="Mediana" value={fmt(m.mediana)} hint="El dato del centro al ordenarlos" />
                <StatTile
                  label={modales.length > 1 ? 'Clases modales' : 'Clase modal'}
                  value={modales.length ? modales.map((c) => `${formatNumero(c.desde, 1)}–${formatNumero(c.hasta, 1)}`).join(' y ') : '—'}
                  hint={`El intervalo con más árboles (${info.unidad})`}
                />
                <StatTile label="Rango" value={fmt(m.rango)} hint={`De ${fmt(m.minimo)} a ${fmt(m.maximo)}`} />
                <StatTile
                  label={m.poblacion ? 'Desviación estándar (σ)' : 'Desviación estándar (s)'}
                  value={fmt(m.desviacion, 2)}
                  hint={m.poblacion ? 'De la población: divide entre n' : 'De la muestra: divide entre n − 1'}
                />
                <StatTile label="Cuartiles Q1 y Q3" value={`${formatNumero(m.q1, 1)} y ${formatNumero(m.q3, 1)}`} hint={`Rango intercuartílico: ${fmt(m.riq)}`} />
              </StatGrid>
              <Explicacion>
                La desviación estándar mide qué tanto se alejan los datos de la media: si es pequeña, los árboles se parecen entre sí. Los cuartiles parten los datos ordenados en cuatro grupos con el mismo número de árboles.
              </Explicacion>
            </Card>
          ) : null}

          {vista === 'dispersion' ? (
            <Card title="Dispersión DAP-altura" subtitle={`${usados.length} árboles`} icon="laboratorio">
              <Dispersion puntos={usados.map((a) => ({ id: a.id, x: a.dap_cm, y: a.altura_m }))} recta={recta} />
              {recta ? (
                <>
                  <View style={styles.resultado}>
                    <Text style={styles.ecuacion}>{`altura = ${formatNumero(recta.a, 2)} ${recta.b >= 0 ? '+' : '−'} ${formatNumero(Math.abs(recta.b), 3)} × DAP`}</Text>
                    <Text style={styles.meta}>{`r = ${formatNumero(recta.r, 2)} · r² = ${formatNumero(recta.r2, 2)} · ${describirCorrelacion(recta.r)}`}</Text>
                  </View>
                  <NumberField label="Estimar la altura para un DAP de (cm)" value={dapEstimar} onChange={setDapEstimar} />
                  {dapEstimar != null ? (
                    <Text style={styles.texto}>
                      {`La recta estima ${formatNumero(Math.max(0, recta.a + recta.b * dapEstimar), 1)} m.`}
                      {dapEstimar < Math.min(...usados.map((a) => a.dap_cm)) || dapEstimar > Math.max(...usados.map((a) => a.dap_cm))
                        ? ' Ojo: ese DAP está fuera del rango de los datos, así que la estimación es poco confiable.'
                        : ''}
                    </Text>
                  ) : null}
                  <Explicacion>
                    La pendiente dice cuántos metros aumenta la altura, en promedio, por cada centímetro de DAP. r va de −1 a 1: cerca de 1 los puntos siguen casi una recta creciente; cerca de 0 no hay relación lineal. Correlación no es causa.
                  </Explicacion>
                </>
              ) : (
                <Text style={styles.meta}>Se necesitan al menos 3 árboles con medidas distintas para calcular la recta.</Text>
              )}
            </Card>
          ) : null}

          {vista === 'datos' ? (
            <Card title="Datos" subtitle={`${usados.length} árboles. Sin datos de personas.`} icon="list">
              <View style={[styles.fila, styles.filaTitulo]}>
                <Text style={[styles.celda, styles.encabezado]}>Código</Text>
                <Text style={[styles.celda, styles.celdaAncha, styles.encabezado]}>Especie</Text>
                <Text style={[styles.celda, styles.encabezado]}>DAP</Text>
                <Text style={[styles.celda, styles.encabezado]}>Altura</Text>
                <Text style={[styles.celda, styles.encabezado]}>Copa</Text>
              </View>
              {(todasLasFilas ? usados : usados.slice(0, 40)).map((a) => (
                <View key={a.id} style={styles.fila}>
                  <Text style={styles.celda}>{a.codigo ?? '—'}</Text>
                  <Text style={[styles.celda, styles.celdaAncha]} numberOfLines={1}>{a.especie}</Text>
                  <Text style={styles.celda}>{formatNumero(a.dap_cm, 1)}</Text>
                  <Text style={styles.celda}>{formatNumero(a.altura_m, 1)}</Text>
                  <Text style={styles.celda}>{a.copa_m == null ? '—' : formatNumero(a.copa_m, 1)}</Text>
                </View>
              ))}
              {usados.length > 40 ? (
                <PrimaryButton title={todasLasFilas ? 'Ver menos' : `Ver los ${usados.length}`} variant="ghost" compact onPress={() => setTodasLasFilas(!todasLasFilas)} />
              ) : null}
              <Text style={styles.meta}>DAP y copa en centímetros y metros, altura en metros.</Text>
            </Card>
          ) : null}

          <Card title="Preguntas para la clase" icon="review">
            {PREGUNTAS[vista].map((p) => <Text key={p} style={styles.texto}>• {p}</Text>)}
          </Card>
        </>
      )}
    </Page>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  etiqueta: { color: palette.muted, fontSize: 12, fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  meta: { flex: 1, color: palette.muted, fontSize: 12, lineHeight: 17 },
  texto: { color: palette.ink, fontSize: 14, lineHeight: 21 },
  explicacion: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 10 },
  muestra: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  fila: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: palette.line },
  filaTitulo: { backgroundColor: palette.tile, borderRadius: 8 },
  celda: { flex: 1, color: palette.ink, fontSize: 13, paddingHorizontal: 4 },
  celdaAncha: { flex: 1.8 },
  encabezado: { color: palette.muted, fontFamily: fonts.bold, fontSize: 12 },
  negrita: { fontFamily: fonts.bold },
  resultado: { gap: 4, marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: palette.tile },
  ecuacion: { color: palette.ink, fontSize: 16, fontFamily: fonts.bold },
}));
