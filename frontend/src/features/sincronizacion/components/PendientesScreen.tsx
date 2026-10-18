import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import type { RegistroEnCola } from '@/features/sincronizacion/cola';
import { sincronizarAhora, useColaStore, useContadorCola } from '@/features/sincronizacion/colaStore';
import { uriVisible } from '@/services/offline/almacen';
import { useHayConexion } from '@/services/offline/conexion';
import { InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import { AppHeader, Badge, Card, ConfirmButton, EmptyState, IconChip, LoadingState, Notice, Page } from '@/shared/components/UI';
import { formatFechaHora } from '@/shared/format';
import { crearEstilos, useTema } from '@/theme';

function FilaRegistro({ registro }: { registro: RegistroEnCola }) {
  const styles = useStyles();
  const { palette } = useTema();
  const descartar = useColaStore((estado) => estado.descartar);
  const reintentar = useColaStore((estado) => estado.reintentar);
  const miniatura = registro.fotos.map(uriVisible).find(Boolean);
  const subidas = registro.fotos.filter((f) => f.subida).length;
  const soloFotos = Boolean(registro.registroId);
  const conError = registro.estado === 'error';

  return (
    <View style={styles.fila}>
      <View style={styles.filaArriba}>
        {miniatura ? (
          <Image source={{ uri: miniatura }} style={styles.miniatura} contentFit="cover" accessibilityIgnoresInvertColors />
        ) : (
          <IconChip icon={registro.tipo === 'arbol' ? 'tree' : 'review'} tono={conError ? 'critico' : 'info'} size={48} />
        )}
        <View style={styles.filaTexto}>
          <Text style={styles.titulo} numberOfLines={1}>
            {registro.tipo === 'arbol' ? `Árbol · ${registro.titulo}` : registro.titulo}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>{registro.detalle}</Text>
          <Text style={styles.meta}>
            Guardado el {formatFechaHora(registro.creadoEn)} · {registro.fotos.length === 1 ? '1 foto' : `${registro.fotos.length} fotos`}
            {subidas ? ` (${subidas} ya enviadas)` : ''}
          </Text>
        </View>
      </View>
      <View style={styles.insignias}>
        <Badge label={conError ? 'No se pudo enviar' : soloFotos ? 'Faltan fotos' : 'Por enviar'} tono={conError ? 'critico' : 'info'} />
        {registro.tipo === 'arbol' ? (
          <Badge label={registro.codigo ? `Código ${registro.codigo}` : 'Código: se asigna al enviar'} tono="neutro" />
        ) : null}
      </View>
      {conError && registro.error ? <InlineMessage>{registro.error}</InlineMessage> : null}
      {registro.fotos.some((f) => f.error) ? (
        <InlineMessage tone="warning">
          {registro.fotos.filter((f) => f.error).length} foto(s) no se pudieron enviar: {registro.fotos.find((f) => f.error)?.error}
        </InlineMessage>
      ) : null}
      <View style={styles.acciones}>
        {conError ? (
          <View style={styles.accion}>
            <PrimaryButton title="Reintentar" icon="refresh" compact onPress={() => void reintentar(registro.id)} />
          </View>
        ) : null}
        <View style={styles.accion}>
          <ConfirmButton
            title="Descartar"
            confirmTitle={
              soloFotos
                ? 'El registro ya está en el sistema; las fotos que faltan se borrarán del teléfono y no se enviarán.'
                : 'Se borrará del teléfono y no se enviará. ¿Descartarlo?'
            }
            onConfirm={() => void descartar(registro.id)}
          />
        </View>
      </View>
      {soloFotos && registro.tipo === 'arbol' && registro.registroId ? (
        <Pressable accessibilityRole="link" onPress={() => router.push(`/(app)/trees/${registro.registroId}` as Href)} style={styles.enlace}>
          <Text style={styles.enlaceTexto}>Ver ficha del árbol</Text>
          <Icon name="chevronRight" size={16} color={palette.forest} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Registros guardados en el teléfono sin conexión: estado de cada uno, envío manual y lo que
 *  ya se envió hace poco con el código que le asignó el sistema. */
export function PendientesScreen() {
  const styles = useStyles();
  const { palette } = useTema();
  const enLinea = useHayConexion();
  const cargada = useColaStore((estado) => estado.cargada);
  const registros = useColaStore((estado) => estado.registros);
  const enviados = useColaStore((estado) => estado.enviados);
  const enviando = useColaStore((estado) => estado.enviando);
  const { pendientes } = useContadorCola();

  return (
    <Page maxWidth={760}>
      <AppHeader
        eyebrow="Trabajo sin conexión"
        title="Registros por enviar"
        subtitle="Lo que registras sin señal queda guardado en este teléfono y se envía solo cuando vuelve la conexión."
      />

      <Notice tono={enLinea ? 'sano' : 'riesgo'}>
        {enLinea
          ? 'Hay conexión: los registros se envían automáticamente.'
          : 'Sin conexión. Puedes seguir registrando árboles e inspecciones: se enviarán cuando vuelva la señal.'}
      </Notice>
      {pendientes > 0 ? (
        <PrimaryButton
          title={enviando ? 'Enviando…' : `Enviar ahora (${pendientes})`}
          icon="sincronizar"
          loading={enviando}
          disabled={!enLinea}
          onPress={() => void sincronizarAhora()}
        />
      ) : null}

      {!cargada ? (
        <LoadingState text="Leyendo lo guardado en el teléfono…" />
      ) : registros.length === 0 ? (
        <EmptyState title="Todo está enviado" text="No hay registros esperando en este teléfono." />
      ) : (
        <View style={styles.lista}>
          {registros.map((registro) => (
            <FilaRegistro key={registro.id} registro={registro} />
          ))}
        </View>
      )}

      {enviados.length > 0 ? (
        <Card title="Enviados hace poco" icon="checkCircle">
          {enviados.map((enviado) => (
            <Pressable
              key={enviado.id}
              accessibilityRole="link"
              disabled={!enviado.arbolId}
              onPress={() => router.push(`/(app)/trees/${enviado.arbolId}` as Href)}
              style={styles.enviado}
            >
              <View style={styles.filaTexto}>
                <Text style={styles.titulo} numberOfLines={1}>
                  {enviado.tipo === 'arbol' ? `${enviado.codigo ?? 'Árbol'} · ${enviado.titulo}` : enviado.titulo}
                </Text>
                <Text style={styles.meta}>
                  Enviado el {formatFechaHora(enviado.enviadoEn)}
                  {enviado.fotosConError ? ` · ${enviado.fotosConError} foto(s) sin enviar` : ''}
                </Text>
              </View>
              {enviado.arbolId ? <Icon name="chevronRight" size={18} color={palette.muted} /> : null}
            </Pressable>
          ))}
        </Card>
      ) : null}

      <Card title="Cómo funciona" icon="info">
        <Text style={styles.texto}>• El inventario y las fichas que ya abriste se pueden consultar sin señal (se guarda una copia de hasta 7 días).</Text>
        <Text style={styles.texto}>• El código del árbol lo asigna el sistema al recibir el registro; por eso los árboles guardados en el teléfono aún no lo tienen.</Text>
        <Text style={styles.texto}>• Cada registro llega una sola vez, aunque la señal se corte a mitad del envío.</Text>
        <Text style={styles.texto}>• Lo guardado es de tu cuenta: si cierras sesión, se enviará cuando vuelvas a entrar en este teléfono.</Text>
      </Card>
    </Page>
  );
}

const useStyles = crearEstilos(({ palette, card }) => ({
  lista: { gap: 12 },
  fila: { gap: 10, padding: 14, ...card },
  filaArriba: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  miniatura: { width: 48, height: 48, borderRadius: 12, backgroundColor: palette.line },
  filaTexto: { flex: 1, minWidth: 0, gap: 2 },
  titulo: { color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  insignias: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accion: { flexGrow: 1, flexBasis: 140 },
  enlace: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 2 },
  enlaceTexto: { color: palette.forest, fontSize: 14, fontFamily: fonts.bold },
  enviado: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: palette.line },
  texto: { color: palette.ink, fontSize: 14, lineHeight: 20 },
}));
