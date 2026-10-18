import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';

import { useCatalogs } from '@/features/catalogs/hooks/useCatalogs';
import { useRegisterTree } from '@/features/trees/hooks/useRegisterTree';
import { RegistrationSuccess } from '@/features/trees/components/RegistrationSuccess';
import { TreeCreateForm } from '@/features/trees/components/TreeCreateForm';
import { getApiErrorMessage } from '@/services/api/client';
import type { ArbolCrear, FotoLocal } from '@/features/trees/types';
import { fonts } from '@/config/constants';
import { PrimaryButton, Screen } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import { crearEstilos, useTema } from '@/theme';

interface Registered {
  /** Sin id ni código: quedó guardado en el teléfono y se envía cuando haya conexión. */
  id?: string;
  codigo?: string;
  nombreComun: string;
  photoWarning?: string;
  fotosEnCola?: number;
}

export default function NewTreeRoute() {
  const styles = useStyles();
  const { palette } = useTema();
  const catalogs = useCatalogs();
  const registerTree = useRegisterTree();
  const [submitError, setSubmitError] = useState<string>();
  const [registered, setRegistered] = useState<Registered>();
  // Cambiar la clave vuelve a montar el formulario vacío para registrar otro árbol.
  const [formKey, setFormKey] = useState(0);

  async function submit(values: ArbolCrear, photos: FotoLocal[]) {
    setSubmitError(undefined);
    const especie = catalogs.data?.especies.find((item) => item.id === values.especie_id);
    const institucion = catalogs.data?.instituciones.find((item) => item.id === values.institucion_id);
    const zona = values.zona === 'Otra' ? values.zona_otra : values.zona;
    const etiqueta = {
      titulo: especie?.nombre_comun ?? 'Árbol',
      detalle: [institucion?.nombre_corto, zona].filter(Boolean).join(' · '),
    };
    try {
      const resultado = await registerTree.submit(values, photos, etiqueta);
      if (resultado.estado === 'en_cola') {
        setRegistered({ nombreComun: etiqueta.titulo });
        return;
      }
      const { tree, photoError, fotosEnCola } = resultado;
      setRegistered({
        id: tree.id,
        codigo: tree.codigo,
        nombreComun: tree.nombre_comun,
        fotosEnCola,
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
        fotosEnCola={registered.fotosEnCola}
        onRegisterAnother={() => {
          setRegistered(undefined);
          setFormKey((key) => key + 1);
        }}
        onViewTree={registered.id ? () => router.push(`/(app)/trees/${registered.id}` as Href) : undefined}
        onViewPending={() => router.push('/(app)/sync' as Href)}
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

const useStyles = crearEstilos(({ palette }) => ({
  state: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 12 },
  stateIcon: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: palette.redSoft },
  stateTitle: { color: palette.ink, fontSize: 16, fontFamily: fonts.bold, textAlign: 'center' },
  stateText: { color: palette.muted, fontSize: 14, textAlign: 'center' },
}));
