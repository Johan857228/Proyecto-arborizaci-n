import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { palette } from '@/config/constants';
import { useCatalogs } from '@/features/catalogs/hooks/useCatalogs';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { SelectField } from '@/shared/components/FormControls';

const TODAS = '__todas__';

/** Institución con la que trabaja la pantalla. Empieza con la del perfil; quien no sea
 *  administrador queda fijo en la suya cuando `soloPropiaSiNoAdmin` es verdadero. */
export function useInstitucionElegida({ soloPropiaSiNoAdmin = false } = {}) {
  const perfil = useMiPerfil();
  // null = la persona todavía no eligió; undefined = eligió "todas"
  const [elegida, setElegida] = useState<string | undefined | null>(null);
  const propia = perfil.data?.institucion_id ?? undefined;
  const bloqueada = soloPropiaSiNoAdmin && perfil.data?.rol !== 'administrador';
  const institucionId = bloqueada || elegida === null ? propia : elegida;
  return {
    institucionId,
    setInstitucionId: (valor: string | undefined) => setElegida(valor),
    bloqueada,
    cargando: perfil.isLoading,
  };
}

export function InstitucionSelector({
  value,
  onChange,
  permitirTodas = true,
  disabled = false,
  label = 'Institución',
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  permitirTodas?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const catalogos = useCatalogs();
  const instituciones = catalogos.data?.instituciones ?? [];
  if (disabled) {
    const actual = instituciones.find((i) => i.id === value);
    return (
      <View style={styles.fijo}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.valor}>{actual?.nombre ?? 'Sin institución asignada'}</Text>
      </View>
    );
  }
  return (
    <SelectField
      label={label}
      value={value ?? (permitirTodas ? TODAS : undefined)}
      placeholder="Selecciona la institución"
      options={[
        ...(permitirTodas ? [{ label: 'Todas las instituciones', value: TODAS }] : []),
        ...instituciones.map((i) => ({ label: i.nombre, value: i.id })),
      ]}
      onChange={(v) => onChange(v === TODAS ? undefined : v)}
    />
  );
}

const styles = StyleSheet.create({
  fijo: { gap: 4, marginBottom: 14 },
  label: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  valor: { color: palette.muted, fontSize: 15 },
});
