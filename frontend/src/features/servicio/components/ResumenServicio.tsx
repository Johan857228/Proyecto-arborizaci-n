import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useDescargarCertificado } from '@/features/servicio/api';
import { codigoLegible, horasTexto, type Actividad, type EstadoServicio, type Resumen } from '@/features/servicio/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Badge, Card, KeyValue, ProgressBar, type Tono } from '@/shared/components/UI';
import { formatFecha } from '@/shared/format';
import { crearEstilos } from '@/theme';

export const ESTADO_SERVICIO: Record<EstadoServicio, { etiqueta: string; tono: Tono }> = {
  completo: { etiqueta: 'Completó la meta', tono: 'sano' },
  al_dia: { etiqueta: 'Al día', tono: 'info' },
  atrasado: { etiqueta: 'Atrasado', tono: 'critico' },
};

const ESTADO_ACTIVIDAD: Record<Actividad['estado'], { etiqueta: string; tono: Tono }> = {
  pendiente: { etiqueta: 'Por aprobar', tono: 'riesgo' },
  aprobada: { etiqueta: 'Aprobada', tono: 'sano' },
  rechazada: { etiqueta: 'Rechazada', tono: 'critico' },
};

export function BarraHoras({ aprobadas, meta, estado }: { aprobadas: number; meta: number; estado?: EstadoServicio | null }) {
  return <ProgressBar pct={(aprobadas / meta) * 100} tono={estado ? ESTADO_SERVICIO[estado].tono : 'info'} />;
}

/** Avance del servicio social de un estudiante: horas, ritmo esperado, horas por actividad,
 *  certificado y bitácora. Lo ven el estudiante y sus docentes. */
export function ResumenServicio({ resumen, propio }: { resumen: Resumen; propio: boolean }) {
  const styles = useStyles();
  const descargar = useDescargarCertificado();
  const r = resumen;
  const faltan = Math.max(0, r.meta - r.horas_aprobadas);
  const atraso = Math.max(0, r.horas_esperadas - r.horas_aprobadas);
  const certificado = r.certificado && !r.certificado.anulado_en ? r.certificado : null;

  return (
    <>
      <Card title={propio ? 'Tu avance' : 'Avance'} subtitle={r.periodo_inicio && r.periodo_fin ? `Del ${formatFecha(r.periodo_inicio)} al ${formatFecha(r.periodo_fin)}` : undefined} icon="school">
        <View style={styles.cifra}>
          <Text style={styles.numero}>{horasTexto(r.horas_aprobadas)}</Text>
          <Text style={styles.meta}>de {horasTexto(r.meta)} horas</Text>
        </View>
        <BarraHoras aprobadas={r.horas_aprobadas} meta={r.meta} estado={r.estado} />
        <View style={styles.insignias}>
          {r.estado ? <Badge label={ESTADO_SERVICIO[r.estado].etiqueta} tono={ESTADO_SERVICIO[r.estado].tono} /> : null}
          {r.horas_pendientes > 0 ? <Badge label={`${horasTexto(r.horas_pendientes)} h por revisar`} tono="riesgo" /> : null}
          {faltan > 0 ? <Badge label={`Faltan ${horasTexto(faltan)} h`} tono="neutro" /> : null}
        </View>
        <Text style={styles.texto}>
          A esta fecha, repartiendo la meta en parejo entre 10.° y 11.°, se llevarían {horasTexto(r.horas_esperadas)} h.
        </Text>
        {r.estado === 'atrasado' ? (
          <InlineMessage tone="warning">
            {propio ? 'Vas' : 'Va'} {horasTexto(atraso)} h por debajo del ritmo. Cada inspección confirmada suma {horasTexto(r.horas_por_inspeccion)} h.
          </InlineMessage>
        ) : null}
        {r.fuera_del_tope > 0 ? (
          <Text style={styles.nota}>{horasTexto(r.fuera_del_tope)} h no cuentan porque pasan del máximo de 8 horas por día.</Text>
        ) : null}
      </Card>

      <Card title="Horas por actividad" icon="list">
        {r.por_tipo.length ? r.por_tipo.map((t) => <KeyValue key={t.tipo} label={t.etiqueta} value={`${horasTexto(t.horas)} h`} />) : (
          <Text style={styles.texto}>Aún no hay horas aprobadas.</Text>
        )}
        <Text style={styles.nota}>
          {propio ? 'Tus' : 'Sus'} inspecciones confirmadas cuentan solas: {r.inspecciones_contadas} {r.inspecciones_contadas === 1 ? 'inspección' : 'inspecciones'} × {horasTexto(r.horas_por_inspeccion)} h (una por árbol y día).
        </Text>
      </Card>

      {certificado ? (
        <Card title="Certificado" subtitle={`Emitido el ${formatFecha(certificado.emitido_en)}`} icon="review">
          <KeyValue label="Código de verificación" value={codigoLegible(certificado.codigo)} />
          <KeyValue label="Horas certificadas" value={`${horasTexto(certificado.horas)} h`} />
          <KeyValue label="Firma" value={`${certificado.firmante_nombre}, ${certificado.firmante_cargo}`} />
          {descargar.error ? <InlineMessage>{getApiErrorMessage(descargar.error)}</InlineMessage> : null}
          <PrimaryButton title="Descargar PDF" icon="download" loading={descargar.isPending} onPress={() => descargar.mutate(certificado.id)} />
        </Card>
      ) : null}

      <Card title="Bitácora" subtitle="Actividades registradas además de las inspecciones." icon="calendar">
        {r.actividades.length ? (
          <View style={styles.lista}>
            {r.actividades.map((a) => (
              <View key={a.id} style={styles.actividad}>
                {a.foto_url ? <Image source={{ uri: a.foto_url }} style={styles.foto} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
                <View style={styles.actividadTexto}>
                  <Text style={styles.titulo}>{a.etiqueta} · {horasTexto(a.horas)} h</Text>
                  <Text style={styles.meta}>{formatFecha(a.fecha)}</Text>
                  <Text style={styles.texto} numberOfLines={3}>{a.descripcion}</Text>
                  <View style={styles.insignias}>
                    <Badge label={ESTADO_ACTIVIDAD[a.estado].etiqueta} tono={ESTADO_ACTIVIDAD[a.estado].tono} />
                    {!a.foto_url && a.estado === 'pendiente' ? <Badge label="Falta la foto" tono="riesgo" /> : null}
                  </View>
                  {a.comentario ? <Text style={styles.nota}>Docente: {a.comentario}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.texto}>{propio ? 'Aún no registras actividades.' : 'Aún no registra actividades.'}</Text>
        )}
      </Card>
    </>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  cifra: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  numero: { color: palette.forest, fontSize: 40, fontFamily: fonts.extraBold, letterSpacing: -1 },
  meta: { color: palette.muted, fontSize: 14 },
  insignias: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  texto: { color: palette.ink, fontSize: 14, lineHeight: 20 },
  nota: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  lista: { gap: 12 },
  actividad: { flexDirection: 'row', gap: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.line },
  foto: { width: 64, height: 64, borderRadius: 12, backgroundColor: palette.line },
  actividadTexto: { flex: 1, minWidth: 0, gap: 3 },
  titulo: { color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
}));
