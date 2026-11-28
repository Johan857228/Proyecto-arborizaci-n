import { router, usePathname, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { modulosPara, type Modulo } from '@/features/modules/modulos';
import { useCuentasSinInstitucion } from '@/features/perfil/hooks/usePerfil';
import { esAdmin, type MiPerfil } from '@/features/perfil/schemas';
import { Icon } from '@/shared/components/Icon';
import { IconChip } from '@/shared/components/UI';
import { gradient } from '@/shared/styles/gradient';
import { crearEstilos, useTema } from '@/theme';

/** Desde este ancho la app muestra el riel de módulos a la izquierda en todas las pantallas
 *  (es también el ancho desde el que el inicio se arma como tablero de una sola pantalla). */
export const ANCHO_RIEL = 1100;
/** Ancho de la columna del riel, sin contar el margen. */
export const COLUMNA_RIEL = 84;

/** Orden del riel: primero lo que más se usa en el colegio y después lo de gestión. */
const ORDEN_RIEL = ['mapa', 'analisis', 'alertas', 'laboratorio', 'privacidad', 'siembras', 'servicio', 'reportes', 'especies',
  'intervenciones', 'guias', 'cursos', 'prae'];

function ordenados(perfil?: MiPerfil): Modulo[] {
  return modulosPara(perfil)
    .filter((m) => m.clave !== 'revision' && m.clave !== 'progreso')
    .map((modulo, indice) => {
      const posicion = ORDEN_RIEL.indexOf(modulo.clave);
      return { modulo, orden: posicion >= 0 ? posicion : ORDEN_RIEL.length + indice };
    })
    .sort((a, b) => a.orden - b.orden)
    .map(({ modulo }) => modulo);
}

/** Columna angosta con los módulos (ícono y nombre corto), fija a la izquierda en escritorio para
 *  pasar de un módulo a otro sin volver al inicio. Marca el módulo abierto. Si no caben todos, la
 *  columna se desplaza sola y un desvanecido abajo avisa que hay más; "Todos" abre Módulos. */
export function RielModulos({ perfil }: { perfil?: MiPerfil }) {
  const styles = useStyles();
  const { palette } = useTema();
  const ruta = usePathname();
  const cuentas = useCuentasSinInstitucion(esAdmin(perfil));
  const [altoVisible, setAltoVisible] = useState(0);
  const [altoContenido, setAltoContenido] = useState(0);
  const [desplazado, setDesplazado] = useState(0);
  const quedanMas = altoContenido - altoVisible - desplazado > 4;
  const enTodos = ruta === '/modules';

  return (
    <View style={styles.riel} accessibilityRole="menu" accessibilityLabel="Módulos">
      <Text style={styles.titulo}>Módulos</Text>
      <View style={styles.flex}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.lista}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={32}
          onLayout={(evento) => setAltoVisible(evento.nativeEvent.layout.height)}
          onContentSizeChange={(_, alto) => setAltoContenido(alto)}
          onScroll={(evento) => setDesplazado(evento.nativeEvent.contentOffset.y)}
        >
          {ordenados(perfil).map((modulo) => {
            const activo = ruta === modulo.ruta || ruta.startsWith(`${modulo.ruta}/`);
            return (
              <Pressable
                key={modulo.clave}
                accessibilityRole="link"
                accessibilityLabel={modulo.titulo}
                accessibilityState={{ selected: activo }}
                onPress={() => router.navigate(modulo.href)}
                style={({ pressed }) => [styles.item, activo && styles.itemActivo, pressed && styles.pressed]}
              >
                <View>
                  <IconChip icon={modulo.icono} size={28} />
                  {modulo.clave === 'usuarios' && cuentas > 0 ? (
                    <View style={styles.insignia}><Text style={styles.insigniaTexto}>{cuentas}</Text></View>
                  ) : null}
                </View>
                <Text style={[styles.texto, activo && styles.textoActivo]} numberOfLines={1}>{modulo.corto}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {quedanMas ? <View style={[styles.desvanecido, gradient(`linear-gradient(180deg, ${palette.paper}00 0%, ${palette.paper} 85%)`)]} /> : null}
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Ver todos los módulos"
        accessibilityState={{ selected: enTodos }}
        onPress={() => router.navigate('/(app)/modules' as Href)}
        style={({ pressed }) => [styles.todos, pressed && styles.pressed]}
      >
        <Icon name="modules" size={16} color={palette.forest} />
        <Text style={styles.todosTexto}>Todos</Text>
      </Pressable>
    </View>
  );
}

const useStyles = crearEstilos(({ palette, card }) => ({
  flex: { flex: 1, minHeight: 0 },
  pressed: { opacity: 0.8 },
  riel: { flex: 1, gap: 4, paddingTop: 10, paddingBottom: 8, paddingHorizontal: 4, ...card, borderRadius: 18 },
  titulo: { color: palette.muted, fontSize: 9.5, lineHeight: 12, fontFamily: fonts.bold, letterSpacing: 0.6, textAlign: 'center', textTransform: 'uppercase' },
  lista: { flexGrow: 1, justifyContent: 'space-between', gap: 2 },
  item: { alignItems: 'center', gap: 2, paddingVertical: 3, borderRadius: 12 },
  itemActivo: { backgroundColor: palette.forestSoft },
  texto: { maxWidth: '100%', color: palette.ink, fontSize: 10.5, lineHeight: 13, fontFamily: fonts.semiBold, textAlign: 'center' },
  textoActivo: { color: palette.forest, fontFamily: fonts.extraBold },
  desvanecido: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 36, pointerEvents: 'none' },
  todos: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 7, borderTopWidth: 1, borderTopColor: palette.line },
  todosTexto: { color: palette.forest, fontSize: 12, fontFamily: fonts.bold },
  insignia: { position: 'absolute', top: -5, right: -8, minWidth: 17, height: 17, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: palette.amber },
  insigniaTexto: { color: palette.paper, fontSize: 10, fontFamily: fonts.extraBold },
}));
