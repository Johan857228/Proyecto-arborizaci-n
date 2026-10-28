import { Text } from 'react-native';

import { useIndicadoresPrae, useInformePrae } from '@/features/prae/api';
import type { Prae } from '@/features/prae/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Card, ErrorState, LoadingState, StatGrid, StatTile } from '@/shared/components/UI';
import { formatFecha, formatNumero } from '@/shared/format';
import { crearEstilos } from '@/theme';

const n = (valor: number | null | undefined) => (valor == null ? '—' : formatNumero(valor, 0));

/** Datos del año que entran al informe y descarga del informe anual en PDF. */
export function InformeTab({ prae }: { prae: Prae }) {
  const styles = useStyles();
  const indicadores = useIndicadoresPrae(prae.id);
  const informe = useInformePrae();
  const i = indicadores.data;
  return (
    <>
      <Card title="Informe anual" subtitle="Para el consejo directivo y la Secretaría de Educación." icon="download">
        <Text style={styles.texto}>
          Reúne el proyecto, el plan de acción con su avance, las evidencias, los indicadores del arbolado, del servicio social y de las clases con guías del año y las evaluaciones, con espacio para las firmas.
        </Text>
        {informe.error ? <InlineMessage>{getApiErrorMessage(informe.error)}</InlineMessage> : null}
        {informe.data && !informe.isPending ? <InlineMessage tone="success">Listo: {informe.data.nombre}. Si no se descargó, vuelve a tocar el botón.</InlineMessage> : null}
        <PrimaryButton title="Descargar informe (PDF)" icon="download" loading={informe.isPending} onPress={() => informe.mutate(prae.id)} />
      </Card>

      <Card title="Datos del año" subtitle={i ? `Del ${formatFecha(i.periodo.desde)} al ${formatFecha(i.periodo.hasta)}` : undefined} icon="chart">
        {indicadores.isLoading ? (
          <LoadingState />
        ) : indicadores.error || !i ? (
          <ErrorState error={indicadores.error} onRetry={() => void indicadores.refetch()} />
        ) : (
          <>
            <StatGrid>
              <StatTile label="Árboles" value={n(i.arbolado.total_arboles)} hint={`${n(i.arbolado.registrados_periodo)} nuevos en el año`} icon="tree" tono="sano" />
              <StatTile label="Inspecciones" value={n(i.arbolado.inspecciones_periodo)} hint={`${n(i.arbolado.participantes)} personas participaron`} icon="review" tono="info" />
              <StatTile label="Cobertura" value={i.arbolado.cobertura_pct == null ? '—' : `${formatNumero(i.arbolado.cobertura_pct, 1)} %`} hint="árboles inspeccionados" icon="calendar" tono="info" />
              <StatTile label="En riesgo o críticos" value={i.arbolado.pct_riesgo_o_critico == null ? '—' : `${formatNumero(i.arbolado.pct_riesgo_o_critico, 1)} %`} icon="warning" tono="riesgo" />
              {i.alertas ? <StatTile label="Alertas de caída" value={n(i.alertas.total)} hint={`${n(i.alertas.atendidas)} atendidas`} icon="warning" tono="critico" /> : null}
              {i.siembras ? <StatTile label="Siembras" value={n(i.siembras.sembradas)} hint={`${n(i.siembras.jornadas)} jornadas${i.siembras.supervivencia_pct != null ? ` · ${formatNumero(i.siembras.supervivencia_pct, 0)} % viven` : ''}`} icon="siembra" tono="sano" /> : null}
              {i.pedagogia ? <StatTile label="Clases con guías" value={n(i.pedagogia.clases)} hint={`${n(i.pedagogia.guias)} guías distintas · ${n(i.pedagogia.asistentes)} asistentes`} icon="guia" tono="info" /> : null}
              {i.servicio_social ? <StatTile label="Servicio social" value={`${n(i.servicio_social.horas_aprobadas)} h`} hint={`${n(i.servicio_social.estudiantes)} estudiantes · ${n(i.servicio_social.completaron)} completaron`} icon="school" tono="sano" /> : null}
            </StatGrid>
            <Text style={styles.nota}>Datos del módulo de arbolado de la app. El CO2 y demás cálculos ambientales son estimaciones.</Text>
          </>
        )}
      </Card>
    </>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  texto: { color: palette.ink, fontSize: 14, lineHeight: 20 },
  nota: { color: palette.muted, fontSize: 12, lineHeight: 17 },
}));
