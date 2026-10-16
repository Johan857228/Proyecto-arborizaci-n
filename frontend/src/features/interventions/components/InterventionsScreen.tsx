import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { palette } from '@/config/constants';
import {
  useIntervenciones,
  useRecomendaciones,
  useTiposIntervencion,
} from '@/features/interventions/hooks/useIntervenciones';
import {
  ETIQUETA_ESTADO_INTERVENCION,
  ETIQUETA_RESULTADO,
  type EstadoIntervencion,
} from '@/features/interventions/schemas';
import { InstitucionSelector, useInstitucionElegida } from '@/features/perfil/components/InstitucionSelector';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { gestiona } from '@/features/perfil/schemas';
import { formatFecha, formatPesos } from '@/shared/format';
import { SelectField } from '@/shared/components/FormControls';
import {
  AppHeader,
  Badge,
  Card,
  Cell,
  EmptyState,
  ErrorState,
  LoadingState,
  Page,
  Row,
  StatGrid,
  StatTile,
  Tabs,
} from '@/shared/components/UI';

const TODOS = '__todos__';

export function InterventionsScreen() {
  const [vista, setVista] = useState<'registradas' | 'recomendadas'>('registradas');
  const institucion = useInstitucionElegida();
  return (
    <Page>
      <AppHeader
        eyebrow="Mantenimiento"
        title="Intervenciones"
        subtitle="Acciones programadas y realizadas con su costo y resultado, y las recomendaciones que salen del estado de cada árbol."
      />
      <InstitucionSelector value={institucion.institucionId} onChange={institucion.setInstitucionId} />
      <Tabs
        value={vista}
        options={[{ label: 'Registradas', value: 'registradas' }, { label: 'Recomendadas', value: 'recomendadas' }]}
        onChange={setVista}
      />
      {vista === 'registradas'
        ? <Registradas institucionId={institucion.institucionId} />
        : <Recomendadas institucionId={institucion.institucionId} />}
    </Page>
  );
}

function Registradas({ institucionId }: { institucionId?: string }) {
  const [estado, setEstado] = useState<EstadoIntervencion>();
  const [tipo, setTipo] = useState<string>();
  const tipos = useTiposIntervencion();
  const lista = useIntervenciones({ institucionId, estado, tipoCodigo: tipo });
  const datos = lista.data ?? [];
  const ejecutadas = datos.filter((i) => i.estado === 'ejecutada');
  const programadas = datos.filter((i) => i.estado === 'programada');

  return (
    <>
      <Row>
        <Cell>
          <SelectField
            label="Estado"
            value={estado ?? TODOS}
            options={[{ label: 'Todos', value: TODOS }, ...Object.entries(ETIQUETA_ESTADO_INTERVENCION).map(([value, label]) => ({ label, value }))]}
            onChange={(v) => setEstado(v === TODOS ? undefined : (v as EstadoIntervencion))}
          />
        </Cell>
        <Cell>
          <SelectField
            label="Tipo"
            value={tipo ?? TODOS}
            options={[{ label: 'Todos', value: TODOS }, ...(tipos.data ?? []).map((t) => ({ label: t.nombre, value: t.codigo }))]}
            onChange={(v) => setTipo(v === TODOS ? undefined : v)}
          />
        </Cell>
      </Row>
      <StatGrid>
        <StatTile label="Ejecutadas" value={ejecutadas.length} tono="sano" hint={formatPesos(ejecutadas.reduce((s, i) => s + (i.costo_real ?? 0), 0))} />
        <StatTile label="Programadas" value={programadas.length} tono="info" hint={formatPesos(programadas.reduce((s, i) => s + (i.costo_estimado ?? 0), 0))} />
        <StatTile
          label="Exitosas"
          value={ejecutadas.filter((i) => i.resultado === 'exitosa').length}
          hint={ejecutadas.length ? `de ${ejecutadas.length} ejecutadas` : undefined}
        />
      </StatGrid>
      {lista.isLoading ? <LoadingState /> : lista.error ? (
        <ErrorState error={lista.error} onRetry={() => void lista.refetch()} />
      ) : !datos.length ? (
        <EmptyState title="No hay intervenciones" text="Regístralas desde la ficha de cada árbol o desde las recomendaciones." />
      ) : (
        datos.map((i) => (
          <Card key={i.id}>
            <View style={styles.header}>
              <Text style={styles.titulo} accessibilityRole="link" onPress={() => router.push(`/(app)/interventions/${i.id}` as Href)}>
                {i.tipo_nombre ?? i.tipo_codigo}
              </Text>
              <Badge
                label={ETIQUETA_ESTADO_INTERVENCION[i.estado]}
                tono={i.estado === 'ejecutada' ? 'sano' : i.estado === 'programada' ? 'info' : 'neutro'}
              />
            </View>
            <Text style={styles.link} accessibilityRole="link" onPress={() => router.push(`/(app)/trees/${i.arbol_id}` as Href)}>
              {i.codigo} · {i.nombre_comun} · {i.zona}
            </Text>
            <Text style={styles.texto}>
              {i.estado === 'ejecutada'
                ? `${formatFecha(i.fecha_ejecucion)} · ${formatPesos(i.costo_real)} · ${i.resultado ? ETIQUETA_RESULTADO[i.resultado] : ''}`
                : i.estado === 'programada'
                  ? `Para el ${formatFecha(i.fecha_programada)} · estimado ${formatPesos(i.costo_estimado)}`
                  : 'Cancelada'}
            </Text>
            <Text style={styles.texto}>Responsable: {i.responsable}</Text>
          </Card>
        ))
      )}
    </>
  );
}

