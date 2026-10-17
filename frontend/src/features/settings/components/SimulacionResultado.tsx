import { router, type Href } from 'expo-router';
import { Text, View } from 'react-native';

import type { Simulacion } from '@/features/settings/api';
import { StatGrid, StatTile, StateBadge } from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

const ESTADOS = [['sano', 'Sanos'], ['riesgo', 'En riesgo'], ['critico', 'Críticos']] as const;

export function SimulacionResultado({ simulacion }: { simulacion: Simulacion }) {
  const styles = useStyles();
  return (
    <View style={styles.box}>
      <Text style={styles.titulo}>
        {simulacion.arboles_evaluados} árboles evaluados con su última inspección · {simulacion.cambian} cambiarían de estado
      </Text>
      <StatGrid>
        {ESTADOS.map(([clave, label]) => (
          <StatTile
            key={clave}
            label={label}
            value={simulacion.simulado[clave] ?? 0}
            hint={`hoy ${simulacion.actual[clave] ?? 0}`}
            tono={clave}
          />
        ))}
      </StatGrid>
      {simulacion.cambios.slice(0, 15).map((c) => (
        <View key={c.arbol_id} style={styles.fila}>
          <Text style={[styles.link, styles.flex]} accessibilityRole="link" onPress={() => router.push(`/(app)/trees/${c.arbol_id}` as Href)}>
            {c.codigo} · {c.nombre_comun}
          </Text>
          <StateBadge estado={c.estado_actual} />
          <Text style={styles.flecha}>→</Text>
          <StateBadge estado={c.estado_simulado} />
        </View>
      ))}
      {simulacion.cambios.length > 15 ? <Text style={styles.texto}>y {simulacion.cambios.length - 15} más.</Text> : null}
    </View>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  box: { gap: 8 },
  titulo: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  link: { color: palette.forest, fontSize: 13, fontWeight: '800' },
  flex: { flex: 1 },
  flecha: { color: palette.muted },
  texto: { color: palette.muted, fontSize: 12 },
}));
