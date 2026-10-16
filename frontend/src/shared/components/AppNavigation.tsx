import { router, usePathname, type Href } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, gradients, layout, palette } from '@/config/constants';
import { useAuthStore } from '@/features/auth/store';
import { useIsWide } from '@/hooks/use-is-wide';
import { queryClient } from '@/services/api/queryClient';
import { BrandMark } from '@/shared/components/BrandMark';
import { Icon, type IconName } from '@/shared/components/Icon';
import { gradient } from '@/shared/styles/gradient';

const navItems: { label: string; icon: IconName; href: Href; isActive: (path: string) => boolean }[] = [
  { label: 'Inicio', icon: 'home', href: '/(app)' as Href, isActive: (path) => path === '/' },
  { label: 'Inventario', icon: 'list', href: '/(app)/trees' as Href, isActive: (path) => path === '/trees' },
  { label: 'Registrar', icon: 'addCircle', href: '/(app)/trees/new' as Href, isActive: (path) => path === '/trees/new' },
];

async function signOut() {
  // Se limpia la caché para que la siguiente sesión no vea datos de la anterior.
  queryClient.clear();
  await useAuthStore.getState().signOut();
  router.replace('/login' as Href);
}

export function AppHeader() {
  const isWide = useIsWide();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const email = useAuthStore((state) => state.session?.email);

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
            {isWide ? <Text style={styles.brandCaption}>Inventario institucional</Text> : null}
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
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{email?.[0]?.toUpperCase() ?? 'A'}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar sesión"
            onPress={() => void signOut()}
            style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
          >
            <Icon name="logout" size={18} color={palette.muted} />
            {isWide ? <Text style={styles.logoutText}>Salir</Text> : null}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

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

const styles = StyleSheet.create({
  // Barra translúcida; en web desenfoca el fondo que pasa por detrás (efecto vidrio).
  header: { backgroundColor: 'rgba(255, 255, 255, 0.78)', borderBottomWidth: 1, borderBottomColor: 'rgba(232, 228, 216, 0.9)', ...glass },
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
  avatar: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: palette.leaf, ...gradient(gradients.lime) },
  avatarText: { color: palette.forestDark, fontSize: 14, fontFamily: fonts.extraBold },
  logout: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: palette.line },
  logoutText: { color: palette.muted, fontSize: 13, fontFamily: fonts.semiBold },
  pressed: { opacity: 0.7 },
  bottomNav: { flexDirection: 'row', paddingTop: 8, paddingHorizontal: 8, backgroundColor: 'rgba(255, 255, 255, 0.86)', borderTopWidth: 1, borderTopColor: 'rgba(232, 228, 216, 0.9)', boxShadow: '0 -6px 20px rgba(15, 61, 38, 0.06)', ...glass },
  bottomItem: { flex: 1, alignItems: 'center', gap: 2 },
  bottomIcon: { width: 56, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  bottomIconActive: { backgroundColor: palette.forestSoft },
  bottomLabel: { color: palette.muted, fontSize: 12, fontFamily: fonts.semiBold },
  bottomLabelActive: { color: palette.forest, fontFamily: fonts.bold },
});
