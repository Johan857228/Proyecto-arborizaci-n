import { router, usePathname, type Href } from 'expo-router';
import { Platform, Pressable, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, layout } from '@/config/constants';
import { useAuthStore } from '@/features/auth/store';
import { Avatar } from '@/features/perfil/components/Avatar';
import { usePendientes } from '@/features/inspections/hooks/useInspecciones';
import { useCuentasSinInstitucion, useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin, esRevisor } from '@/features/perfil/schemas';
import { esRutaDeModulo } from '@/features/modules/modulos';
import { useIsWide } from '@/hooks/use-is-wide';
import { queryClient } from '@/services/api/queryClient';
import { BrandMark } from '@/shared/components/BrandMark';
import { Icon, type IconName } from '@/shared/components/Icon';
import { crearEstilos, useTema, useTemaStore } from '@/theme';

const navItems: { label: string; icon: IconName; href: Href; isActive: (path: string) => boolean }[] = [
  { label: 'Inicio', icon: 'home', href: '/(app)' as Href, isActive: (path) => path === '/' },
  // La ficha de un árbol (/trees/<id>) también es parte del inventario.
  { label: 'Inventario', icon: 'list', href: '/(app)/trees' as Href, isActive: (path) => path === '/trees' || (path.startsWith('/trees/') && path !== '/trees/new') },
  { label: 'Registrar', icon: 'addCircle', href: '/(app)/trees/new' as Href, isActive: (path) => path === '/trees/new' },
  { label: 'Módulos', icon: 'modules', href: '/(app)/modules' as Href, isActive: esRutaDeModulo },
];

async function signOut() {
  // Se limpia la caché para que la siguiente sesión no vea datos de la anterior.
  queryClient.clear();
  await useAuthStore.getState().signOut();
  router.replace('/login' as Href);
}

