import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { InstitucionSelector, useInstitucionElegida } from '@/features/perfil/components/InstitucionSelector';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin } from '@/features/perfil/schemas';
import {
  useAnularCertificado,
  useCertificados,
  useDescargarCertificado,
  useEstudiantesServicio,
  useGuardarParametros,
  useParametrosServicio,
  usePendientesServicio,
  useRevisarActividad,
} from '@/features/servicio/api';
import { BarraHoras, ESTADO_SERVICIO } from '@/features/servicio/components/ResumenServicio';
import { codigoLegible, horasTexto, type Actividad, type Certificado, type Parametros } from '@/features/servicio/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import { AppHeader, Badge, Card, EmptyState, ErrorState, LoadingState, NumberField, Page, StatGrid, StatTile, Tabs } from '@/shared/components/UI';
import { formatFecha } from '@/shared/format';
import { crearEstilos, useTema } from '@/theme';

type Vista = 'estudiantes' | 'revisar' | 'certificados' | 'ajustes';

/** Botón que abre un campo de texto obligatorio (motivo) antes de confirmar. */
export function ConTexto({ titulo, etiqueta, confirmar, cargando, onEnviar }: {
  titulo: string; etiqueta: string; confirmar: string; cargando: boolean; onEnviar: (texto: string) => void;
}) {
  const styles = useStyles();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  if (!abierto) {
    return <View style={styles.accion}><PrimaryButton title={titulo} variant="secondary" compact onPress={() => setAbierto(true)} /></View>;
  }
  return (
    <View style={styles.formulario}>
      <Field label={etiqueta} value={texto} onChangeText={setTexto} multiline maxLength={500} />
      <View style={styles.acciones}>
        <View style={styles.accion}><PrimaryButton title={confirmar} compact disabled={texto.trim().length < 5} loading={cargando} onPress={() => onEnviar(texto.trim())} /></View>
        <View style={styles.accion}><PrimaryButton title="Cancelar" variant="ghost" compact onPress={() => setAbierto(false)} /></View>
      </View>
    </View>
  );
}

function Estudiantes({ institucionId }: { institucionId?: string }) {
  const styles = useStyles();
  const { palette } = useTema();
  const lista = useEstudiantesServicio(institucionId);
  if (lista.isLoading) return <LoadingState />;
  if (lista.error) return <ErrorState error={lista.error} onRetry={() => void lista.refetch()} />;
  const filas = lista.data ?? [];
  if (!filas.length) {
    return <EmptyState title="Sin estudiantes de 10.° y 11.°" text="Asigna el grado a los cursos (o nómbralos como 10-A, 11-B) y agrega a los estudiantes en Cursos." />;
  }
  const cuenta = (estado: string) => filas.filter((f) => f.estado === estado).length;
  return (
    <>
      <StatGrid>
        <StatTile label="Atrasados" value={cuenta('atrasado')} tono="critico" icon="warning" />
        <StatTile label="Al día" value={cuenta('al_dia')} tono="info" icon="calendar" />
        <StatTile label="Completaron" value={cuenta('completo')} tono="sano" icon="checkCircle" />
      </StatGrid>
      <View style={styles.lista}>
        {filas.map((e) => (
          <Pressable
            key={e.estudiante_id}
            accessibilityRole="link"
            onPress={() => router.push(`/(app)/service?estudiante=${e.estudiante_id}` as Href)}
            style={({ pressed }) => [styles.fila, pressed && styles.presionado]}
          >
            <View style={styles.filaArriba}>
              <View style={styles.filaTexto}>
                <Text style={styles.titulo} numberOfLines={1}>{e.nombre}</Text>
                <Text style={styles.meta}>{e.curso_nombre ?? 'Sin curso'} · {horasTexto(e.horas_aprobadas)} de {horasTexto(e.meta)} h{e.horas_pendientes ? ` · ${horasTexto(e.horas_pendientes)} h por revisar` : ''}</Text>
              </View>
              {e.estado ? <Badge label={ESTADO_SERVICIO[e.estado].etiqueta} tono={ESTADO_SERVICIO[e.estado].tono} /> : null}
              <Icon name="chevronRight" size={18} color={palette.muted} />
            </View>
            <BarraHoras aprobadas={e.horas_aprobadas} meta={e.meta} estado={e.estado} />
            {e.certificado && !e.certificado.anulado_en ? <Text style={styles.meta}>Certificado {codigoLegible(e.certificado.codigo)}</Text> : null}
          </Pressable>
        ))}
      </View>
    </>
  );
}

