import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { InstitucionSelector, useInstitucionElegida } from '@/features/perfil/components/InstitucionSelector';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin, esRevisor } from '@/features/perfil/schemas';
import { useAccionAlerta, useAlertas, useContactos, type AccionAlerta, type FiltroAlertas } from '@/features/riesgo/api';
import { ContactosEmergencia } from '@/features/riesgo/components/ContactosEmergencia';
import { RiesgoBadge } from '@/features/riesgo/components/RiesgoBadge';
import { RutaEmergencia } from '@/features/riesgo/components/RutaEmergencia';
import { CATEGORIAS, NOMBRE_CATEGORIA } from '@/features/riesgo/reglas';
import type { Alerta, MedioAviso } from '@/features/riesgo/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import { AppHeader, Badge, EmptyState, ErrorState, IconChip, LoadingState, Notice, Page, Tabs, type Tono } from '@/shared/components/UI';
import { formatFechaHora } from '@/shared/format';
import { crearEstilos, useTema } from '@/theme';

const ESTADO: Record<Alerta['estado'], { etiqueta: string; tono: Tono }> = {
  por_confirmar: { etiqueta: 'Por confirmar', tono: 'riesgo' },
  confirmada: { etiqueta: 'Confirmada', tono: 'critico' },
  descartada: { etiqueta: 'Descartada', tono: 'neutro' },
  atendida: { etiqueta: 'Atendida', tono: 'sano' },
};

const MEDIO: Record<MedioAviso, string> = {
  whatsapp: 'WhatsApp',
  correo: 'correo',
  llamada: 'llamada',
  en_persona: 'en persona',
  otro: 'otro medio',
};

function dias(desde: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 86_400_000));
}

/** Mensaje para rectoría: sin nombres de estudiantes, solo el árbol, lo que se vio y qué hacer. */
export function mensajeAviso(a: Alerta) {
  const zona = a.zona_otra ? `${a.zona} (${a.zona_otra})` : a.zona;
  return [
    `Arbolado Escolar · Riesgo de caída ${NOMBRE_CATEGORIA[a.categoria].toUpperCase()}`,
    `Árbol ${a.codigo} (${a.nombre_comun}), ${a.nombre_corto} · ${zona}.`,
    a.motivos.length ? `Hallazgos: ${a.motivos.join('; ')}.` : '',
    `Qué hacer: ${a.accion}`,
    'Es un tamizaje visual de la comunidad educativa, no un dictamen técnico.',
  ].filter(Boolean).join('\n');
}

/** Número para wa.me: los celulares colombianos de 10 dígitos llevan el indicativo 57. */
function numeroWhatsApp(telefono: string) {
  const digitos = telefono.replace(/\D/g, '');
  return digitos.length === 10 ? `57${digitos}` : digitos;
}

function AccionConTexto({
  titulo,
  etiqueta,
  minimo,
  confirmar,
  cargando,
  onEnviar,
}: {
  titulo: string;
  etiqueta: string;
  minimo: number;
  confirmar: string;
  cargando: boolean;
  onEnviar: (texto: string) => void;
}) {
  const styles = useStyles();
  const [abierta, setAbierta] = useState(false);
  const [texto, setTexto] = useState('');
  if (!abierta) {
    return (
      <View style={styles.accion}>
        <PrimaryButton title={titulo} variant="secondary" compact onPress={() => setAbierta(true)} />
      </View>
    );
  }
  return (
    <View style={styles.formulario}>
      <Field label={etiqueta} value={texto} onChangeText={setTexto} multiline maxLength={500} />
      <View style={styles.acciones}>
        <View style={styles.accion}>
          <PrimaryButton title={confirmar} compact disabled={texto.trim().length < minimo} loading={cargando} onPress={() => onEnviar(texto.trim())} />
        </View>
        <View style={styles.accion}>
          <PrimaryButton title="Cancelar" variant="ghost" compact onPress={() => setAbierta(false)} />
        </View>
      </View>
    </View>
  );
}

