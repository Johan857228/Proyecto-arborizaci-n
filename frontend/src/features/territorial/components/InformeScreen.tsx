import { useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useArchivoInforme, useGuardarInforme, useInforme, useTerritorios } from '@/features/territorial/api';
import { AYUDAS, SECCIONES } from '@/features/territorial/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { ChoiceChip, Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { AppHeader, Card, ErrorState, LoadingState, Notice, Page } from '@/shared/components/UI';
import { formatFechaHora } from '@/shared/format';
import { crearEstilos } from '@/theme';

/** Informe anual de los PRAE del territorio: la Secretaría escribe los textos y la app pone las
 *  cifras al descargar (PDF para firmar, Word para seguir editando). */
export function InformeScreen() {
  const styles = useStyles();
  const params = useLocalSearchParams<{ territorio?: string; anio?: string }>();
  const territorioId = params.territorio;
  const anio = Number(params.anio) || new Date().getFullYear();
  const territorios = useTerritorios();
  const informe = useInforme(territorioId, anio);
  const guardar = useGuardarInforme();
  const archivo = useArchivoInforme();
  const [textos, setTextos] = useState<Record<string, string> | null>(null);
  const [estado, setEstado] = useState<'borrador' | 'final' | null>(null);

  const nombre = territorios.data?.find((t) => t.id === territorioId)?.nombre ?? 'Territorio';
  const actuales = textos ?? informe.data?.secciones ?? {};
  const estadoActual = estado ?? informe.data?.estado ?? 'borrador';
  const cambios = textos !== null || estado !== null;

  async function enviar() {
    if (!territorioId) return;
    try {
      await guardar.mutateAsync({ territorio_id: territorioId, anio, secciones: actuales, estado: estadoActual });
      setTextos(null);
      setEstado(null);
    } catch {
      // El error se muestra con guardar.error.
    }
  }

  return (
    <Page>
      <AppHeader
        eyebrow={`Informe anual ${anio}`}
        title={nombre}
        subtitle="Avances de los PRAE con las acciones de reforestación y de cambio climático (Ley 2173 de 2021, art. 12)."
        backTo={'/(app)/territorial' as Href}
      />
      <Notice tono="info">
        Las cifras de cada colegio se calculan al descargar. Aquí escribes lo que las cifras no cuentan. El formato que pide el MEN está por confirmar: descarga en Word para ajustarlo.
      </Notice>

      {!territorioId ? (
        <ErrorState error={new Error('Falta el territorio')} />
      ) : informe.isLoading ? (
        <LoadingState text="Cargando el informe…" />
      ) : informe.error && !informe.data ? (
        <ErrorState error={informe.error} onRetry={() => void informe.refetch()} />
      ) : informe.data ? (
        <>
          <Card title="Textos del informe" subtitle={informe.data.actualizado_en ? `Guardado el ${formatFechaHora(informe.data.actualizado_en)}` : 'Aún sin guardar'} icon="edit">
            {SECCIONES.map((clave) => (
              <Field
                key={clave}
                label={informe.data?.titulos[clave] ?? clave}
                value={actuales[clave] ?? ''}
                onChangeText={(v) => setTextos({ ...actuales, [clave]: v })}
                multiline
                maxLength={6000}
                hint={AYUDAS[clave]}
              />
            ))}
            <View style={styles.chips}>
              <ChoiceChip label="Borrador" selected={estadoActual === 'borrador'} onPress={() => setEstado('borrador')} />
              <ChoiceChip label="Versión final" selected={estadoActual === 'final'} onPress={() => setEstado('final')} />
            </View>
            {guardar.error ? <InlineMessage>{getApiErrorMessage(guardar.error)}</InlineMessage> : null}
            {guardar.isSuccess && !cambios ? <InlineMessage tone="success">Textos guardados.</InlineMessage> : null}
            <PrimaryButton title="Guardar textos" icon="check" loading={guardar.isPending} disabled={!cambios} onPress={() => void enviar()} />
          </Card>

          <Card title="Descargar" subtitle="Con las cifras del año y los textos guardados." icon="download">
            {cambios ? <Text style={styles.aviso}>Tienes cambios sin guardar: guárdalos para que salgan en el archivo.</Text> : null}
            {archivo.error ? <InlineMessage>{getApiErrorMessage(archivo.error)}</InlineMessage> : null}
            {archivo.data && !archivo.isPending ? <InlineMessage tone="success">Listo: {archivo.data.nombre}.</InlineMessage> : null}
            <View style={styles.chips}>
              <PrimaryButton title="PDF para firmar" icon="download" loading={archivo.isPending}
                onPress={() => archivo.mutate({ territorio_id: territorioId, anio, formato: 'pdf' })} />
              <PrimaryButton title="Word para editar" icon="download" variant="secondary" disabled={archivo.isPending}
                onPress={() => archivo.mutate({ territorio_id: territorioId, anio, formato: 'docx' })} />
            </View>
          </Card>
        </>
      ) : null}
    </Page>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  aviso: { color: palette.amber, fontSize: 13, lineHeight: 18 },
}));
