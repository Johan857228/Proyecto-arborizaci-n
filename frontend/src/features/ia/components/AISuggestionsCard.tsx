import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fonts, gradients, palette } from '@/config/constants';
import type { Catalogos } from '@/features/catalogs/types';
import { useAnalizarFotos, useEstadoIA } from '@/features/ia/hooks';
import type { Confianza } from '@/features/ia/schemas';
import { sugerenciasDeAnalisis, type SugerenciaIA } from '@/features/ia/sugerencias';
import type { ArbolFormInput } from '@/features/trees/schemas';
import type { FotoLocal } from '@/features/trees/types';
import { getApiErrorMessage } from '@/services/api/client';
import { InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import { gradient } from '@/shared/styles/gradient';

const confianzas: Record<Confianza, { label: string; color: string; background: string }> = {
  alta: { label: 'Confianza alta', color: palette.forest, background: palette.forestSoft },
  media: { label: 'Confianza media', color: palette.amber, background: palette.amberSoft },
  baja: { label: 'Confianza baja', color: palette.muted, background: palette.line },
};

/** Tarjeta "Identificación con IA" del registro: analiza las fotos y muestra sugerencias que
 *  la persona aplica una a una (o todas). Nada se guarda sin que la persona lo confirme. */
export function AISuggestionsCard({
  catalogs,
  fotoGeneral,
  fotoDetalle,
  onApply,
}: {
  catalogs: Catalogos;
  fotoGeneral?: FotoLocal;
  fotoDetalle?: FotoLocal;
  onApply: (valores: Partial<ArbolFormInput>) => void;
}) {
  const estado = useEstadoIA();
  const analisis = useAnalizarFotos();
  const [aplicadas, setAplicadas] = useState<ReadonlySet<string>>(new Set());
  const sugerencias = useMemo(
    () => (analisis.data ? sugerenciasDeAnalisis(analisis.data, catalogs) : []),
    [analisis.data, catalogs],
  );
  const pendientes = sugerencias.filter((sugerencia) => sugerencia.valores && !aplicadas.has(sugerencia.id));
  const disponible = estado.data?.disponible === true;

  function analizar() {
    if (!fotoGeneral) return;
    setAplicadas(new Set());
    analisis.mutate({ general: fotoGeneral, detalle: fotoDetalle });
  }

  function aplicar(sugerencia: SugerenciaIA) {
    if (!sugerencia.valores) return;
    onApply(sugerencia.valores);
    setAplicadas((actuales) => new Set(actuales).add(sugerencia.id));
  }

  function aplicarTodas() {
    for (const sugerencia of pendientes) {
      if (sugerencia.valores) onApply(sugerencia.valores);
    }
    setAplicadas(new Set(sugerencias.map((sugerencia) => sugerencia.id)));
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, gradient(gradients.canopy)]}>
          <Icon name="sparkle" size={20} color={palette.leaf} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Identificación con IA</Text>
          <Text style={styles.caption}>
            Sugiere especie, etapa, interferencias y estado fitosanitario a partir de las fotos. Tú decides qué aplicar.
          </Text>
        </View>
      </View>

      {!estado.isPending && !disponible ? (
        <InlineMessage tone="info">
          La identificación con IA aún no está activada en el servidor. Pide al equipo que configure la clave de Anthropic.
        </InlineMessage>
      ) : null}

      <PrimaryButton
        title={analisis.data ? 'Analizar de nuevo' : 'Analizar con IA'}
        icon="sparkle"
        variant={analisis.data ? 'secondary' : 'primary'}
        loading={analisis.isPending}
        disabled={!fotoGeneral || !disponible}
        onPress={analizar}
      />
      {!fotoGeneral ? <Text style={styles.caption}>Agrega la foto general para analizarla. La de detalle ayuda con plagas y enfermedades.</Text> : null}
      {analisis.isPending ? (
        <Text style={styles.caption}>Analizando {fotoDetalle ? 'las fotos' : 'la foto'}… puede tardar hasta un minuto.</Text>
      ) : null}
      {analisis.error ? <InlineMessage>{getApiErrorMessage(analisis.error)}</InlineMessage> : null}

      {analisis.data ? (
        <View style={styles.results}>
          <Text style={styles.summary}>{analisis.data.resumen}</Text>
          {!analisis.data.es_arbol ? (
            <InlineMessage tone="warning">Las fotos no parecen mostrar un árbol. Toma otra foto general.</InlineMessage>
          ) : null}
          {analisis.data.es_arbol && analisis.data.calidad_foto === 'mala' ? (
            <InlineMessage tone="warning">
              La foto no es muy clara y las sugerencias pueden fallar. Si puedes, toma otra con buena luz.
            </InlineMessage>
          ) : null}
          {analisis.data.es_arbol && sugerencias.length === 0 ? (
            <Text style={styles.caption}>La IA no encontró nada que sugerir con estas fotos.</Text>
          ) : null}
          {sugerencias.map((sugerencia) => (
            <SuggestionRow
              key={sugerencia.id}
              sugerencia={sugerencia}
              aplicada={aplicadas.has(sugerencia.id)}
              onApply={() => aplicar(sugerencia)}
            />
          ))}
          {pendientes.length > 1 ? (
            <PrimaryButton title={`Aplicar todas (${pendientes.length})`} icon="check" variant="secondary" onPress={aplicarTodas} />
          ) : null}
          <Text style={styles.disclaimer}>
            La IA puede equivocarse: revisa cada dato antes de guardar. No estima medidas; tómalas en campo.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function SuggestionRow({ sugerencia, aplicada, onApply }: { sugerencia: SugerenciaIA; aplicada: boolean; onApply: () => void }) {
  const confianza = confianzas[sugerencia.confianza];
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <View style={styles.rowTop}>
          <Text style={styles.rowLabel}>{sugerencia.campo}</Text>
          <View style={[styles.badge, { backgroundColor: confianza.background }]}>
            <Text style={[styles.badgeText, { color: confianza.color }]}>{confianza.label}</Text>
          </View>
        </View>
        <Text style={styles.rowValue}>{sugerencia.valor}</Text>
        {sugerencia.razon ? <Text style={styles.caption}>{sugerencia.razon}</Text> : null}
      </View>
      {sugerencia.valores ? (
        aplicada ? (
          <View style={styles.applied} accessibilityLabel={`${sugerencia.campo}: sugerencia aplicada`}>
            <Icon name="check" size={16} color={palette.forest} />
            <Text style={styles.appliedText}>Aplicada</Text>
          </View>
        ) : (
          <PrimaryButton title="Aplicar" variant="ghost" compact onPress={onApply} />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CFE3C6',
    backgroundColor: '#F3F8EE',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0, gap: 3 },
  title: { color: palette.ink, fontSize: 16, fontFamily: fonts.extraBold },
  caption: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  results: { gap: 10 },
  summary: { color: palette.ink, fontSize: 14, lineHeight: 21 },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paper,
  },
  rowText: { flexGrow: 1, flexBasis: 220, minWidth: 0, gap: 4 },
  rowTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  rowLabel: { color: palette.muted, fontSize: 12, fontFamily: fonts.semiBold, textTransform: 'uppercase', letterSpacing: 0.4 },
  rowValue: { color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  badge: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999 },
  badgeText: { fontSize: 11, fontFamily: fonts.bold },
  applied: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  appliedText: { color: palette.forest, fontSize: 13, fontFamily: fonts.bold },
  disclaimer: { color: palette.muted, fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
});