export function AppHeader() {
  const styles = useStyles();
  const { palette } = useTema();
  const isWide = useIsWide();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const email = useAuthStore((state) => state.session?.email);
  const perfil = useMiPerfil();
  const { oscuro } = useTema();
  const elegirTema = useTemaStore((state) => state.elegir);

  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <View style={styles.headerInner}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Ir al inicio"
          onPress={() => router.navigate('/(app)' as Href)}
          style={styles.brand}
        >
          <BrandMark size={36} />
          <View>
            <Text style={styles.brandName}>Arbolado Escolar</Text>
            {isWide ? <Text style={styles.brandCaption} numberOfLines={1}>{perfil.data?.institucion_nombre ?? 'Inventario institucional'}</Text> : null}
          </View>
        </Pressable>

        {isWide ? (
          <View style={styles.headerNav}>
            {navItems.map((item) => {
              const active = item.isActive(pathname);
              return (
                <Pressable
                  key={item.label}
                  accessibilityRole="link"
                  accessibilityState={{ selected: active }}
                  onPress={() => router.navigate(item.href)}
                  style={({ pressed }) => [styles.headerLink, active && styles.headerLinkActive, pressed && styles.pressed]}
                >
                  <Icon name={item.icon} size={18} color={active ? palette.forest : palette.muted} />
                  <Text style={[styles.headerLinkText, active && styles.headerLinkTextActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={styles.account}>
          {isWide && email ? <Text style={styles.email} numberOfLines={1}>{email}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={oscuro ? 'Usar tema claro' : 'Usar tema oscuro'}
            onPress={() => void elegirTema(oscuro ? 'claro' : 'oscuro')}
            hitSlop={6}
            style={({ pressed }) => [styles.themeToggle, pressed && styles.pressed]}
          >
            <Icon name={oscuro ? 'sun' : 'moon'} size={18} color={palette.muted} />
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Mi perfil"
            onPress={() => router.navigate('/(app)/profile' as Href)}
            style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
          >
            <Avatar url={perfil.data?.foto_url} nombre={perfil.data?.nombre ?? email ?? undefined} size={34} />
          </Pressable>
          {/* En el teléfono, cerrar sesión está en Mi perfil: así no se sale por un toque accidental. */}
          {isWide ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar sesión"
              onPress={() => void signOut()}
              style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
            >
              <Icon name="logout" size={18} color={palette.muted} />
              <Text style={styles.logoutText}>Salir</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** Tareas de revisión que esperan (y cuentas nuevas para el administrador): se muestran sobre
 *  "Inicio" mientras la persona está en otra pantalla. Misma caché que Revisión. */
function usePendientesNav() {
  const perfil = useMiPerfil();
  const institucionId = perfil.data?.institucion_id ?? undefined;
  const admin = esAdmin(perfil.data);
  const revision = usePendientes(institucionId, 0, esRevisor(perfil.data) && (admin || Boolean(institucionId)));
  const cuentas = useCuentasSinInstitucion(admin);
  return (revision.data?.total ?? 0) + cuentas;
}

export function BottomNav() {
  const styles = useStyles();
  const { palette } = useTema();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const pendientes = usePendientesNav();

  return (
    <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {navItems.map((item) => {
        const active = item.isActive(pathname);
        return (
          <Pressable
            key={item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => router.navigate(item.href)}
            style={styles.bottomItem}
          >
            <View style={[styles.bottomIcon, active && styles.bottomIconActive]}>
              <Icon name={item.icon} size={22} color={active ? palette.forest : palette.muted} />
              {item.label === 'Inicio' && !active && pendientes > 0 ? (
                <View style={styles.navBadge}><Text style={styles.navBadgeText}>{pendientes > 99 ? '99+' : pendientes}</Text></View>
              ) : null}
            </View>
            <Text style={[styles.bottomLabel, active && styles.bottomLabelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Desenfoque del fondo detrás de las barras (solo web; en nativo basta la transparencia).
const glass = (Platform.OS === 'web' ? { backdropFilter: 'saturate(160%) blur(14px)' } : {}) as ViewStyle;

const useStyles = crearEstilos(({ palette }) => ({
  // Barra translúcida; en web desenfoca el fondo que pasa por detrás (efecto vidrio).
  header: { backgroundColor: palette.chrome, borderBottomWidth: 1, borderBottomColor: palette.chromeLine, ...glass },
  headerInner: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandName: { color: palette.ink, fontSize: 16, fontFamily: fonts.extraBold, letterSpacing: -0.2 },
  brandCaption: { color: palette.muted, fontSize: 12 },
  headerNav: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 4 },
  headerLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  headerLinkActive: { backgroundColor: palette.forestSoft },
  headerLinkText: { color: palette.muted, fontSize: 14, fontFamily: fonts.semiBold },
  headerLinkTextActive: { color: palette.forest, fontFamily: fonts.bold },
  account: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 10 },
  email: { maxWidth: 200, color: palette.muted, fontSize: 13 },
  avatar: { borderRadius: 19, padding: 2, borderWidth: 1, borderColor: palette.leaf },
  themeToggle: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: palette.line },
  logout: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: palette.line },
  logoutText: { color: palette.muted, fontSize: 13, fontFamily: fonts.semiBold },
  pressed: { opacity: 0.7 },
  bottomNav: { flexDirection: 'row', paddingTop: 8, paddingHorizontal: 8, backgroundColor: palette.chrome, borderTopWidth: 1, borderTopColor: palette.chromeLine, boxShadow: '0 -6px 20px rgba(15, 61, 38, 0.06)', ...glass },
  bottomItem: { flex: 1, alignItems: 'center', gap: 2 },
  bottomIcon: { width: 56, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  bottomIconActive: { backgroundColor: palette.forestSoft },
  bottomLabel: { color: palette.muted, fontSize: 12, fontFamily: fonts.semiBold },
  bottomLabelActive: { color: palette.forest, fontFamily: fonts.bold },
  navBadge: { position: 'absolute', top: -2, right: 8, minWidth: 18, height: 18, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: palette.amber, borderWidth: 2, borderColor: palette.paper },
  navBadgeText: { color: palette.paper, fontSize: 10, fontFamily: fonts.extraBold },
}));
