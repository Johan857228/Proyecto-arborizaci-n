import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { useCatalogs } from '@/features/catalogs/hooks/useCatalogs';
import { useRegisterTree } from '@/features/trees/hooks/useRegisterTree';
import { RegistrationSuccess } from '@/features/trees/components/RegistrationSuccess';
import { TreeCreateForm } from '@/features/trees/components/TreeCreateForm';
import { getApiErrorMessage } from '@/services/api/client';
import type { ArbolCrear, FotoLocal } from '@/features/trees/types';
import { fonts, palette } from '@/config/constants';
import { PrimaryButton, Screen } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';

interface Registered {
  id: string;
  codigo: string;
  nombreComun: string;
  photoWarning?: string;
}

export default function NewTreeRoute() {
  const catalogs = useCatalogs();
  const registerTree = useRegisterTree();
  const [submitError, setSubmitError] = useState<string>();
  const [registered, setRegistered] = useState<Registered>();
  // Cambiar la clave vuelve a montar el formulario vacío para registrar otro árbol.
  const [formKey, setFormKey] = useState(0);

  async function submit(values: ArbolCrear, photos: FotoLocal[]) {
    setSubmitError(undefined);
    try {
      const { tree, photoError } = await registerTree.submit(values, photos);
      setRegistered({
        id: tree.id,
        codigo: tree.codigo,
        nombreComun: tree.nombre_comun,
        photoWarning: photoError
          ? `No se pudo subir toda la evidencia fotográfica. ${getApiErrorMessage(photoError)}`
          : undefined,
      });
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  }

  if (registered) {
    return (
      <RegistrationSuccess
        codigo={registered.codigo}
        nombreComun={registered.nombreComun}
        photoWarning={registered.photoWarning}
        onRegisterAnother={() => {
          setRegistered(undefined);
          setFormKey((key) => key + 1);
        }}
        onViewTree={() => router.push(`/(app)/trees/${registered.id}` as Href)}
        onViewInventory={() => router.navigate('/(app)/trees' as Href)}
      />
    );
  }

  if (catalogs.isLoading) {
    return (
      <Screen>
        <View style={styles.state}>
          <ActivityIndicator color={palette.forest} />
          <Text style={styles.stateText}>Cargando catálogos…</Text>
        </View>
      </Screen>
    );
  }
  if (catalogs.error || !catalogs.data) {
    return (
      <Screen>
        <View style={styles.state}>
          <View style={styles.stateIcon}><Icon name="error" size={28} color={palette.red} /></View>
          <Text style={styles.stateTitle}>{getApiErrorMessage(catalogs.error)}</Text>
          <Text style={styles.stateText}>No se pudieron cargar especies, instituciones y observaciones.</Text>
          <PrimaryButton title="Reintentar" icon="refresh" variant="secondary" onPress={() => void catalogs.refetch()} />
        </View>
      </Screen>
    );
  }

  return (
    <TreeCreateForm
      key={formKey}
      catalogs={catalogs.data}
      submitting={registerTree.isPending}
      submitError={submitError}
      onCancel={() => router.navigate('/(app)/trees' as Href)}
      onSubmit={submit}
    />
  );
}

const styles = StyleSheet.create({
  state: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 12 },
  stateIcon: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: palette.redSoft },
  stateTitle: { color: palette.ink, fontSize: 16, fontFamily: fonts.bold, textAlign: 'center' },
  stateText: { color: palette.muted, fontSize: 14, textAlign: 'center' },
});
