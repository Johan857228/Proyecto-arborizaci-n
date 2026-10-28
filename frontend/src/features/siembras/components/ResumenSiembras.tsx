import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import type { ResumenSiembras as Resumen } from '@/features/siembras/schemas';
import { formatNumero } from '@/shared/format';
import { ProgressBar, StatGrid, StatTile } from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

const pct = (v: number | null) => (v == null ? '—' : `${formatNumero(v, v % 1 ? 1 : 0)} %`);

/** Totales de un grupo de plántulas y la supervivencia a cada edad (cohortes de 3, 6, 12 y 24 meses). */
export function ResumenSiembras({ resumen }: { resumen: Resumen }) {
  const styles = useStyles();
  const porHacer = resumen.controles_pendientes + resumen.controles_vencidos;
  return (
    <View style={styles.cuerpo}>
      <StatGrid>
        <StatTile label="Plántulas" value={formatNumero(resumen.sembradas, 0)} hint={`${resumen.evaluadas} con al menos un control`} icon="siembra" />
        <StatTile
          label="Supervivencia"
          value={pct(resumen.supervivencia_pct)}
          hint={`${resumen.vivas} vivas · ${resumen.muertas} muertas`}
          icon="checkCircle"
          tono={resumen.supervivencia_pct == null ? 'neutro' : resumen.supervivencia_pct >= 80 ? 'sano' : resumen.supervivencia_pct >= 60 ? 'riesgo' : 'critico'}
        />
        <StatTile label="Nativas" value={pct(resumen.pct_nativas)} hint="La Resolución 1491 pide especies nativas" icon="leaf" tono="info" />
        <StatTile
          label="Controles por hacer"
          value={formatNumero(porHacer, 0)}
          hint={resumen.controles_vencidos ? `${resumen.controles_vencidos} vencidos` : 'Ninguno vencido'}
          icon="calendar"
          tono={resumen.controles_vencidos ? 'critico' : porHacer ? 'riesgo' : 'neutro'}
        />
      </StatGrid>
      <Text style={styles.titulo}>Supervivencia por edad</Text>
      {resumen.por_hito.map((h) => (
        <View key={h.hito_meses} style={styles.hito}>
          <Text style={styles.hitoNombre}>{h.hito_meses} meses</Text>
          <View style={styles.hitoBarra}>
            {h.debidas ? <ProgressBar pct={h.supervivencia_pct} tono={h.supervivencia_pct != null && h.supervivencia_pct < 60 ? 'critico' : 'sano'} /> : null}
            <Text style={styles.meta}>
              {h.debidas
                ? `${pct(h.supervivencia_pct)} · ${h.vivas} de ${h.conocidas} plántulas${h.pendientes ? ` · ${h.pendientes} sin control` : ''}`
                : 'Aún ninguna plántula tiene esta edad'}
            </Text>
          </View>
        </View>
      ))}
      {resumen.completaron_2_anios ? (
        <Text style={styles.meta}>{resumen.completaron_2_anios} {resumen.completaron_2_anios === 1 ? 'plántula cumplió' : 'plántulas cumplieron'} los 2 años de seguimiento vivas.</Text>
      ) : null}
    </View>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  cuerpo: { gap: 12 },
  titulo: { color: palette.muted, fontSize: 12, fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 0.6 },
  hito: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hitoNombre: { width: 70, color: palette.ink, fontSize: 14, fontFamily: fonts.bold },
  hitoBarra: { flex: 1, gap: 4 },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
}));
