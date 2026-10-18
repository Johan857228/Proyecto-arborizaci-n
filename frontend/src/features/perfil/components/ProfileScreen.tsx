import { type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { fonts } from '@/config/constants';
import { useAuthStore } from '@/features/auth/store';
import { Avatar } from '@/features/perfil/components/Avatar';
import { useImagenPropia } from '@/features/perfil/hooks/useImagenPropia';
import { useCambiarMiNombre, useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { ETIQUETA_ROL, editarNombreSchema } from '@/features/perfil/schemas';
import { useContadorCola } from '@/features/sincronizacion/colaStore';
import { getApiErrorMessage } from '@/services/api/client';
import { ActionSheet } from '@/shared/components/ActionSheet';
import { Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Icon, type IconName } from '@/shared/components/Icon';
import { LeafWatermark } from '@/shared/components/LeafWatermark';
import { usePressScale } from '@/shared/components/Motion';
import { AppHeader, Badge, Card, ErrorState, KeyValue, LoadingState, NavCard, Page } from '@/shared/components/UI';
import { crearEstilos, useTema, useTemaStore, type PreferenciaTema } from '@/theme';

const OPCIONES_TEMA: { valor: PreferenciaTema; label: string; icon: IconName }[] = [
  { valor: 'sistema', label: 'Sistema', icon: 'contrast' },
  { valor: 'claro', label: 'Claro', icon: 'sun' },
  { valor: 'oscuro', label: 'Oscuro', icon: 'moon' },
];

/** Foto de perfil grande con el lápiz para cambiarla (o quitarla si ya hay una). */
function FotoEditable({ url, nombre }: { url: string | null; nombre: string }) {
  const styles = useStyles();
  const { palette } = useTema();
  const foto = useImagenPropia('foto');
  const press = usePressScale(0.95);
  const [menu, setMenu] = useState(false);
  return (
    <View style={styles.fotoWrap}>
      <Animated.View style={press.style}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={url ? 'Cambiar o quitar la foto de perfil' : 'Agregar foto de perfil'}
          disabled={foto.cargando}
          onPress={() => (url ? setMenu(true) : void foto.elegir())}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          style={styles.fotoRing}
        >
          <Avatar url={url} nombre={nombre} size={96} />
          {foto.cargando ? (
            <View style={styles.fotoCargando}><ActivityIndicator color={palette.white} /></View>
          ) : null}
          <View style={styles.fotoLapiz}>
            <Icon name="edit" size={15} color={palette.white} />
          </View>
        </Pressable>
      </Animated.View>
      {foto.error ? <InlineMessage>{foto.error}</InlineMessage> : null}
      <ActionSheet
        visible={menu}
        title="Foto de perfil"
        onClose={() => setMenu(false)}
        actions={[
          { label: 'Cambiar foto', icon: 'gallery', onPress: () => void foto.elegir() },
          { label: 'Quitar foto', icon: 'trash', onPress: () => void foto.quitar(), destructiva: true },
        ]}
      />
    </View>
  );
}

function SelectorTema() {
  const styles = useStyles();
  const { palette } = useTema();
  const preferencia = useTemaStore((state) => state.preferencia);
  const elegir = useTemaStore((state) => state.elegir);
  return (
    <View style={styles.temas} accessibilityRole="radiogroup">
      {OPCIONES_TEMA.map((opcion) => {
        const activa = opcion.valor === preferencia;
        return (
          <Pressable
            key={opcion.valor}
            accessibilityRole="radio"
            accessibilityState={{ checked: activa }}
            onPress={() => void elegir(opcion.valor)}
            style={({ pressed }) => [styles.tema, activa && styles.temaActivo, pressed && styles.pressed]}
          >
            <Icon name={opcion.icon} size={20} color={activa ? palette.forest : palette.muted} />
            <Text style={[styles.temaTexto, activa && styles.temaTextoActivo]}>{opcion.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProfileScreen() {
  const styles = useStyles();
  const perfil = useMiPerfil();
  const cambiar = useCambiarMiNombre();
  const signOut = useAuthStore((state) => state.signOut);
  const porEnviar = useContadorCola().total;
  const [nombre, setNombre] = useState<string>();
  const [mensaje, setMensaje] = useState<string>();
  const [error, setError] = useState<string>();

  if (perfil.isLoading) return <Page><LoadingState /></Page>;
  if (perfil.error || !perfil.data) {
    return <Page><AppHeader title="Mi perfil" /><ErrorState error={perfil.error} onRetry={() => void perfil.refetch()} /></Page>;
  }
  const p = perfil.data;
  const valor = nombre ?? p.nombre;

  async function guardar() {
    setError(undefined);
    setMensaje(undefined);
    const validado = editarNombreSchema.safeParse({ nombre: valor });
    if (!validado.success) {
      setError(validado.error.issues[0].message);
      return;
    }
    try {
      await cambiar.mutateAsync(validado.data.nombre);
      setNombre(undefined);
      setMensaje('Nombre actualizado.');
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  return (
    <Page maxWidth={640}>
      <AppHeader eyebrow="Cuenta" title="Mi perfil" subtitle="Tu rol, institución y curso los asigna el administrador o tu docente." />

      <View style={styles.identidad}>
        <LeafWatermark size={170} />
        <FotoEditable url={p.foto_url} nombre={p.nombre} />
        <View style={styles.identidadTexto}>
          <Text style={styles.nombre}>{p.nombre}</Text>
          {p.correo ? <Text style={styles.correo}>{p.correo}</Text> : null}
          <View style={styles.badges}>
            <Badge label={ETIQUETA_ROL[p.rol]} tono="info" />
            {p.institucion_nombre ? <Badge label={p.institucion_nombre} /> : null}
          </View>
          <Text style={styles.ayuda}>Toca la foto para cambiarla.</Text>
        </View>
      </View>

      <NavCard
        title="Privacidad y mis datos"
        text="Política de datos, autorización de tu acudiente, alias en los rankings y tus solicitudes."
        href={'/(app)/privacy' as Href}
        icon="lock"
      />

      <Card title="Apariencia" subtitle="Sistema usa el mismo tema de tu teléfono o navegador." icon="contrast">
        <SelectorTema />
      </Card>

      <Card title="Datos" icon="person">
        <View style={styles.kvs}>
          <KeyValue label="Correo" value={p.correo ?? '—'} />
          <KeyValue label="Rol" value={ETIQUETA_ROL[p.rol]} />
          <KeyValue label="Institución" value={p.institucion_nombre ?? 'Sin asignar'} />
          <KeyValue label="Curso" value={p.curso_nombre ?? 'Sin curso'} />
        </View>
      </Card>

      <Card title="Nombre visible" subtitle="Así apareces en los rankings, el historial y las revisiones." icon="edit">
        <Field label="Nombre" value={valor} onChangeText={setNombre} />
        {mensaje ? <InlineMessage tone="info">{mensaje}</InlineMessage> : null}
        {error ? <InlineMessage>{error}</InlineMessage> : null}
        <PrimaryButton title="Guardar nombre" disabled={valor.trim() === p.nombre} loading={cambiar.isPending} onPress={() => void guardar()} />
      </Card>
      {porEnviar > 0 ? (
        <InlineMessage tone="warning">
          Tienes {porEnviar === 1 ? 'un registro' : `${porEnviar} registros`} sin enviar en este teléfono. Si cierras sesión no se
          pierden, pero solo se enviarán cuando vuelvas a entrar con tu cuenta aquí.
        </InlineMessage>
      ) : null}
      <PrimaryButton title="Cerrar sesión" icon="logout" variant="secondary" onPress={() => void signOut()} />
    </Page>
  );
}

const useStyles = crearEstilos(({ palette, card }) => ({
  identidad: { overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18, padding: 18, ...card },
  identidadTexto: { flexGrow: 1, flexShrink: 1, flexBasis: 200, gap: 4 },
  nombre: { color: palette.ink, fontSize: 22, fontFamily: fonts.extraBold, letterSpacing: -0.4 },
  correo: { color: palette.muted, fontSize: 14 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  ayuda: { marginTop: 6, color: palette.muted, fontSize: 12 },
  fotoWrap: { gap: 10, alignItems: 'center' },
  fotoRing: { padding: 4, borderRadius: 999, borderWidth: 2, borderColor: palette.leaf },
  fotoCargando: { position: 'absolute', top: 4, left: 4, width: 96, height: 96, alignItems: 'center', justifyContent: 'center', borderRadius: 48, backgroundColor: 'rgba(8, 26, 17, 0.55)' },
  // Lápiz pequeño pero visible sobre el borde de la foto.
  fotoLapiz: { position: 'absolute', right: 0, bottom: 2, width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#1B7A41', borderWidth: 3, borderColor: palette.paper },
  temas: { flexDirection: 'row', gap: 8 },
  tema: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.tile },
  temaActivo: { borderColor: palette.forest, backgroundColor: palette.forestSoft },
  temaTexto: { color: palette.muted, fontSize: 13, fontFamily: fonts.semiBold },
  temaTextoActivo: { color: palette.forest, fontFamily: fonts.bold },
  pressed: { opacity: 0.75 },
  kvs: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
}));
