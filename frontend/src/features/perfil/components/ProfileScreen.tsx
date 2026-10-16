import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { palette } from '@/config/constants';
import { useAuthStore } from '@/features/auth/store';
import { useCambiarMiNombre, useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { ETIQUETA_ROL, editarNombreSchema } from '@/features/perfil/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { AppHeader, Card, ErrorState, KeyValue, LoadingState, Page } from '@/shared/components/UI';

export function ProfileScreen() {
  const perfil = useMiPerfil();
  const cambiar = useCambiarMiNombre();
  const signOut = useAuthStore((state) => state.signOut);
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
      <Card title="Datos">
        <View style={styles.kvs}>
          <KeyValue label="Correo" value={p.correo ?? '—'} />
          <KeyValue label="Rol" value={ETIQUETA_ROL[p.rol]} />
          <KeyValue label="Institución" value={p.institucion_nombre ?? 'Sin asignar'} />
          <KeyValue label="Curso" value={p.curso_nombre ?? 'Sin curso'} />
        </View>
      </Card>
      <Card title="Nombre visible">
        <Text style={styles.texto}>Así apareces en los rankings, el historial y las revisiones.</Text>
        <Field label="Nombre" value={valor} onChangeText={setNombre} />
        {mensaje ? <InlineMessage tone="info">{mensaje}</InlineMessage> : null}
        {error ? <InlineMessage>{error}</InlineMessage> : null}
        <PrimaryButton title="Guardar nombre" disabled={valor.trim() === p.nombre} loading={cambiar.isPending} onPress={() => void guardar()} />
      </Card>
      <PrimaryButton title="Cerrar sesión" variant="secondary" onPress={() => void signOut()} />
    </Page>
  );
}

const styles = StyleSheet.create({
  kvs: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  texto: { color: palette.muted, fontSize: 13, lineHeight: 18 },
});
