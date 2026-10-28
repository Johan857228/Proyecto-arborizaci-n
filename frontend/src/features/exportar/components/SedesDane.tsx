import { useState } from 'react';
import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { daneSchema, useEditarInstitucion, useInstituciones, type Institucion } from '@/features/exportar/api';
import { getApiErrorMessage } from '@/services/api/client';
import { Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Badge, Card, ErrorState, LoadingState } from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

function FilaSede({ sede, admin }: { sede: Institucion; admin: boolean }) {
  const styles = useStyles();
  const editar = useEditarInstitucion();
  const [valores, setValores] = useState({
    codigo_dane: sede.codigo_dane ?? '',
    divipola: sede.divipola ?? '',
    municipio: sede.municipio ?? '',
  });
  const [errores, setErrores] = useState<Partial<Record<keyof typeof valores, string>>>({});
  const [guardado, setGuardado] = useState(false);
  const cambio = valores.codigo_dane !== (sede.codigo_dane ?? '') || valores.divipola !== (sede.divipola ?? '') || valores.municipio !== (sede.municipio ?? '');

  function poner(campo: keyof typeof valores, valor: string) {
    setValores((v) => ({ ...v, [campo]: valor }));
    setGuardado(false);
  }

  async function guardar() {
    setGuardado(false);
    const validado = daneSchema.safeParse(valores);
    if (!validado.success) {
      setErrores(Object.fromEntries(validado.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    setErrores({});
    try {
      await editar.mutateAsync({ id: sede.id, cambios: validado.data });
      setGuardado(true);
    } catch {
      // El error se muestra con editar.error.
    }
  }

  return (
    <View style={styles.sede}>
      <View style={styles.sedeTop}>
        <Text style={styles.nombre}>{sede.nombre}</Text>
        <Badge label={sede.codigo_dane ? 'Con código DANE' : 'Sin código DANE'} tono={sede.codigo_dane ? 'sano' : 'riesgo'} />
      </View>
      <Text style={styles.meta}>Prefijo de los códigos de árbol: {sede.prefijo}</Text>
      {admin ? (
        <>
          <View style={styles.campos}>
            <View style={styles.campoAncho}>
              <Field label="Código DANE de la sede" value={valores.codigo_dane} onChangeText={(v) => poner('codigo_dane', v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={12} error={errores.codigo_dane} hint="12 dígitos, como aparece en el SIMAT." />
            </View>
            <View style={styles.campo}>
              <Field label="DIVIPOLA" value={valores.divipola} onChangeText={(v) => poner('divipola', v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={5} error={errores.divipola} />
            </View>
            <View style={styles.campo}>
              <Field label="Municipio" value={valores.municipio} onChangeText={(v) => poner('municipio', v)} maxLength={80} error={errores.municipio} />
            </View>
          </View>
          {editar.error ? <InlineMessage>{getApiErrorMessage(editar.error)}</InlineMessage> : null}
          {guardado ? <InlineMessage tone="success">Guardado.</InlineMessage> : null}
          <PrimaryButton title="Guardar" icon="check" compact disabled={!cambio} loading={editar.isPending} onPress={() => void guardar()} />
        </>
      ) : (
        <Text style={styles.meta}>
          DANE {sede.codigo_dane ?? '—'} · DIVIPOLA {sede.divipola ?? '—'}{sede.municipio ? ` · ${sede.municipio}` : ''}
        </Text>
      )}
    </View>
  );
}

/** Código DANE, DIVIPOLA y municipio de cada sede (Configuración → Sedes). */
export function SedesDane({ admin }: { admin: boolean }) {
  const styles = useStyles();
  const instituciones = useInstituciones();
  if (instituciones.isLoading) return <LoadingState />;
  if (instituciones.error) return <ErrorState error={instituciones.error} onRetry={() => void instituciones.refetch()} />;
  return (
    <Card
      title="Sedes y código DANE"
      subtitle="Con el código DANE, la Secretaría cruza los datos exportados con el SIMAT y sus reportes."
      icon="building"
    >
      <View style={styles.lista}>
        {(instituciones.data ?? []).map((sede) => <FilaSede key={sede.id} sede={sede} admin={admin} />)}
      </View>
    </Card>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  lista: { gap: 12 },
  sede: { gap: 6, padding: 12, borderRadius: 14, backgroundColor: palette.tile },
  sedeTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  nombre: { flexShrink: 1, color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  campos: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
  campoAncho: { flexGrow: 2, flexBasis: 220 },
  campo: { flexGrow: 1, flexBasis: 120 },
}));
