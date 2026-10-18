import { router, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { InstitucionSelector, useInstitucionElegida } from '@/features/perfil/components/InstitucionSelector';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin, esRevisor } from '@/features/perfil/schemas';
import { useAnonimizar, useEstudiantesConsentimiento, useResponderSolicitud, useSolicitudes } from '@/features/privacidad/api';
import { ETIQUETA_SOLICITUD, type EstudianteConsentimiento, type Solicitud } from '@/features/privacidad/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { formatFecha } from '@/shared/format';
import { Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { AppHeader, Badge, Card, ConfirmButton, EmptyState, ErrorState, LoadingState, Page, StatGrid, StatTile, Tabs } from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

type Pestana = 'autorizaciones' | 'solicitudes';
const ESTADO = {
  vigente: { label: 'Autorizada', tono: 'sano' },
  sin_autorizacion: { label: 'Sin autorización', tono: 'riesgo' },
  revocada: { label: 'Revocada', tono: 'critico' },
} as const;

function FilaEstudiante({ e, admin }: { e: EstudianteConsentimiento; admin: boolean }) {
  const styles = useStyles();
  const anonimizar = useAnonimizar();
  const c = e.consentimiento;
  return (
    <View style={styles.fila}>
      <View style={styles.filaTop}>
        <Text style={styles.nombre}>{e.nombre}</Text>
        <Badge label={ESTADO[e.estado].label} tono={ESTADO[e.estado].tono} />
      </View>
      {c ? (
        <Text style={styles.meta}>
          {c.acudiente_nombre} · {c.metodo === 'documento' ? 'formato firmado' : 'firma en la app'} · {formatFecha(c.creado_en)}
        </Text>
      ) : null}
      <View style={styles.acciones}>
        {e.estado !== 'vigente' ? (
          <PrimaryButton
            title="Registrar autorización"
            icon="edit"
            compact
            onPress={() => router.push(`/(app)/privacy/autorizacion?usuario=${encodeURIComponent(e.usuario_id)}&nombre=${encodeURIComponent(e.nombre)}` as Href)}
          />
        ) : null}
        {c?.documento_url ? (
          <PrimaryButton title="Ver formato" icon="openExternal" variant="secondary" compact onPress={() => void WebBrowser.openBrowserAsync(c.documento_url!)} />
        ) : null}
      </View>
      {admin ? (
        <ConfirmButton
          title="Anonimizar (egresado)"
          confirmTitle={`¿Anonimizar a ${e.nombre}? Se borran su nombre, correo y fotos, y pierde el acceso. Sus registros de árboles se conservan. No se puede deshacer.`}
          loading={anonimizar.isPending}
          onConfirm={() => anonimizar.mutate(e.usuario_id)}
        />
      ) : null}
      {anonimizar.error ? <InlineMessage>{getApiErrorMessage(anonimizar.error)}</InlineMessage> : null}
    </View>
  );
}

function FilaSolicitud({ s }: { s: Solicitud }) {
  const styles = useStyles();
  const responder = useResponderSolicitud();
  const [respuesta, setRespuesta] = useState('');
  const [error, setError] = useState<string>();

  function enviar(estado: 'atendida' | 'rechazada') {
    setError(undefined);
    if (respuesta.trim().length < 5) {
      setError('Escribe la respuesta para la persona (mínimo 5 caracteres).');
      return;
    }
    responder.mutate({ id: s.id, estado, respuesta: respuesta.trim() });
  }

  return (
    <View style={styles.fila}>
      <View style={styles.filaTop}>
        <Text style={styles.nombre}>{ETIQUETA_SOLICITUD[s.tipo].titulo}</Text>
        <Badge
          label={s.estado === 'pendiente' ? (s.vencida ? 'Vencida' : `Vence ${formatFecha(s.fecha_limite)}`) : s.estado === 'atendida' ? 'Atendida' : 'Rechazada'}
          tono={s.estado === 'pendiente' ? (s.vencida ? 'critico' : 'riesgo') : s.estado === 'atendida' ? 'sano' : 'neutro'}
        />
      </View>
      <Text style={styles.meta}>{s.nombre ?? 'Usuario'} · {formatFecha(s.creado_en)}</Text>
      <Text style={styles.detalle}>{s.detalle}</Text>
      {s.estado === 'pendiente' ? (
        <>
          <Field label="Respuesta" value={respuesta} onChangeText={setRespuesta} multiline maxLength={1000} />
          {error ? <InlineMessage>{error}</InlineMessage> : null}
          {responder.error ? <InlineMessage>{getApiErrorMessage(responder.error)}</InlineMessage> : null}
          <View style={styles.acciones}>
            <PrimaryButton title="Marcar atendida" icon="check" compact loading={responder.isPending} onPress={() => enviar('atendida')} />
            <PrimaryButton title="Rechazar" variant="secondary" compact onPress={() => enviar('rechazada')} />
          </View>
        </>
      ) : s.respuesta ? <Text style={styles.respuesta}>Respuesta: {s.respuesta}</Text> : null}
    </View>
  );
}

export function GestionPrivacidadScreen() {
  const styles = useStyles();
  const perfil = useMiPerfil();
  const institucion = useInstitucionElegida({ soloPropiaSiNoAdmin: true });
  const revisor = esRevisor(perfil.data);
  const admin = esAdmin(perfil.data);
  const [pestana, setPestana] = useState<Pestana>('autorizaciones');
  const estudiantes = useEstudiantesConsentimiento(institucion.institucionId, revisor && Boolean(institucion.institucionId));
  const solicitudes = useSolicitudes('institucion', institucion.institucionId, revisor);

  if (perfil.isLoading) return <Page><LoadingState /></Page>;
  if (!revisor) {
    return <Page><AppHeader title="Privacidad de la institución" /><EmptyState title="Solo para docentes y administradores" /></Page>;
  }
  const lista = estudiantes.data ?? [];
  const pendientes = (solicitudes.data ?? []).filter((s) => s.estado === 'pendiente');
  const conteo = {
    vigente: lista.filter((e) => e.estado === 'vigente').length,
    sin: lista.filter((e) => e.estado !== 'vigente').length,
  };

  return (
    <Page onRefresh={() => void Promise.all([estudiantes.refetch(), solicitudes.refetch()])} refreshing={estudiantes.isRefetching}>
      <AppHeader
        eyebrow="Privacidad"
        title="Privacidad de la institución"
        subtitle="La institución es la responsable de los datos de sus estudiantes (Ley 1581 de 2012)."
        backTo={'/(app)/privacy' as Href}
      />
      {admin ? <InstitucionSelector value={institucion.institucionId} onChange={institucion.setInstitucionId} permitirTodas={false} /> : null}
      <StatGrid>
        <StatTile label="Estudiantes autorizados" value={conteo.vigente} tono="sano" icon="checkCircle" />
        <StatTile label="Sin autorización" value={conteo.sin} tono={conteo.sin ? 'riesgo' : 'sano'} icon="warning" />
        <StatTile label="Solicitudes por responder" value={pendientes.length} tono={pendientes.some((s) => s.vencida) ? 'critico' : 'info'} icon="review" />
      </StatGrid>
      <Tabs<Pestana>
        value={pestana}
        onChange={setPestana}
        options={[{ label: 'Autorizaciones', value: 'autorizaciones' }, { label: `Solicitudes${pendientes.length ? ` (${pendientes.length})` : ''}`, value: 'solicitudes' }]}
      />
      {pestana === 'autorizaciones' ? (
        !institucion.institucionId ? (
          <EmptyState title="Elige una institución" />
        ) : estudiantes.isLoading ? <LoadingState /> : estudiantes.error ? (
          <ErrorState error={estudiantes.error} onRetry={() => void estudiantes.refetch()} />
        ) : lista.length === 0 ? (
          <EmptyState title="No hay estudiantes en esta institución" />
        ) : (
          <Card title="Estudiantes" subtitle="Registra la autorización con el acudiente presente o sube el formato firmado" icon="users">
            <View style={styles.lista}>{lista.map((e) => <FilaEstudiante key={e.usuario_id} e={e} admin={admin} />)}</View>
          </Card>
        )
      ) : solicitudes.isLoading ? <LoadingState /> : solicitudes.error ? (
        <ErrorState error={solicitudes.error} onRetry={() => void solicitudes.refetch()} />
      ) : (solicitudes.data ?? []).length === 0 ? (
        <EmptyState title="No hay solicitudes" text="Las consultas y reclamos de datos que hagan los estudiantes aparecerán aquí." />
      ) : (
        <Card title="Solicitudes de datos" subtitle="Consultas: 10 días hábiles · Reclamos: 15 días hábiles" icon="review">
          <View style={styles.lista}>{(solicitudes.data ?? []).map((s) => <FilaSolicitud key={s.id} s={s} />)}</View>
        </Card>
      )}
    </Page>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  lista: { gap: 10 },
  fila: { gap: 6, padding: 12, borderRadius: 14, backgroundColor: palette.tile },
  filaTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  nombre: { flexShrink: 1, color: palette.ink, fontSize: 14, fontFamily: fonts.bold },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  detalle: { color: palette.ink, fontSize: 13, lineHeight: 19 },
  respuesta: { color: palette.forest, fontSize: 13, lineHeight: 19 },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
}));
