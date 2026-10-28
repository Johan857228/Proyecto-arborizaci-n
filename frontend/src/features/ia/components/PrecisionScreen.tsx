import { useState } from 'react';
import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { PruebaCiega } from '@/features/ia/components/PruebaCiega';
import { formatUsd, textoTasa, usePrecisionIA, type Tasa } from '@/features/ia/precision';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin } from '@/features/perfil/schemas';
import { ChoiceChip } from '@/shared/components/FormControls';
import { AppHeader, Badge, Card, EmptyState, ErrorState, LoadingState, Notice, Page, ProgressBar, StatGrid, StatTile, type Tono } from '@/shared/components/UI';
import { formatNumero, formatPesos } from '@/shared/format';
import { crearEstilos } from '@/theme';

// Claves con letra: las numéricas se ordenarían antes que 'todo'.
const PERIODOS = { todo: 'Todo', d90: 'Últimos 90 días', d30: 'Últimos 30 días' } as const;
type Periodo = keyof typeof PERIODOS;

/** Fecha de inicio del periodo (se calcula al elegirlo, no al pintar). */
function desdeDe(periodo: Periodo) {
  if (periodo === 'todo') return undefined;
  return new Date(Date.now() - Number(periodo.slice(1)) * 86_400_000).toISOString().slice(0, 10);
}

function tonoDe(t: Tasa): Tono {
  if (t.pct == null) return 'neutro';
  return t.pct >= 80 ? 'sano' : t.pct >= 60 ? 'riesgo' : 'critico';
}

function Barra({ titulo, tasa, detalle }: { titulo: string; tasa: Tasa; detalle?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.barra}>
      <View style={styles.barraCabeza}>
        <Text style={styles.barraTitulo}>{titulo}</Text>
        <Text style={styles.barraValor}>{tasa.n ? `${tasa.aciertos} de ${tasa.n}` : 'Sin casos'}</Text>
      </View>
      <ProgressBar pct={tasa.pct} tono={tonoDe(tasa)} />
      <Text style={styles.meta}>{textoTasa(tasa)}{detalle ? ` · ${detalle}` : ''}</Text>
    </View>
  );
}