function Recomendadas({ institucionId }: { institucionId?: string }) {
  const [prioridad, setPrioridad] = useState(1);
  const perfil = useMiPerfil();
  const lista = useRecomendaciones(institucionId, prioridad);
  const datos = lista.data ?? [];
  const total = datos.reduce((s, r) => s + r.costo_referencia, 0);

  return (
    <>
      <Tabs
        value={String(prioridad)}
        options={[{ label: 'Todas', value: '1' }, { label: 'Media y alta', value: '2' }, { label: 'Solo alta', value: '3' }]}
        onChange={(v) => setPrioridad(Number(v))}
      />
      <StatGrid>
        <StatTile label="Acciones sugeridas" value={datos.length} />
        <StatTile label="Árboles" value={new Set(datos.map((r) => r.arbol_id)).size} />
        <StatTile label="Costo de referencia" value={formatPesos(total)} />
      </StatGrid>
      {lista.isLoading ? <LoadingState /> : lista.error ? (
        <ErrorState error={lista.error} onRetry={() => void lista.refetch()} />
      ) : !datos.length ? (
        <EmptyState title="Sin recomendaciones" text="Ningún árbol necesita acciones con este filtro." />
      ) : (
        datos.map((r) => (
          <Card key={`${r.arbol_id}-${r.tipo_codigo}`}>
            <View style={styles.header}>
              <Text style={styles.titulo}>{r.tipo_nombre}</Text>
              <Badge label={`Prioridad ${r.prioridad_nombre}`} tono={r.prioridad === 3 ? 'critico' : r.prioridad === 2 ? 'riesgo' : 'neutro'} />
            </View>
            <Text style={styles.link} accessibilityRole="link" onPress={() => router.push(`/(app)/trees/${r.arbol_id}` as Href)}>
              {r.codigo} · {r.nombre_comun} · {r.zona}
            </Text>
            <Text style={styles.texto}>{r.motivo} · {formatPesos(r.costo_referencia)}</Text>
            {gestiona(perfil.data, r.institucion_id) ? (
              <Text
                style={styles.link}
                accessibilityRole="link"
                onPress={() => router.push(`/(app)/trees/${r.arbol_id}/intervention?tipo=${r.tipo_codigo}` as Href)}
              >
                Programar
              </Text>
            ) : null}
          </Card>
        ))
      )}
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  titulo: { color: palette.ink, fontSize: 15, fontWeight: '900', flexShrink: 1 },
  link: { color: palette.forest, fontSize: 13, fontWeight: '800' },
  texto: { color: palette.muted, fontSize: 13, lineHeight: 18 },
});
