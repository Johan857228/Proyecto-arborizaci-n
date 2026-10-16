import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { useCatalogs } from '@/features/catalogs/hooks/useCatalogs';
import { useRegisterTree } from '@/features/trees/hooks/useRegisterTree';
import { TreeCreateForm } from '@/features/trees/components/TreeCreateForm';
import { getApiErrorMessage } from '@/services/api/client';
import type { ArbolCrear, FotoLocal } from '@/features/trees/types';
import { palette } from '@/config/constants';
import { PrimaryButton, Screen } from '@/shared/components/FormControls';

export default function NewTreeRoute() {
  const catalogs = useCatalogs();
  const registerTree = useRegisterTree();
  const [submitError, setSubmitError] = useState<string>();

  async function submit(values: ArbolCrear, photos: FotoLocal[]) {
    setSubmitError(undefined);
    try {
      const { tree, photoError } = await registerTree.submit(values, photos);
      if (photoError) {
        Alert.alert(
          'Árbol guardado, falta una foto',
          `${tree.codigo} quedó registrado, pero no se pudo subir toda la evidencia. ${getApiErrorMessage(photoError)}`,
          [{ text: 'Volver al inicio', onPress: () => router.replace('/(app)' as Href) }],
        );
        return;
      }
      Alert.alert('Registro completado', `${tree.codigo} · ${tree.nombre_comun}`, [
        { text: 'Ver inicio', onPress: () => router.replace('/(app)' as Href) },
      ]);
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  }

  if (catalogs.isLoading) {
    return <Screen><View style={styles.loading}><ActivityIndicator color={palette.forest} /><Text style={styles.loadingText}>Cargando catálogos…</Text></View></Screen>;
  }
  if (catalogs.error || !catalogs.data) {
    return (
      <Screen>
        <View style={styles.loading}>
          <Text style={styles.error}>{getApiErrorMessage(catalogs.error)}</Text>
          <Text style={styles.loadingText}>No se pudieron cargar especies, instituciones y observaciones.</Text>
          <PrimaryButton title="Reintentar" variant="secondary" onPress={() => void catalogs.refetch()} />
        </View>
      </Screen>
    );
  }

  return (
    <TreeCreateForm
      catalogs={catalogs.data}
      submitting={registerTree.isPending}
      submitError={submitError}
      onCancel={() => router.back()}
      onSubmit={submit}
    />
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 12 },
  loadingText: { color: palette.muted, fontSize: 14, textAlign: 'center' },
  error: { color: palette.red, fontWeight: '700', textAlign: 'center' },
});