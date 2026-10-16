import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';

import { palette } from '@/config/constants';
import { useTiposIntervencion } from '@/features/interventions/hooks/useIntervenciones';
import { InstitucionSelector, useInstitucionElegida } from '@/features/perfil/components/InstitucionSelector';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin, esRevisor } from '@/features/perfil/schemas';
import {
  useEscenarioAcciones,
  useEscenarios,
  type Candidata,
  type ParametrosEscenario,
  type ResultadoEscenario,
} from '@/features/scenarios/api';
import { getApiErrorMessage } from '@/services/api/client';
import { formatFechaHora, formatPesos } from '@/shared/format';
import { numero } from '@/shared/validacion';
import { ChoiceChip, Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import {
  AppHeader,
  Badge,
  Card,
  ConfirmButton,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  NumberField,
  Page,
  ProgressBar,
  StatGrid,
  StatTile,
  StateBadge,
  Tabs,
} from '@/shared/components/UI';

const montoSchema = numero('Escribe el monto disponible.').min(0, 'No puede ser negativo.').max(100_000_000_000, 'Máximo $ 100.000.000.000.');
const nombreSchema = z.string().trim().min(3, 'El nombre debe tener al menos 3 caracteres.').max(80);

export function ScenariosScreen() {
  const perfil = useMiPerfil();
  const institucion = useInstitucionElegida();
  const tipos = useTiposIntervencion();
  const acciones = useEscenarioAcciones();
  const revisor = esRevisor(perfil.data);
  const guardados = useEscenarios(institucion.institucionId, revisor);
  const [monto, setMonto] = useState<number | undefined>(1_000_000);
  const [criterio, setCriterio] = useState<'riesgo' | 'cantidad'>('riesgo');
  const [incluirProgramadas, setIncluirProgramadas] = useState(true);
  const [tiposElegidos, setTiposElegidos] = useState<string[]>([]);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string>();
  const [mensaje, setMensaje] = useState<string>();
  const [ultimo, setUltimo] = useState<ParametrosEscenario>();

  if (perfil.isLoading) return <Page><LoadingState /></Page>;
  if (!revisor) {
    return <Page><AppHeader title="Escenarios presupuestales" /><Notice tono="riesgo">Esta sección es para docentes y administradores.</Notice></Page>;
  }

  function parametros(): ParametrosEscenario | null {
    setError(undefined);
    if (!institucion.institucionId) {
      setError('Elige una institución.');
      return null;
    }
    const validado = montoSchema.safeParse(monto);
    if (!validado.success) {
      setError(validado.error.issues[0].message);
      return null;
    }
    return {
      institucion_id: institucion.institucionId,
      monto: validado.data,
      criterio,
      incluir_programadas: incluirProgramadas,
      tipos: tiposElegidos.length ? tiposElegidos : null,
    };
  }

  async function simular() {
    const p = parametros();
    if (!p) return;
    setMensaje(undefined);
    try {
      await acciones.simular.mutateAsync(p);
      setUltimo(p);
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  async function guardar() {
    const p = parametros();
    if (!p) return;
    const validado = nombreSchema.safeParse(nombre);
    if (!validado.success) {
      setError(validado.error.issues[0].message);
      return;
    }
    try {
      await acciones.guardar.mutateAsync({ ...p, nombre: validado.data });
      setNombre('');
      setMensaje('Escenario guardado con el resultado de este momento.');
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  const resultado = acciones.simular.data;
  const vigente = ultimo && ultimo.institucion_id === institucion.institucionId;

  return (
    <Page>
      <AppHeader
        eyebrow="Fase 2"
        title="Escenarios presupuestales"
        subtitle="Reparte un monto entre las intervenciones recomendadas y programadas y mira cuáles entran y cuáles quedan fuera."
      />
      <InstitucionSelector value={institucion.institucionId} onChange={institucion.setInstitucionId} permitirTodas={false} />
      <Card title="Parámetros">
        <NumberField label="Monto disponible (COP)" value={monto} onChange={setMonto} />
        <Text style={styles.subtitulo}>Criterio</Text>
        <Tabs
          value={criterio}
          options={[{ label: 'Primero el riesgo', value: 'riesgo' }, { label: 'Más acciones', value: 'cantidad' }]}
          onChange={setCriterio}
        />
        <Text style={styles.texto}>
          {criterio === 'riesgo'
            ? 'Atiende primero las acciones de mayor prioridad y los árboles más graves; a igualdad, la más barata.'
            : 'Atiende primero las acciones más baratas para cubrir el mayor número posible.'}
        </Text>
        <Tabs
          value={incluirProgramadas ? 'si' : 'no'}
          options={[{ label: 'Incluir programadas', value: 'si' }, { label: 'Solo recomendaciones', value: 'no' }]}
          onChange={(v) => setIncluirProgramadas(v === 'si')}
        />
        <Text style={styles.subtitulo}>Tipos de intervención (sin elegir = todos)</Text>
        <View style={styles.chips}>
          {(tipos.data ?? []).map((t) => (
            <ChoiceChip
              key={t.codigo}
              label={t.nombre}
              selected={tiposElegidos.includes(t.codigo)}
              onPress={() => setTiposElegidos((a) => (a.includes(t.codigo) ? a.filter((c) => c !== t.codigo) : [...a, t.codigo]))}
            />
          ))}
        </View>
        {error ? <InlineMessage>{error}</InlineMessage> : null}
        <PrimaryButton title="Simular" loading={acciones.simular.isPending} onPress={() => void simular()} />
      </Card>

      {resultado && vigente ? (
        <>
          <ResultadoVista resultado={resultado} />
          {esAdmin(perfil.data) ? (
            <Card title="Guardar este escenario">
              <Field label="Nombre" value={nombre} onChangeText={setNombre} placeholder="Ej.: Plan de mantenimiento segundo semestre" />
              <PrimaryButton title="Guardar escenario" loading={acciones.guardar.isPending} onPress={() => void guardar()} />
            </Card>
          ) : null}
        </>
      ) : null}
      {mensaje ? <Notice tono="sano">{mensaje}</Notice> : null}

      <Text style={styles.seccion}>Escenarios guardados</Text>
      {guardados.isLoading ? <LoadingState /> : guardados.error ? (
        <ErrorState error={guardados.error} onRetry={() => void guardados.refetch()} />
      ) : !guardados.data?.length ? (
        <EmptyState title="No hay escenarios guardados" />
      ) : (
        guardados.data.map((e) => (
          <EscenarioGuardado key={e.id} escenario={e} admin={esAdmin(perfil.data)} onBorrar={() => acciones.borrar.mutateAsync(e.id)} />
        ))
      )}
    </Page>
  );
}

function EscenarioGuardado({
  escenario: e,
  admin,
  onBorrar,
}: {
  escenario: { id: string; nombre: string; monto: number; criterio: string; creado_en: string; resultado: ResultadoEscenario };
  admin: boolean;
  onBorrar: () => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <Card title={e.nombre} action={<Badge label={e.criterio === 'riesgo' ? 'Primero el riesgo' : 'Más acciones'} tono="info" />}>
      <Text style={styles.texto}>
        {formatPesos(e.monto)} · {e.resultado.acciones_incluidas} acciones incluidas · {e.resultado.acciones_excluidas} fuera · guardado el {formatFechaHora(e.creado_en)}
      </Text>
      <PrimaryButton title={abierto ? 'Ocultar detalle' : 'Ver detalle'} variant="secondary" onPress={() => setAbierto((a) => !a)} />
      {abierto ? <ResultadoVista resultado={e.resultado} /> : null}
      {admin ? (
        <ConfirmButton
          title="Eliminar escenario"
          confirmTitle="¿Eliminar este escenario guardado?"
          onConfirm={() => void onBorrar().catch((causa: unknown) => setError(getApiErrorMessage(causa)))}
        />
      ) : null}
      {error ? <InlineMessage>{error}</InlineMessage> : null}
    </Card>
  );
}

function ResultadoVista({ resultado: r }: { resultado: ResultadoEscenario }) {
  const pct = r.total_requerido ? (r.total_incluido * 100) / r.total_requerido : 100;
  return (
    <>
      <StatGrid>
        <StatTile label="Incluido" value={formatPesos(r.total_incluido)} hint={`saldo ${formatPesos(r.saldo)}`} tono="sano" />
        <StatTile label="Acciones que entran" value={r.acciones_incluidas} hint={`${r.arboles_atendidos} árboles`} />
        <StatTile label="Quedan fuera" value={r.acciones_excluidas} hint={`faltan ${formatPesos(r.faltante)}`} tono={r.acciones_excluidas ? 'riesgo' : undefined} />
        <StatTile label="Críticos sin atender" value={r.criticos_sin_atender} hint={`${r.criticos_atendidos} atendidos`} tono={r.criticos_sin_atender ? 'critico' : 'sano'} />
      </StatGrid>
      <Card title={`Cubre ${Math.round(pct)} % del costo total requerido`}>
        <ProgressBar pct={pct} />
      </Card>
      <Card title="Entran">
        {r.incluidas.length ? r.incluidas.map((c) => <Accion key={`${c.arbol_id}-${c.tipo_codigo}-${c.intervencion_id ?? ''}`} c={c} />) : (
          <Text style={styles.texto}>Ninguna acción cabe en el monto.</Text>
        )}
      </Card>
      {r.excluidas.length ? (
        <Card title="Quedan fuera">
          {r.excluidas.map((c) => <Accion key={`${c.arbol_id}-${c.tipo_codigo}-${c.intervencion_id ?? ''}`} c={c} />)}
        </Card>
      ) : null}
    </>
  );
}

function Accion({ c }: { c: Candidata }) {
  return (
    <View style={styles.accion}>
      <View style={styles.flex}>
        <Text style={styles.link} accessibilityRole="link" onPress={() => router.push(`/(app)/trees/${c.arbol_id}` as Href)}>
          {c.codigo} · {c.tipo_nombre}
        </Text>
        <Text style={styles.chico}>
          {c.origen === 'programada' ? 'Programada' : 'Recomendada'} · {c.motivo}
          {c.motivo_exclusion ? ` · ${c.motivo_exclusion}` : ''}
        </Text>
      </View>
      <StateBadge estado={c.estado} />
      <Text style={styles.costo}>{formatPesos(c.costo)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  texto: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  chico: { color: palette.muted, fontSize: 11, lineHeight: 15 },
  subtitulo: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  seccion: { marginTop: 6, color: palette.ink, fontSize: 18, fontWeight: '900' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accion: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: palette.line },
  flex: { flex: 1 },
  link: { color: palette.forest, fontSize: 13, fontWeight: '800' },
  costo: { color: palette.ink, fontSize: 13, fontWeight: '800' },
});
