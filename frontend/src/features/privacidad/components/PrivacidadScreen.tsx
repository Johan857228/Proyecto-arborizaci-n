import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, Share, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esRevisor } from '@/features/perfil/schemas';
import {
  privacidadService,
  useAceptarPolitica,
  useCambiarAlias,
  useCrearSolicitud,
  usePrivacidad,
  useRevocar,
  useSolicitudes,
} from '@/features/privacidad/api';
import { PoliticaDatos } from '@/features/privacidad/components/PoliticaDatos';
import {
  ETIQUETA_PARENTESCO,
  ETIQUETA_SOLICITUD,
  TIPOS_SOLICITUD,
  aliasSchema,
  solicitudInSchema,
  type Solicitud,
  type TipoSolicitud,
} from '@/features/privacidad/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { formatFecha } from '@/shared/format';
import { Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import { AppHeader, Badge, Card, ConfirmButton, ErrorState, LoadingState, NavCard, Page } from '@/shared/components/UI';
import { crearEstilos, useTema } from '@/theme';

const ESTADO_SOLICITUD = {
  pendiente: { label: 'Pendiente', tono: 'riesgo' },
  atendida: { label: 'Atendida', tono: 'sano' },
  rechazada: { label: 'Rechazada', tono: 'critico' },
} as const;

function FilaSolicitud({ solicitud }: { solicitud: Solicitud }) {
  const styles = useStyles();
  const e = ESTADO_SOLICITUD[solicitud.estado];
  return (
    <View style={styles.solicitud}>
      <View style={styles.filaTop}>
        <Text style={styles.solicitudTitulo}>{ETIQUETA_SOLICITUD[solicitud.tipo].titulo}</Text>
        <Badge label={solicitud.vencida ? 'Vencida' : e.label} tono={solicitud.vencida ? 'critico' : e.tono} />
      </View>
      <Text style={styles.detalle}>{solicitud.detalle}</Text>
      <Text style={styles.meta}>
        Enviada el {formatFecha(solicitud.creado_en)}
        {solicitud.estado === 'pendiente' ? ` · respuesta a más tardar el ${formatFecha(solicitud.fecha_limite)}` : ''}
      </Text>
      {solicitud.respuesta ? <Text style={styles.respuesta}>Respuesta: {solicitud.respuesta}</Text> : null}
    </View>
  );
}

/** Descarga (web) o comparte (teléfono) la copia de los datos personales. */
async function descargarMisDatos() {
  const datos = await privacidadService.misDatos();
  const texto = JSON.stringify(datos, null, 2);
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'mis-datos-arbolado-escolar.json';
    enlace.click();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ title: 'Mis datos de Arbolado Escolar', message: texto });
}