function ActividadPorRevisar({ actividad }: { actividad: Actividad }) {
  const styles = useStyles();
  const revisar = useRevisarActividad();
  return (
    <View style={styles.fila}>
      <View style={styles.filaArriba}>
        {actividad.foto_url ? <Image source={{ uri: actividad.foto_url }} style={styles.foto} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
        <View style={styles.filaTexto}>
          <Text style={styles.titulo}>{actividad.estudiante_nombre ?? 'Estudiante'}{actividad.curso_nombre ? ` · ${actividad.curso_nombre}` : ''}</Text>
          <Text style={styles.meta}>{actividad.etiqueta} · {formatFecha(actividad.fecha)} · {horasTexto(actividad.horas)} h</Text>
        </View>
      </View>
      <Text style={styles.texto}>{actividad.descripcion}</Text>
      {!actividad.foto_url ? <InlineMessage tone="warning">Aún no tiene foto: no se puede aprobar.</InlineMessage> : null}
      {revisar.error ? <InlineMessage>{getApiErrorMessage(revisar.error)}</InlineMessage> : null}
      <View style={styles.acciones}>
        <View style={styles.accion}>
          <PrimaryButton title="Aprobar" icon="check" compact disabled={!actividad.foto_url} loading={revisar.isPending}
            onPress={() => revisar.mutate({ actividadId: actividad.id, accion: 'aprobar' })} />
        </View>
        <ConTexto titulo="Rechazar" etiqueta="Motivo (lo verá el estudiante)" confirmar="Rechazar actividad" cargando={revisar.isPending}
          onEnviar={(motivo) => revisar.mutate({ actividadId: actividad.id, accion: 'rechazar', texto: motivo })} />
      </View>
    </View>
  );
}

function PorRevisar({ institucionId }: { institucionId?: string }) {
  const styles = useStyles();
  const pendientes = usePendientesServicio(institucionId);
  if (pendientes.isLoading) return <LoadingState />;
  if (pendientes.error) return <ErrorState error={pendientes.error} onRetry={() => void pendientes.refetch()} />;
  if (!pendientes.data?.length) return <EmptyState title="Nada por revisar" text="Las actividades que registren los estudiantes aparecerán aquí." />;
  return <View style={styles.lista}>{pendientes.data.map((a) => <ActividadPorRevisar key={a.id} actividad={a} />)}</View>;
}

function FilaCertificado({ certificado }: { certificado: Certificado }) {
  const styles = useStyles();
  const descargar = useDescargarCertificado();
  const anular = useAnularCertificado();
  const anulado = Boolean(certificado.anulado_en);
  return (
    <View style={styles.fila}>
      <View style={styles.filaArriba}>
        <View style={styles.filaTexto}>
          <Text style={styles.titulo}>{certificado.estudiante_nombre}{certificado.curso_nombre ? ` · ${certificado.curso_nombre}` : ''}</Text>
          <Text style={styles.meta}>{codigoLegible(certificado.codigo)} · {horasTexto(certificado.horas)} h · {formatFecha(certificado.emitido_en)}</Text>
        </View>
        <Badge label={anulado ? 'Anulado' : 'Vigente'} tono={anulado ? 'neutro' : 'sano'} />
      </View>
      {anulado && certificado.anulado_motivo ? <Text style={styles.meta}>Motivo: {certificado.anulado_motivo}</Text> : null}
      {descargar.error || anular.error ? <InlineMessage>{getApiErrorMessage(descargar.error ?? anular.error)}</InlineMessage> : null}
      {!anulado ? (
        <View style={styles.acciones}>
          <View style={styles.accion}>
            <PrimaryButton title="Descargar PDF" icon="download" compact loading={descargar.isPending} onPress={() => descargar.mutate(certificado.id)} />
          </View>
          <ConTexto titulo="Anular" etiqueta="Motivo (p. ej. nombre mal escrito)" confirmar="Anular certificado" cargando={anular.isPending}
            onEnviar={(motivo) => anular.mutate({ certificadoId: certificado.id, motivo })} />
        </View>
      ) : null}
    </View>
  );
}

function Certificados({ institucionId }: { institucionId?: string }) {
  const styles = useStyles();
  const certificados = useCertificados(institucionId);
  if (certificados.isLoading) return <LoadingState />;
  if (certificados.error) return <ErrorState error={certificados.error} onRetry={() => void certificados.refetch()} />;
  if (!certificados.data?.length) {
    return <EmptyState title="Aún no hay certificados" text="Cuando un estudiante complete la meta, ábrelo en Estudiantes para emitir su certificado." />;
  }
  return <View style={styles.lista}>{certificados.data.map((c) => <FilaCertificado key={c.id} certificado={c} />)}</View>;
}

function FormularioParametros({ institucionId, parametros }: { institucionId: string; parametros: Parametros }) {
  const guardar = useGuardarParametros(institucionId);
  const [meta, setMeta] = useState<number | undefined>(parametros.meta_horas);
  const [porInspeccion, setPorInspeccion] = useState<number | undefined>(parametros.horas_por_inspeccion);
  const [guardado, setGuardado] = useState(false);
  const valido = meta != null && meta >= 1 && meta <= 400 && porInspeccion != null && porInspeccion >= 0 && porInspeccion <= 8;
  return (
    <Card title="Meta y equivalencias" subtitle="La Resolución 4210 de 1996 fija un mínimo de 80 horas." icon="settings">
      <NumberField label="Meta de horas" value={meta} onChange={(v) => { setMeta(v); setGuardado(false); }} help="Entre 1 y 400. El mínimo legal es 80." />
      <NumberField label="Horas por inspección confirmada" value={porInspeccion} onChange={(v) => { setPorInspeccion(v); setGuardado(false); }} help="Entre 0 y 8. Cuenta una por árbol y día." />
      {guardar.error ? <InlineMessage>{getApiErrorMessage(guardar.error)}</InlineMessage> : null}
      {guardado ? <InlineMessage tone="success">Guardado.</InlineMessage> : null}
      <PrimaryButton
        title="Guardar"
        icon="check"
        disabled={!valido}
        loading={guardar.isPending}
        onPress={() => {
          if (meta == null || porInspeccion == null) return;
          guardar.mutate({ meta_horas: meta, horas_por_inspeccion: porInspeccion }, { onSuccess: () => setGuardado(true) });
        }}
      />
    </Card>
  );
}

function Ajustes({ institucionId }: { institucionId?: string }) {
  const parametros = useParametrosServicio(institucionId);
  if (!institucionId) return <EmptyState title="Elige una institución" />;
  if (parametros.isLoading) return <LoadingState />;
  if (parametros.error || !parametros.data) return <ErrorState error={parametros.error} onRetry={() => void parametros.refetch()} />;
  return <FormularioParametros key={`${parametros.data.meta_horas}-${parametros.data.horas_por_inspeccion}`} institucionId={institucionId} parametros={parametros.data} />;
}

/** Servicio social para docentes y el administrador. */
export function PanelDocente() {
  const perfil = useMiPerfil();
  const institucion = useInstitucionElegida({ soloPropiaSiNoAdmin: true });
  const [vista, setVista] = useState<Vista>('estudiantes');
  const pendientes = usePendientesServicio(institucion.institucionId);
  const admin = esAdmin(perfil.data);
  const porRevisar = pendientes.data?.length ?? 0;

  return (
    <Page>
      <AppHeader
        eyebrow="Servicio social estudiantil"
        title="Servicio social"
        subtitle="Horas de 10.° y 11.° verificadas: inspecciones confirmadas y actividades con foto que aprueban los docentes. Mínimo 80 horas (Resolución 4210 de 1996)."
      />
      {admin ? <InstitucionSelector value={institucion.institucionId} onChange={institucion.setInstitucionId} permitirTodas={false} /> : null}
      <Tabs<Vista>
        value={vista}
        onChange={setVista}
        options={[
          { label: 'Estudiantes', value: 'estudiantes' },
          { label: porRevisar ? `Por revisar (${porRevisar})` : 'Por revisar', value: 'revisar' },
          { label: 'Certificados', value: 'certificados' },
          { label: 'Ajustes', value: 'ajustes' },
        ]}
      />
      {!institucion.institucionId ? (
        <EmptyState title="Elige una institución" />
      ) : vista === 'estudiantes' ? (
        <Estudiantes institucionId={institucion.institucionId} />
      ) : vista === 'revisar' ? (
        <PorRevisar institucionId={institucion.institucionId} />
      ) : vista === 'certificados' ? (
        <Certificados institucionId={institucion.institucionId} />
      ) : (
        <Ajustes institucionId={institucion.institucionId} />
      )}
    </Page>
  );
}

const useStyles = crearEstilos(({ palette, card }) => ({
  lista: { gap: 12 },
  fila: { gap: 10, padding: 14, ...card },
  presionado: { opacity: 0.85 },
  filaArriba: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filaTexto: { flex: 1, minWidth: 0, gap: 2 },
  titulo: { color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  texto: { color: palette.ink, fontSize: 14, lineHeight: 20 },
  foto: { width: 64, height: 64, borderRadius: 12, backgroundColor: palette.line },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accion: { flexGrow: 1, flexBasis: 140 },
  formulario: { flexBasis: '100%', gap: 4 },
}));
