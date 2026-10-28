import { useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esRevisor } from '@/features/perfil/schemas';
import { useContactos } from '@/features/riesgo/api';
import { useEmitirCertificado, useResumenServicio } from '@/features/servicio/api';
import { ActividadForm } from '@/features/servicio/components/ActividadForm';
import { PanelDocente } from '@/features/servicio/components/PanelDocente';
import { ResumenServicio } from '@/features/servicio/components/ResumenServicio';
import { horasTexto, type Resumen } from '@/features/servicio/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { Casilla, Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { AppHeader, Card, EmptyState, ErrorState, LoadingState, Page } from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

function MiServicio() {
  const resumen = useResumenServicio();
  return (
    <Page onRefresh={() => void resumen.refetch()} refreshing={resumen.isRefetching}>
      <AppHeader
        eyebrow="Servicio social estudiantil"
        title="Mi servicio social"
        subtitle="En 10.° y 11.° prestas mínimo 80 horas: es requisito para graduarte (Resolución 4210 de 1996). Aquí llevas tu bitácora."
      />
      {resumen.isLoading ? (
        <LoadingState />
      ) : resumen.error || !resumen.data ? (
        <ErrorState error={resumen.error} onRetry={() => void resumen.refetch()} />
      ) : !resumen.data.en_servicio ? (
        <EmptyState title="Aún no prestas servicio social" text={resumen.data.motivo ?? undefined} />
      ) : (
        <>
          <ResumenServicio resumen={resumen.data} propio />
          <ActividadForm noPermitidas={resumen.data.no_permitidas} />
        </>
      )}
    </Page>
  );
}

function EmitirCertificado({ resumen }: { resumen: Resumen }) {
  const styles = useStyles();
  const emitir = useEmitirCertificado();
  const perfil = useMiPerfil();
  // El nombre de rectoría registrado en los contactos de emergencia de la sede, como sugerencia.
  const sugerido = useContactos(perfil.data?.institucion_id ?? undefined).data?.rectoria_nombre;
  const [firmante, setFirmante] = useState('');
  const [cargo, setCargo] = useState('Rector(a)');
  const [autorizado, setAutorizado] = useState(false);
  const valido = firmante.trim().length >= 3 && cargo.trim().length >= 3 && autorizado;
  return (
    <Card title="Emitir certificado" subtitle={`Completó ${horasTexto(resumen.horas_aprobadas)} de ${horasTexto(resumen.meta)} horas.`} icon="review">
      <Field label="Nombre de quien firma" value={firmante} onChangeText={setFirmante} placeholder="Rector(a) de la institución" />
      {sugerido && !firmante ? (
        <Pressable accessibilityRole="button" onPress={() => setFirmante(sugerido)}>
          <Text style={styles.sugerencia}>Usar «{sugerido}»</Text>
        </Pressable>
      ) : null}
      <Field label="Cargo" value={cargo} onChangeText={setCargo} />
      <Casilla checked={autorizado} onChange={setAutorizado}>
        Rectoría autorizó la emisión de este certificado. El PDF lleva la firma electrónica de quien firma, un código y un QR de verificación.
      </Casilla>
      <Text style={styles.nota}>La app prepara el certificado; lo expide la institución educativa.</Text>
      {emitir.error ? <InlineMessage>{getApiErrorMessage(emitir.error)}</InlineMessage> : null}
      <PrimaryButton
        title="Emitir certificado"
        icon="check"
        disabled={!valido}
        loading={emitir.isPending}
        onPress={() => emitir.mutate({ estudiante_id: resumen.estudiante_id, firmante_nombre: firmante.trim(), firmante_cargo: cargo.trim(), autorizado_por_rectoria: autorizado })}
      />
    </Card>
  );
}

/** Un docente revisa el servicio social de un estudiante y, si completó la meta, emite su certificado. */
function ServicioDeEstudiante({ estudianteId }: { estudianteId: string }) {
  const resumen = useResumenServicio(estudianteId);
  const r = resumen.data;
  return (
    <Page onRefresh={() => void resumen.refetch()} refreshing={resumen.isRefetching}>
      <AppHeader eyebrow="Servicio social" title={r?.nombre ?? 'Estudiante'} subtitle={r?.curso_nombre ?? undefined} backTo={'/(app)/service' as Href} />
      {resumen.isLoading ? (
        <LoadingState />
      ) : resumen.error || !r ? (
        <ErrorState error={resumen.error} onRetry={() => void resumen.refetch()} />
      ) : !r.en_servicio ? (
        <EmptyState title="No presta servicio social" text={r.motivo ?? undefined} />
      ) : (
        <>
          {r.estado === 'completo' && !(r.certificado && !r.certificado.anulado_en) ? <EmitirCertificado resumen={r} /> : null}
          <ResumenServicio resumen={r} propio={false} />
        </>
      )}
    </Page>
  );
}

export function ServicioSocialScreen() {
  const perfil = useMiPerfil();
  const { estudiante } = useLocalSearchParams<{ estudiante?: string }>();
  if (perfil.isLoading) return <Page><LoadingState /></Page>;
  if (esRevisor(perfil.data)) return estudiante ? <ServicioDeEstudiante estudianteId={estudiante} /> : <PanelDocente />;
  return <MiServicio />;
}

const useStyles = crearEstilos(({ palette }) => ({
  nota: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  sugerencia: { color: palette.forest, fontSize: 13, fontWeight: '700', marginTop: -6, marginBottom: 8 },
}));