export function PrivacidadScreen() {
  const styles = useStyles();
  const { palette } = useTema();
  const perfil = useMiPerfil();
  const estado = usePrivacidad();
  const aceptar = useAceptarPolitica();
  const cambiarAlias = useCambiarAlias();
  const revocar = useRevocar();
  const solicitudes = useSolicitudes('mias');
  const crear = useCrearSolicitud();
  const [verPolitica, setVerPolitica] = useState(false);
  const [alias, setAlias] = useState<string>();
  const [aliasError, setAliasError] = useState<string>();
  const [aliasOk, setAliasOk] = useState(false);
  const [tipo, setTipo] = useState<TipoSolicitud>('consulta');
  const [detalle, setDetalle] = useState('');
  const [solicitudError, setSolicitudError] = useState<string>();
  const [enviada, setEnviada] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [descargaError, setDescargaError] = useState<string>();

  if (estado.isLoading) return <Page><LoadingState /></Page>;
  if (estado.error || !estado.data) {
    return <Page><AppHeader title="Privacidad y mis datos" /><ErrorState error={estado.error} onRetry={() => void estado.refetch()} /></Page>;
  }
  const e = estado.data;
  const politicaAlDia = e.politica_aceptada === e.politica_vigente;
  const valorAlias = alias ?? e.alias ?? '';

  async function guardarAlias() {
    setAliasError(undefined);
    setAliasOk(false);
    const validado = aliasSchema.safeParse(valorAlias);
    if (!validado.success) {
      setAliasError(validado.error.issues[0].message);
      return;
    }
    try {
      await cambiarAlias.mutateAsync(validado.data || null);
      setAlias(undefined);
      setAliasOk(true);
    } catch (causa) {
      setAliasError(getApiErrorMessage(causa));
    }
  }

  async function enviarSolicitud() {
    setSolicitudError(undefined);
    setEnviada(false);
    const validado = solicitudInSchema.safeParse({ tipo, detalle });
    if (!validado.success) {
      setSolicitudError(validado.error.issues[0].message);
      return;
    }
    try {
      await crear.mutateAsync(validado.data);
      setDetalle('');
      setEnviada(true);
    } catch (causa) {
      setSolicitudError(getApiErrorMessage(causa));
    }
  }

  async function descargar() {
    setDescargaError(undefined);
    setDescargando(true);
    try {
      await descargarMisDatos();
    } catch (causa) {
      setDescargaError(getApiErrorMessage(causa));
    } finally {
      setDescargando(false);
    }
  }

  return (
    <Page maxWidth={720} onRefresh={() => void Promise.all([estado.refetch(), solicitudes.refetch()])} refreshing={estado.isRefetching}>
      <AppHeader
        eyebrow="Cuenta"
        title="Privacidad y mis datos"
        subtitle="Cómo se protegen tus datos, la autorización de tu acudiente y cómo ejercer tus derechos."
      />

      {esRevisor(perfil.data) ? (
        <NavCard
          title="Privacidad de la institución"
          text="Autorizaciones de los acudientes, solicitudes de datos por responder y egresados."
          href={'/(app)/privacy/gestion' as Href}
          icon="users"
        />
      ) : null}

      <Card title="Política de tratamiento de datos" subtitle={`Versión ${e.politica_vigente}`} icon="lock">
        {politicaAlDia ? (
          <View style={styles.estadoFila}>
            <Icon name="checkCircle" size={18} color={palette.forest} />
            <Text style={styles.texto}>La aceptaste el {formatFecha(e.politica_aceptada_en)}.</Text>
          </View>
        ) : (
          <InlineMessage tone="warning">
            {e.politica_aceptada ? 'La política cambió desde que la aceptaste. Léela y acéptala de nuevo.' : 'Aún no has aceptado la política de tratamiento de datos.'}
          </InlineMessage>
        )}
        <Pressable accessibilityRole="button" onPress={() => setVerPolitica((v) => !v)} style={styles.enlace}>
          <Text style={styles.enlaceTexto}>{verPolitica ? 'Ocultar la política' : 'Leer la política'}</Text>
          <Icon name={verPolitica ? 'chevronLeft' : 'chevronRight'} size={16} color={palette.forest} />
        </Pressable>
        {verPolitica ? <PoliticaDatos /> : null}
        {!politicaAlDia ? (
          <PrimaryButton title="Acepto la política" icon="check" loading={aceptar.isPending} onPress={() => aceptar.mutate()} />
        ) : null}
        {aceptar.error ? <InlineMessage>{getApiErrorMessage(aceptar.error)}</InlineMessage> : null}
      </Card>

      {e.requiere_consentimiento ? (
        <Card title="Autorización de tu acudiente" subtitle="Ley 1581 de 2012, art. 7, y Decreto 1377 de 2013, art. 12" icon="person">
          {e.consentimiento ? (
            <>
              <View style={styles.estadoFila}>
                <Icon name="checkCircle" size={18} color={palette.forest} />
                <Text style={styles.texto}>
                  Autorizada por {e.consentimiento.acudiente_nombre} ({ETIQUETA_PARENTESCO[e.consentimiento.parentesco as keyof typeof ETIQUETA_PARENTESCO] ?? e.consentimiento.parentesco}) el {formatFecha(e.consentimiento.creado_en)}
                  {e.consentimiento.metodo === 'documento' ? ', con formato firmado.' : ', con firma en la app.'}
                </Text>
              </View>
              <ConfirmButton
                title="Retirar la autorización"
                confirmTitle="¿Retirar la autorización? Tu docente lo verá y tendrás que registrar una nueva para seguir participando."
                loading={revocar.isPending}
                onConfirm={() => revocar.mutate(e.consentimiento!.id)}
              />
              {revocar.error ? <InlineMessage>{getApiErrorMessage(revocar.error)}</InlineMessage> : null}
            </>
          ) : (
            <>
              <InlineMessage tone="warning">
                Falta la autorización de tu acudiente. Pídele que la firme contigo en la app, o entrega a tu docente el formato firmado.
              </InlineMessage>
              <PrimaryButton title="Firmar con mi acudiente" icon="edit" onPress={() => router.push('/(app)/privacy/autorizacion' as Href)} />
            </>
          )}
        </Card>
      ) : null}

      <Card title="Cómo apareces en los rankings" subtitle="Los demás estudiantes no ven tu nombre" icon="trophy">
        <Text style={styles.texto}>
          Sin alias, los demás estudiantes ven solo tus iniciales. Tus docentes siempre ven tu nombre completo.
        </Text>
        <Field
          label="Alias (opcional)"
          value={valorAlias}
          onChangeText={(v) => { setAlias(v); setAliasOk(false); }}
          placeholder="Por ejemplo: Ceiba veloz"
          maxLength={30}
          error={aliasError}
        />
        {aliasOk ? <InlineMessage tone="success">Listo. Así aparecerás en los rankings.</InlineMessage> : null}
        <PrimaryButton title={valorAlias ? 'Guardar alias' : 'Usar mis iniciales'} variant="secondary" loading={cambiarAlias.isPending} onPress={() => void guardarAlias()} />
      </Card>

      <Card title="Tus derechos" subtitle="Consultas: 10 días hábiles · Reclamos: 15 días hábiles" icon="review">
        <PrimaryButton title="Descargar mis datos" icon="openExternal" variant="secondary" loading={descargando} onPress={() => void descargar()} />
        {descargaError ? <InlineMessage>{descargaError}</InlineMessage> : null}
        <Text style={styles.subtitulo}>Hacer una solicitud</Text>
        <View style={styles.tipos}>
          {TIPOS_SOLICITUD.map((t) => (
            <Pressable
              key={t}
              accessibilityRole="radio"
              accessibilityState={{ checked: t === tipo }}
              onPress={() => setTipo(t)}
              style={({ pressed }) => [styles.tipo, t === tipo && styles.tipoActivo, pressed && styles.pressed]}
            >
              <Text style={[styles.tipoTitulo, t === tipo && styles.tipoTituloActivo]}>{ETIQUETA_SOLICITUD[t].titulo}</Text>
              <Text style={styles.meta}>{ETIQUETA_SOLICITUD[t].texto}</Text>
            </Pressable>
          ))}
        </View>
        <Field label="Cuéntanos qué necesitas" value={detalle} onChangeText={setDetalle} multiline maxLength={1000} />
        {solicitudError ? <InlineMessage>{solicitudError}</InlineMessage> : null}
        {enviada ? <InlineMessage tone="success">Solicitud enviada. Te responderán en máximo {ETIQUETA_SOLICITUD[tipo].plazo}.</InlineMessage> : null}
        <PrimaryButton title="Enviar solicitud" icon="forward" loading={crear.isPending} onPress={() => void enviarSolicitud()} />
        {(solicitudes.data ?? []).length ? (
          <View style={styles.lista}>
            <Text style={styles.subtitulo}>Tus solicitudes</Text>
            {(solicitudes.data ?? []).map((s) => <FilaSolicitud key={s.id} solicitud={s} />)}
          </View>
        ) : null}
      </Card>
    </Page>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  texto: { flex: 1, color: palette.ink, fontSize: 14, lineHeight: 20 },
  estadoFila: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  enlace: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 2 },
  enlaceTexto: { color: palette.forest, fontSize: 14, fontFamily: fonts.bold },
  subtitulo: { marginTop: 6, color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  tipos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tipo: { flexGrow: 1, flexBasis: 150, gap: 2, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.tile },
  tipoActivo: { borderColor: palette.forest, backgroundColor: palette.forestSoft },
  tipoTitulo: { color: palette.ink, fontSize: 13, fontFamily: fonts.bold },
  tipoTituloActivo: { color: palette.forest },
  lista: { gap: 8 },
  solicitud: { gap: 4, padding: 12, borderRadius: 12, backgroundColor: palette.tile },
  filaTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  solicitudTitulo: { flexShrink: 1, color: palette.ink, fontSize: 14, fontFamily: fonts.bold },
  detalle: { color: palette.ink, fontSize: 13, lineHeight: 19 },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  respuesta: { color: palette.forest, fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.8 },
}));
