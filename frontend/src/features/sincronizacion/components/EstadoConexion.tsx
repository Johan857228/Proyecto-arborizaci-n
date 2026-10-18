import { router, type Href } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { fonts } from '@/config/constants';
import { useColaStore, useContadorCola } from '@/features/sincronizacion/colaStore';
import { useIsWide } from '@/hooks/use-is-wide';
import { useHayConexion } from '@/services/offline/conexion';
import { Icon, type IconName } from '@/shared/components/Icon';
import { useTonos, type Tono } from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

/** Aviso de la barra superior: sin conexión, registros por enviar o enviando. No se muestra
 *  cuando hay conexión y todo está enviado. Lleva a la lista de registros por enviar. */
export function EstadoConexion() {
  const styles = useStyles();
  const tonos = useTonos();
  const isWide = useIsWide();
  const enLinea = useHayConexion();
  const { pendientes, conError } = useContadorCola();
  const enviando = useColaStore((estado) => estado.enviando);
  if (enLinea && pendientes === 0 && conError === 0) return null;

  const estado: { icono: IconName; texto: string; corto: string; tono: Tono } = enviando
    ? { icono: 'sincronizar', texto: 'Enviando…', corto: String(pendientes), tono: 'info' }
    : !enLinea
      ? { icono: 'sinConexion', texto: pendientes ? `Sin conexión · ${pendientes} por enviar` : 'Sin conexión', corto: pendientes ? String(pendientes) : '', tono: 'riesgo' }
      : conError
        ? { icono: 'warning', texto: `${conError} sin poder enviar`, corto: String(conError), tono: 'critico' }
        : { icono: 'enCola', texto: `${pendientes} por enviar`, corto: String(pendientes), tono: 'info' };
  const texto = isWide ? estado.texto : estado.corto;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${estado.texto}. Ver registros por enviar`}
      onPress={() => router.navigate('/(app)/sync' as Href)}
      hitSlop={6}
      style={({ pressed }) => [styles.chip, { backgroundColor: tonos[estado.tono].fondo }, pressed && styles.pressed]}
    >
      <Icon name={estado.icono} size={16} color={tonos[estado.tono].texto} />
      {texto ? <Text style={[styles.texto, { color: tonos[estado.tono].texto }]}>{texto}</Text> : null}
    </Pressable>
  );
}

const useStyles = crearEstilos(() => ({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32, minWidth: 32, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 16 },
  texto: { fontSize: 13, fontFamily: fonts.bold },
  pressed: { opacity: 0.75 },
}));