function TarjetaAlerta({ alerta, gestiona }: { alerta: Alerta; gestiona: boolean }) {
  const styles = useStyles();
  const { palette } = useTema();
  const accion = useAccionAlerta();
  const contactos = useContactos(alerta.institucion_id).data;
  const [verRuta, setVerRuta] = useState(alerta.categoria === 'inminente');
  const abierta = alerta.estado === 'por_confirmar' || alerta.estado === 'confirmada';
  const bajo =
    alerta.categoria_actual && CATEGORIAS.indexOf(alerta.categoria_actual) < CATEGORIAS.indexOf(alerta.categoria) ? alerta.categoria_actual : null;

  function ejecutar(a: AccionAlerta) {
    accion.mutate({ alertaId: alerta.id, accion: a });
  }

  async function avisar(medio: MedioAviso) {
    const mensaje = mensajeAviso(alerta);
    if (medio === 'whatsapp' && contactos?.rectoria_telefono) {
      await Linking.openURL(`https://wa.me/${numeroWhatsApp(contactos.rectoria_telefono)}?text=${encodeURIComponent(mensaje)}`);
    } else if (medio === 'correo' && contactos?.rectoria_correo) {
      await Linking.openURL(`mailto:${contactos.rectoria_correo}?subject=${encodeURIComponent(`Riesgo de caída: árbol ${alerta.codigo}`)}&body=${encodeURIComponent(mensaje)}`);
    } else if (medio === 'llamada' && contactos?.rectoria_telefono) {
      await Linking.openURL(`tel:${contactos.rectoria_telefono.replace(/[^0-9+]/g, '')}`);
    }
    ejecutar({ tipo: 'aviso', medio });
  }

  return (
    <View style={[styles.tarjeta, alerta.categoria === 'inminente' && abierta && styles.tarjetaInminente]}>
      <Pressable accessibilityRole="link" onPress={() => router.push(`/(app)/trees/${alerta.arbol_id}` as Href)} style={styles.arriba}>
        {alerta.foto_url ? (
          <Image source={{ uri: alerta.foto_url }} style={styles.foto} contentFit="cover" accessibilityIgnoresInvertColors />
        ) : (
          <IconChip icon="tree" tono={alerta.categoria === 'inminente' ? 'critico' : 'riesgo'} size={56} />
        )}
        <View style={styles.arribaTexto}>
          <Text style={styles.titulo} numberOfLines={1}>{alerta.codigo} · {alerta.nombre_comun}</Text>
          <Text style={styles.meta} numberOfLines={1}>{alerta.nombre_corto} · {alerta.zona}{alerta.zona_otra ? ` (${alerta.zona_otra})` : ''}</Text>
          <Text style={styles.meta}>
            Abierta el {formatFechaHora(alerta.creada_en)}{abierta ? ` · hace ${dias(alerta.creada_en)} ${dias(alerta.creada_en) === 1 ? 'día' : 'días'}` : ''}
          </Text>
        </View>
        <Icon name="chevronRight" size={18} color={palette.muted} />
      </Pressable>

      <View style={styles.insignias}>
        <RiesgoBadge categoria={alerta.categoria} />
        <Badge label={ESTADO[alerta.estado].etiqueta} tono={ESTADO[alerta.estado].tono} />
        {alerta.rectoria_avisada_en ? (
          <Badge label={`Rectoría avisada${alerta.rectoria_medio ? ` por ${MEDIO[alerta.rectoria_medio]}` : ''}`} tono="info" />
        ) : abierta ? (
          <Badge label="Falta avisar a rectoría" tono="riesgo" />
        ) : null}
      </View>

      {alerta.motivos.length ? <Text style={styles.texto}>{alerta.motivos.join(' · ')}</Text> : null}
      {abierta ? <Text style={styles.texto}><Text style={styles.negrita}>Qué hacer: </Text>{alerta.accion}</Text> : null}
      {bajo ? <InlineMessage tone="info">La última inspección encontró riesgo {NOMBRE_CATEGORIA[bajo].toLowerCase()}. Si ya se atendió, cierra la alerta.</InlineMessage> : null}
      {alerta.comentario_revision ? <Text style={styles.meta}>Revisión: {alerta.comentario_revision}</Text> : null}
      {alerta.nota_cierre ? <Text style={styles.meta}>Cierre: {alerta.nota_cierre}</Text> : null}
      {accion.error ? <InlineMessage>{getApiErrorMessage(accion.error)}</InlineMessage> : null}

      {abierta && gestiona ? (
        <View style={styles.bloque}>
          {alerta.estado === 'por_confirmar' ? (
            <View style={styles.acciones}>
              <View style={styles.accion}>
                <PrimaryButton title="Confirmar riesgo" icon="check" compact loading={accion.isPending} onPress={() => ejecutar({ tipo: 'confirmar' })} />
              </View>
              <AccionConTexto
                titulo="Descartar"
                etiqueta="¿Por qué no hay riesgo? (mínimo 5 caracteres)"
                minimo={5}
                confirmar="Descartar alerta"
                cargando={accion.isPending}
                onEnviar={(motivo) => ejecutar({ tipo: 'descartar', motivo })}
              />
            </View>
          ) : null}

          <Text style={styles.subtitulo}>Avisar a rectoría</Text>
          <View style={styles.acciones}>
            {contactos?.rectoria_telefono ? (
              <View style={styles.accion}><PrimaryButton title="WhatsApp" variant="secondary" compact onPress={() => void avisar('whatsapp')} /></View>
            ) : null}
            {contactos?.rectoria_correo ? (
              <View style={styles.accion}><PrimaryButton title="Correo" variant="secondary" compact onPress={() => void avisar('correo')} /></View>
            ) : null}
            {contactos?.rectoria_telefono ? (
              <View style={styles.accion}><PrimaryButton title="Llamar" variant="secondary" compact onPress={() => void avisar('llamada')} /></View>
            ) : null}
            <View style={styles.accion}><PrimaryButton title="Ya avisé en persona" variant="ghost" compact onPress={() => void avisar('en_persona')} /></View>
          </View>

          <View style={styles.acciones}>
            <View style={styles.accion}>
              <PrimaryButton title="Programar intervención" icon="tools" variant="secondary" compact onPress={() => router.push(`/(app)/trees/${alerta.arbol_id}/intervention` as Href)} />
            </View>
            <AccionConTexto
              titulo="Marcar como atendida"
              etiqueta="¿Qué se hizo? (poda, tala autorizada, área cercada…)"
              minimo={5}
              confirmar="Cerrar alerta"
              cargando={accion.isPending}
              onEnviar={(nota) => ejecutar({ tipo: 'atender', nota, intervencionId: alerta.intervencion_id ?? undefined })}
            />
          </View>
        </View>
      ) : null}

      {abierta ? (
        <>
          <Pressable accessibilityRole="button" onPress={() => setVerRuta((v) => !v)} style={styles.enlace}>
            <Text style={styles.enlaceTexto}>{verRuta ? 'Ocultar la ruta de emergencia' : 'Ver la ruta de emergencia'}</Text>
            <Icon name={verRuta ? 'chevronLeft' : 'chevronRight'} size={16} color={palette.forest} />
          </Pressable>
          {verRuta ? <RutaEmergencia categoria={alerta.categoria} institucionId={alerta.institucion_id} /> : null}
        </>
      ) : null}
    </View>
  );
}

