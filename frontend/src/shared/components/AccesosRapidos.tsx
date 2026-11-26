import { Link, type Href } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { accesosRapidosPara, esRutaDeModulo, MENU_MODULOS } from '@/features/modules/modulos';
import type { MiPerfil } from '@/features/perfil/schemas';
import { Icon, type IconName } from '@/shared/components/Icon';
import { crearEstilos, useTema } from '@/theme';

function Acceso({ href, icono, etiqueta, descripcion, lateral, activo }: {
  href: Href;
  icono: IconName;
  etiqueta: string;
  descripcion: string;
  lateral: boolean;
  activo: boolean;
}) {
  const styles = useStyles();
  const { palette } = useTema();
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={descripcion}
        accessibilityState={{ selected: activo }}
        {...(Platform.OS === 'web' && activo ? { 'aria-current': 'page' } : {})}
        style={StyleSheet.flatten([
          styles.acceso,
          !lateral && styles.accesoCompacto,
          activo && styles.activo,
        ])}
      >
        <View style={[styles.icono, !lateral && styles.iconoCompacto, activo && styles.iconoActivo]}>
          <Icon name={icono} size={lateral ? 26 : 22} color={activo ? palette.white : palette.forest} />
        </View>
        <Text style={[styles.etiqueta, !lateral && styles.etiquetaCompacta, activo && styles.etiquetaActiva]} numberOfLines={2}>
          {etiqueta}
        </Text>
      </Pressable>
    </Link>
  );
}

export function AccesosRapidos({ perfil, pathname, lateral }: {
  perfil?: MiPerfil;
  pathname: string;
  lateral: boolean;
}) {
  const styles = useStyles();
  const accesos = accesosRapidosPara(perfil).map((modulo) => ({
    ...modulo,
    activo: pathname === modulo.ruta || pathname.startsWith(`${modulo.ruta}/`),
  }));
  const enlaces = accesos.map((modulo) => (
    <Acceso
      key={modulo.clave}
      href={modulo.href}
      icono={modulo.icono}
      etiqueta={modulo.corto}
      descripcion={modulo.titulo}
      lateral={lateral}
      activo={modulo.activo}
    />
  ));

  return (
    <View role="navigation" accessibilityLabel="Accesos rápidos" style={lateral ? styles.riel : styles.barra}>
      {lateral ? (
        <>
          <Text style={styles.titulo}>Accesos rápidos</Text>
          <ScrollView style={styles.desplazamiento} contentContainerStyle={styles.lista}>
            {enlaces}
          </ScrollView>
        </>
      ) : (
        <View style={styles.fila}>{enlaces}</View>
      )}
      <View style={lateral ? styles.pie : styles.pieCompacto}>
        <Acceso
          href={MENU_MODULOS}
          icono="modules"
          etiqueta="TODOS"
          descripcion="Ver todos los módulos"
          lateral={lateral}
          activo={esRutaDeModulo(pathname) && !accesos.some((modulo) => modulo.activo)}
        />
      </View>
    </View>
  );
}

const useStyles = crearEstilos(({ palette, card }) => ({
  riel: { flexShrink: 1, minHeight: 0, padding: 6, gap: 6, ...card, borderRadius: 18 },
  titulo: {
    paddingVertical: 4,
    color: palette.muted,
    fontSize: 10,
    lineHeight: 12,
    fontFamily: fonts.bold,
    letterSpacing: 0.5,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  desplazamiento: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  lista: { gap: 4 },
  barra: {
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: palette.paper,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  fila: { flex: 1, minWidth: 0, flexDirection: 'row' },
  pie: { paddingTop: 5, borderTopWidth: 1, borderTopColor: palette.line },
  pieCompacto: { width: 52, flexDirection: 'row', borderLeftWidth: 1, borderLeftColor: palette.line },
  acceso: { minHeight: 64, alignItems: 'center', justifyContent: 'center', padding: 4, gap: 4, borderRadius: 10 },
  accesoCompacto: { flex: 1, minWidth: 0, paddingHorizontal: 2 },
  activo: { backgroundColor: palette.forestSoft },
  icono: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.forestSoft },
  iconoCompacto: { width: 32, height: 32, borderRadius: 10 },
  iconoActivo: { backgroundColor: palette.forest },
  etiqueta: { color: palette.ink, fontFamily: fonts.semiBold, fontSize: 11, lineHeight: 13, textAlign: 'center' },
  etiquetaCompacta: { minHeight: 26 },
  etiquetaActiva: { color: palette.forest, fontFamily: fonts.bold },
}));
