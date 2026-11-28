import { useState } from 'react';
import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useExportar, type Formato } from '@/features/exportar/api';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esRevisor } from '@/features/perfil/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Card, IconChip } from '@/shared/components/UI';
import { abrirDescarga } from '@/shared/utils/descarga';
import { crearEstilos } from '@/theme';

const OPCIONES: { formato: Formato; titulo: string }[] = [
  { formato: 'pdf', titulo: 'PDF' },
  { formato: 'xlsx', titulo: 'Excel' },
  { formato: 'pbit', titulo: 'Power BI' },
];

/** Botones para bajar el informe del arbolado (PDF o Excel) o la plantilla de Power BI con los
 *  datos de este momento. Solo docentes y administradores, igual que Exportar datos.
 *  `compacto` es la versión del tablero de inicio, con el mismo marco de sus paneles. */
export function DescargarInforme({ institucionId, compacto = false }: { institucionId?: string; compacto?: boolean }) {
  const styles = useStyles();
  const perfil = useMiPerfil();
  const exportar = useExportar();
  const [enCurso, setEnCurso] = useState<Formato>();
  if (!esRevisor(perfil.data)) return null;

  async function descargar(formato: Formato) {
    setEnCurso(formato);
    try {
      const resultado = await exportar.mutateAsync({ conjunto: 'todo', formato, institucionId });
      await abrirDescarga(resultado.url);
    } catch {
      // El error se muestra con exportar.error.
    } finally {
      setEnCurso(undefined);
    }
  }

  const texto = compacto
    ? 'Indicadores, gráficos e inventario con los datos de hoy, listos para imprimir o enviar.'
    : 'Indicadores, gráficos, árboles prioritarios e inventario completo con las mismas cifras de esta pantalla. El Excel trae una hoja con filtros por cada tabla; la plantilla de Power BI se abre con doble clic en Power BI Desktop.';

  const contenido = (
    <>
      <Text style={compacto ? styles.textoCompacto : styles.texto}>{texto}</Text>
      {exportar.error ? <InlineMessage>{getApiErrorMessage(exportar.error)}</InlineMessage> : null}
      {exportar.data && !exportar.isPending && !exportar.error ? (
        <InlineMessage tone="success">Listo: {exportar.data.nombre}. Si la descarga no empezó, toca el botón otra vez.</InlineMessage>
      ) : null}
      <View style={styles.botones}>
        {OPCIONES.map(({ formato, titulo }) => (
          <PrimaryButton
            key={formato}
            title={titulo}
            icon="download"
            compact
            variant={formato === 'pdf' ? 'primary' : 'secondary'}
            loading={enCurso === formato}
            disabled={Boolean(enCurso) && enCurso !== formato}
            onPress={() => void descargar(formato)}
          />
        ))}
      </View>
    </>
  );

  if (!compacto) return <Card title="Descargar informe" icon="download">{contenido}</Card>;
  return (
    <View style={styles.panel}>
      <View style={styles.encabezado}>
        <IconChip icon="download" size={26} />
        <Text style={styles.titulo} numberOfLines={1}>Descargar informe</Text>
      </View>
      {contenido}
    </View>
  );
}

const useStyles = crearEstilos(({ palette, card }) => ({
  texto: { color: palette.ink, fontSize: 14, lineHeight: 20 },
  textoCompacto: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  botones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  panel: { gap: 10, padding: 14, ...card, borderRadius: 18 },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { flex: 1, color: palette.ink, fontSize: 14, fontFamily: fonts.bold },
}));