/** Qué tan bien acierta la IA con la especie y cuánto cuesta cada foto (solo administradores). */
export function PrecisionScreen() {
  const styles = useStyles();
  const perfil = useMiPerfil();
  const admin = esAdmin(perfil.data);
  const [periodo, setPeriodo] = useState<{ clave: Periodo; desde?: string }>({ clave: 'todo' });
  const precision = usePrecisionIA(periodo.desde, admin);
  const d = precision.data;
  const c = d?.costo;

  return (
    <Page onRefresh={() => void precision.refetch()} refreshing={precision.isRefetching}>
      <AppHeader
        eyebrow="Savia · Identificación con IA"
        title="Precisión de la IA"
        subtitle="Cuántas veces acierta la especie, comparada con lo que confirma el docente o con pruebas a ciegas, y cuánto cuesta cada foto."
      />
      {!perfil.isLoading && !admin ? (
        <EmptyState title="Solo para administradores" text="La precisión y el costo de la IA los consulta el administrador de Arbolado Escolar." />
      ) : (
        <>
          <View style={styles.chips}>
            {(Object.keys(PERIODOS) as Periodo[]).map((p) => <ChoiceChip key={p} label={PERIODOS[p]} selected={periodo.clave === p} onPress={() => setPeriodo({ clave: p, desde: desdeDe(p) })} />)}
          </View>
          {perfil.isLoading || precision.isLoading ? (
            <LoadingState text="Calculando la precisión…" />
          ) : precision.error && !d ? (
            <ErrorState error={precision.error} onRetry={() => void precision.refetch()} />
          ) : d && c ? (
            <>
              {d.muestra_pequena ? (
                <Notice tono="riesgo">
                  Hay {d.general.n} {d.general.n === 1 ? 'caso' : 'casos'} con la especie confirmada; con menos de {d.muestra_minima} el margen de error es grande. Haz pruebas a ciegas o espera a que los docentes confirmen más registros.
                </Notice>
              ) : null}
              <StatGrid>
                <StatTile label="Acierta la especie" value={d.general.pct == null ? '—' : `${formatNumero(d.general.pct, 0)} %`}
                  hint={d.general.ic95 ? `Entre ${formatNumero(d.general.ic95[0], 0)} y ${formatNumero(d.general.ic95[1], 0)} % (IC 95 %), ${d.general.n} casos` : 'Aún sin casos confirmados'}
                  icon="sparkle" tono={tonoDe(d.general)} />
                <StatTile label="Nativas del bosque seco del Cesar" value={d.bosque_seco_cesar.pct == null ? '—' : `${formatNumero(d.bosque_seco_cesar.pct, 0)} %`}
                  hint={`${d.bosque_seco_cesar.n} casos de ${d.bosque_seco_cesar.especies} especies`} icon="leaf" tono={tonoDe(d.bosque_seco_cesar)} />
                <StatTile label="Costo por foto" value={c.por_foto_cop != null ? formatPesos(c.por_foto_cop) : formatUsd(c.por_foto_usd)}
                  hint={c.por_foto_cop != null ? `${formatUsd(c.por_foto_usd)} · TRM ${formatNumero(c.trm, 0)}` : 'Con IA_TRM en el servidor sale en pesos'} icon="wallet" />
                <StatTile label="Análisis hechos" value={formatNumero(c.analisis, 0)} hint={`${formatNumero(c.fotos, 0)} fotos · total ${formatUsd(c.total_usd)}`} icon="chart" />
              </StatGrid>

              <Card title="Cuándo acierta" subtitle="Un análisis que no sugirió especie cuenta como fallo." icon="chart">
                <Barra titulo="Cuando sugiere una especie" tasa={d.al_sugerir} detalle={`sugiere especie en ${textoTasa(d.cobertura)} de los casos`} />
                <Barra titulo="Confianza alta" tasa={d.por_confianza.alta} />
                <Barra titulo="Confianza media" tasa={d.por_confianza.media} />
                <Barra titulo="Confianza baja" tasa={d.por_confianza.baja} />
                <Barra titulo="Especies nativas" tasa={d.por_origen.nativa} />
                <Barra titulo="Especies exóticas" tasa={d.por_origen.exotica} />
                <Barra titulo="Registros confirmados por un docente" tasa={d.por_tipo.campo} />
                <Barra titulo="Pruebas a ciegas" tasa={d.por_tipo.prueba} />
                <Text style={styles.meta}>
                  Fuera de la medición: {d.fuera.por_revisar} por revisar, {d.fuera.anulados} {d.fuera.anulados === 1 ? 'anulado' : 'anulados'} y {d.fuera.sin_arbol} análisis que no terminaron en un registro.
                </Text>
              </Card>

              {admin ? <PruebaCiega /> : null}

              <Card title="Por especie" subtitle="Especie real; primero las que tienen más casos." icon="tree">
                {d.por_especie.length ? d.por_especie.map((e) => (
                  <View key={e.especie_id} style={styles.especie}>
                    <View style={styles.flex}>
                      <Text style={styles.nombre}>{e.nombre_comun}</Text>
                      <View style={styles.chips}>
                        {e.origen ? <Badge label={e.origen === 'nativa' ? 'Nativa' : 'Exótica'} tono={e.origen === 'nativa' ? 'sano' : 'riesgo'} /> : null}
                        {e.bosque_seco_cesar ? <Badge label="Bosque seco del Cesar" tono="sano" /> : null}
                      </View>
                    </View>
                    <View style={styles.derecha}>
                      <Text style={styles.valor}>{e.pct == null ? '—' : `${formatNumero(e.pct, 0)} %`}</Text>
                      <Text style={styles.meta}>{e.aciertos} de {e.n}</Text>
                    </View>
                  </View>
                )) : <Text style={styles.meta}>Aún no hay casos con la especie confirmada.</Text>}
              </Card>

              {d.confusiones.length ? (
                <Card title="Confusiones frecuentes" subtitle="Qué especie sugirió la IA cuando se equivocó." icon="warning">
                  {d.confusiones.map((x) => (
                    <Text key={`${x.real}-${x.sugerida}`} style={styles.texto}>
                      {x.real} → sugirió {x.sugerida} ({x.veces} {x.veces === 1 ? 'vez' : 'veces'})
                    </Text>
                  ))}
                </Card>
              ) : null}

              <Card title="Costo" subtitle={`Estimado con la tarifa publicada por Anthropic (${d.tarifa}). La factura real está en la consola de Anthropic.`} icon="wallet">
                <Text style={styles.texto}>Por análisis: {formatUsd(c.por_analisis_usd)} · por foto: {formatUsd(c.por_foto_usd)}{c.total_cop != null ? ` · total: ${formatPesos(c.total_cop)}` : ''}</Text>
                <Text style={styles.texto}>
                  Tokens promedio: {formatNumero(c.tokens_entrada_promedio, 0)} de entrada y {formatNumero(c.tokens_salida_promedio, 0)} de salida · tiempo de respuesta típico: {c.duracion_mediana_s == null ? '—' : `${formatNumero(c.duracion_mediana_s, 1)} s`}
                </Text>
                {c.por_modelo.map((m) => (
                  <Text key={m.modelo} style={styles.meta}>
                    {m.modelo}{m.modelo === d.modelo_actual ? ' (modelo actual)' : ' (respaldo)'}: {m.analisis} análisis, {formatUsd(m.total_usd)}
                  </Text>
                ))}
                {c.sin_precio ? <Text style={styles.meta}>{c.sin_precio} análisis con un modelo sin tarifa conocida no entran en el promedio.</Text> : null}
              </Card>
            </>
          ) : null}
        </>
      )}
    </Page>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  flex: { flex: 1, minWidth: 0, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  barra: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.line },
  barraCabeza: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  barraTitulo: { color: palette.ink, fontSize: 14, fontFamily: fonts.semiBold, flexShrink: 1 },
  barraValor: { color: palette.muted, fontSize: 13 },
  especie: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.line },
  nombre: { color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  derecha: { alignItems: 'flex-end' },
  valor: { color: palette.ink, fontSize: 18, fontFamily: fonts.extraBold },
  texto: { color: palette.ink, fontSize: 13, lineHeight: 19 },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
}));