/** Alertas de riesgo de caída de la institución: las inminentes primero. Docentes y el
 *  administrador las confirman o descartan, dejan constancia del aviso a rectoría y las cierran. */
export function AlertasScreen() {
  const styles = useStyles();
  const perfil = useMiPerfil();
  const institucion = useInstitucionElegida({ soloPropiaSiNoAdmin: true });
  const [filtro, setFiltro] = useState<FiltroAlertas>('abiertas');
  const alertas = useAlertas(filtro, institucion.institucionId, !perfil.isLoading);
  const admin = esAdmin(perfil.data);
  const gestiona = esRevisor(perfil.data);
  const lista = alertas.data ?? [];

  return (
    <Page onRefresh={() => void alertas.refetch()} refreshing={alertas.isRefetching}>
      <AppHeader
        eyebrow="Seguridad"
        title="Alertas de riesgo de caída"
        subtitle="Árboles con riesgo alto o inminente según el tamizaje de las inspecciones. Un docente confirma cada alerta y se avisa a rectoría."
      />
      {admin ? <InstitucionSelector value={institucion.institucionId} onChange={institucion.setInstitucionId} /> : null}
      <Tabs<FiltroAlertas>
        value={filtro}
        onChange={setFiltro}
        options={[
          { label: 'Abiertas', value: 'abiertas' },
          { label: 'Cerradas', value: 'cerradas' },
        ]}
      />
      {!gestiona ? <Notice>Si ves un árbol con riesgo, aléjate y avisa a un docente. Las alertas las gestionan los docentes.</Notice> : null}

      {alertas.isLoading ? (
        <LoadingState />
      ) : alertas.error ? (
        <ErrorState error={alertas.error} onRetry={() => void alertas.refetch()} />
      ) : lista.length === 0 ? (
        <EmptyState
          title={filtro === 'abiertas' ? 'Sin alertas abiertas' : 'Aún no hay alertas cerradas'}
          text={filtro === 'abiertas' ? 'Ningún árbol tiene riesgo de caída alto o inminente en este momento.' : undefined}
        />
      ) : (
        <View style={styles.lista}>
          {lista.map((alerta) => <TarjetaAlerta key={alerta.id} alerta={alerta} gestiona={gestiona} />)}
        </View>
      )}

      {institucion.institucionId ? <ContactosEmergencia institucionId={institucion.institucionId} editable={gestiona} /> : null}
    </Page>
  );
}

const useStyles = crearEstilos(({ palette, card }) => ({
  lista: { gap: 14 },
  tarjeta: { gap: 10, padding: 14, ...card },
  tarjetaInminente: { borderWidth: 2, borderColor: palette.red },
  arriba: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  arribaTexto: { flex: 1, minWidth: 0, gap: 2 },
  foto: { width: 56, height: 56, borderRadius: 12, backgroundColor: palette.line },
  titulo: { color: palette.ink, fontSize: 16, fontFamily: fonts.bold },
  subtitulo: { color: palette.ink, fontSize: 13, fontFamily: fonts.bold },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  texto: { color: palette.ink, fontSize: 14, lineHeight: 20 },
  negrita: { fontFamily: fonts.bold },
  insignias: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bloque: { gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.line },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accion: { flexGrow: 1, flexBasis: 140 },
  formulario: { flexBasis: '100%', gap: 4 },
  enlace: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 2 },
  enlaceTexto: { color: palette.forest, fontSize: 14, fontFamily: fonts.bold },
}));
