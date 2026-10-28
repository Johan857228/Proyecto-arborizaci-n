import { useState } from 'react';
import { Image, Text, View } from 'react-native';

import { useCatalogs } from '@/features/catalogs/hooks/useCatalogs';
import { formatUsd, useProbarIA } from '@/features/ia/precision';
import { usePhotoPicker } from '@/features/trees/hooks/usePhotoPicker';
import { getApiErrorMessage } from '@/services/api/client';
import { InlineMessage, PrimaryButton, SelectField } from '@/shared/components/FormControls';
import { Card } from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

/** Prueba a ciegas: el administrador sube la foto de un árbol cuya especie conoce (idealmente
 *  confirmada por un botánico) y la IA la analiza sin saberlo. Entra en la medición. */
export function PruebaCiega() {
  const styles = useStyles();
  const catalogos = useCatalogs();
  const fotos = usePhotoPicker();
  const probar = useProbarIA();
  const [especie, setEspecie] = useState<number>();
  const foto = fotos.photos.find((f) => f.tipo === 'completo');
  const especies = catalogos.data?.especies ?? [];
  const nombre = (id: number | null | undefined) => especies.find((e) => e.id === id)?.nombre_comun;
  const r = probar.data;

  return (
    <Card title="Prueba a ciegas" subtitle="Foto de un árbol cuya especie ya conoces: la IA no sabe cuál es. Sirve para medir la precisión con especies del bosque seco antes de que haya registros confirmados." icon="sparkle">
      <SelectField<number>
        label="Especie que muestra la foto"
        value={especie}
        placeholder="Elige la especie"
        options={especies.map((e) => ({ label: `${e.nombre_comun} (${e.nombre_cientifico})`, value: e.id }))}
        onChange={(v) => { setEspecie(v); probar.reset(); }}
      />
      <View style={styles.fila}>
        {foto ? <Image source={{ uri: foto.uri }} style={styles.miniatura} accessibilityLabel="Foto elegida" /> : null}
        <PrimaryButton title={foto ? 'Cambiar foto' : 'Elegir foto'} icon="addPhoto" variant="secondary" compact
          onPress={() => { probar.reset(); void fotos.pickPhoto('completo'); }} />
      </View>
      {fotos.photoError ? <InlineMessage>{fotos.photoError}</InlineMessage> : null}
      <PrimaryButton title="Analizar a ciegas" icon="sparkle" loading={probar.isPending} disabled={!foto || !especie}
        onPress={() => foto && especie && probar.mutate({ especieId: especie, foto })} />
      {probar.isPending ? <Text style={styles.meta}>Analizando… puede tardar hasta un minuto.</Text> : null}
      {probar.error ? <InlineMessage>{getApiErrorMessage(probar.error)}</InlineMessage> : null}
      {r ? (
        <InlineMessage tone={r.acierto ? 'success' : 'warning'}>
          {r.acierto
            ? `Acertó: ${nombre(r.especie_real_id)} (confianza ${r.confianza}).`
            : `No acertó: sugirió ${nombre(r.especie_sugerida_id) ?? r.nombre_probable ?? 'ninguna especie'} (confianza ${r.confianza}); era ${nombre(r.especie_real_id)}.`}
          {` ${r.razon} Costo: ${formatUsd(r.costo_usd)}.`}
        </InlineMessage>
      ) : null}
    </Card>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  miniatura: { width: 56, height: 56, borderRadius: 10, backgroundColor: palette.tile },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
}));
