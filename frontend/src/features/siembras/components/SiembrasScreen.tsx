import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { InstitucionSelector, useInstitucionElegida } from '@/features/perfil/components/InstitucionSelector';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin, esRevisor, gestiona } from '@/features/perfil/schemas';
import { siembrasService, useCrearJornada, useDescargaSiembras, useJornadas, useResumenSiembras } from '@/features/siembras/api';
import { ResumenSiembras } from '@/features/siembras/components/ResumenSiembras';
import { jornadaFormSchema, ORGANIZADORES, SIGUIENTE, vacio, type Jornada, type Organizador } from '@/features/siembras/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { Casilla, ChoiceChip, Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import { AppHeader, Badge, Card, EmptyState, ErrorState, LoadingState, Page } from '@/shared/components/UI';
import { formatFecha, formatNumero, hoyIso } from '@/shared/format';
import { crearEstilos, useTema } from '@/theme';

function TarjetaJornada({ jornada }: { jornada: Jornada }) {
  const styles = useStyles();
  const { palette } = useTema();
  const r = jornada.resumen;
  const porHacer = r.controles_pendientes + r.controles_vencidos;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${jornada.nombre}, ${formatFecha(jornada.fecha)}`}
      onPress={() => router.push(`/(app)/plantings/${jornada.id}` as Href)}
      style={({ pressed }) => [styles.jornada, pressed && styles.presionado]}
    >
      <View style={styles.flex}>
        <Text style={styles.jornadaNombre}>{jornada.nombre}</Text>
        <Text style={styles.meta}>{[formatFecha(jornada.fecha), jornada.lugar, ORGANIZADORES[jornada.organizador]].filter(Boolean).join(' · ')}</Text>
        <View style={styles.insignias}>
          {jornada.oficial ? <Badge label="Oficial" tono="info" /> : null}
          <Badge label={`${formatNumero(r.sembradas, 0)} ${r.sembradas === 1 ? 'plántula' : 'plántulas'}`} tono="sano" />
          {r.supervivencia_pct != null ? <Badge label={`${formatNumero(r.supervivencia_pct, 0)} % viven`} tono={r.supervivencia_pct >= 80 ? 'sano' : 'riesgo'} /> : null}
          {porHacer ? <Badge label={`${porHacer} ${porHacer === 1 ? 'control' : 'controles'} por hacer`} tono={r.controles_vencidos ? 'critico' : 'riesgo'} /> : null}
        </View>
      </View>
      <Icon name="chevronRight" size={16} color={palette.forest} />
    </Pressable>
  );
}

function NuevaJornada({ institucionId }: { institucionId: string }) {
  const styles = useStyles();
  const crear = useCrearJornada();
  const [nombre, setNombre] = useState('');
  const [fecha, setFecha] = useState(hoyIso());
  const [lugar, setLugar] = useState('');
  const [organizador, setOrganizador] = useState<Organizador>('colegio');
  const [oficial, setOficial] = useState(false);
  const [area, setArea] = useState('');
  const [patrocinador, setPatrocinador] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});

  async function enviar() {
    const v = jornadaFormSchema.safeParse({ nombre, fecha: fecha.trim(), lugar, organizador, oficial, area_de_vida: area, patrocinador });
    if (!v.success) {
      setErrores(Object.fromEntries(v.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrores({});
    try {
      const creada = await crear.mutateAsync({
        nombre: v.data.nombre, fecha: v.data.fecha, lugar: vacio(v.data.lugar), organizador: v.data.organizador, oficial: v.data.oficial,
        area_de_vida: oficial ? vacio(v.data.area_de_vida) : null, patrocinador: vacio(v.data.patrocinador), institucion_id: institucionId,
      });
      router.push(`/(app)/plantings/${creada.id}` as Href);
    } catch {
      // El error se muestra con crear.error.
    }
  }

  return (
    <Card title="Nueva jornada de siembra" subtitle="Después registras cada plántula con el GPS en el lugar de la siembra." icon="add">
      <Field label="Nombre" value={nombre} onChangeText={setNombre} maxLength={120} placeholder="Ej.: Día del Árbol 2026" error={errores.nombre} />
      <Field label="Fecha" value={fecha} onChangeText={setFecha} placeholder="AAAA-MM-DD" autoCapitalize="none" error={errores.fecha} />
      <Field label="Lugar" value={lugar} onChangeText={setLugar} maxLength={160} placeholder="Ej.: lote junto a la cancha" error={errores.lugar} />
      <Text style={styles.etiqueta}>¿Quién organiza?</Text>
      <View style={styles.insignias}>
        {(Object.keys(ORGANIZADORES) as Organizador[]).map((o) => <ChoiceChip key={o} label={ORGANIZADORES[o]} selected={organizador === o} onPress={() => setOrganizador(o)} />)}
      </View>
      <Casilla checked={oficial} onChange={setOficial}>
        Es una jornada oficial de la alcaldía o la autoridad ambiental (cuenta para el certificado Siembra Vida Buen Ciudadano)
      </Casilla>
      {oficial ? <Field label="Área de Vida" value={area} onChangeText={setArea} maxLength={160} placeholder="Como la delimitó la alcaldía" error={errores.area_de_vida} /> : null}
      <Field label="Patrocinador (opcional)" value={patrocinador} onChangeText={setPatrocinador} maxLength={120} placeholder="Empresa que dona las plántulas o el mantenimiento" />
      {crear.error ? <InlineMessage>{getApiErrorMessage(crear.error)}</InlineMessage> : null}
      <PrimaryButton title="Crear jornada" icon="check" loading={crear.isPending} onPress={() => void enviar()} />
    </Card>
  );
}

/** Siembras con seguimiento de supervivencia: jornadas, controles por hacer y exportación. */
export function SiembrasScreen() {
  const styles = useStyles();
  const perfil = useMiPerfil();
  const admin = esAdmin(perfil.data);
  const institucion = useInstitucionElegida();
  const institucionId = institucion.institucionId;
  const listo = !perfil.isLoading;
  const jornadas = useJornadas(institucionId, listo);
  const resumen = useResumenSiembras(institucionId, listo);
  const descarga = useDescargaSiembras();
  const puedeCrear = Boolean(institucionId) && gestiona(perfil.data, institucionId);

  return (
    <Page onRefresh={() => { void jornadas.refetch(); void resumen.refetch(); }} refreshing={jornadas.isRefetching}>
      <AppHeader
        eyebrow="Ley del Árbol"
        title="Siembras"
        subtitle="Cada plántula con su especie, vivero, coordenadas y padrino, y sus controles a los 3, 6, 12 y 24 meses. Cualquier grado puede sembrar."
      />
      {admin ? <InstitucionSelector value={institucionId} onChange={institucion.setInstitucionId} /> : null}

      {resumen.data?.total.sembradas ? (
        <Card title="Supervivencia" subtitle="De todas las jornadas" icon="chart">
          <ResumenSiembras resumen={resumen.data.total} />
        </Card>
      ) : null}

      {resumen.data?.proximos.length ? (
        <Card title="Controles por hacer" subtitle="Se hacen desde 15 días antes de la fecha y vencen 30 días después. Los estudiantes también pueden registrarlos." icon="calendar">
          <View style={styles.lista}>
            {resumen.data.proximos.slice(0, 8).map((p) => (
              <Pressable
                key={`${p.siembra_id}-${p.hito_meses}`}
                accessibilityRole="link"
                onPress={() => router.push(`/(app)/plantings/${p.jornada_id}` as Href)}
                style={({ pressed }) => [styles.fila, pressed && styles.presionado]}
              >
                <View style={styles.flex}>
                  <Text style={styles.filaTitulo}>{p.especie} · control de {p.hito_meses} meses</Text>
                  <Text style={styles.meta}>{p.jornada} · {formatFecha(p.fecha)}</Text>
                </View>
                <Badge label={SIGUIENTE[p.estado].etiqueta} tono={SIGUIENTE[p.estado].tono} />
              </Pressable>
            ))}
          </View>
          {resumen.data.proximos.length > 8 ? <Text style={styles.meta}>Y {resumen.data.proximos.length - 8} más en sus jornadas.</Text> : null}
        </Card>
      ) : null}

      {jornadas.isLoading || perfil.isLoading ? (
        <LoadingState text="Cargando las jornadas…" />
      ) : jornadas.error && !jornadas.data ? (
        <ErrorState error={jornadas.error} onRetry={() => void jornadas.refetch()} />
      ) : jornadas.data?.length ? (
        <View style={styles.lista}>{jornadas.data.map((j) => <TarjetaJornada key={j.id} jornada={j} />)}</View>
      ) : (
        <EmptyState title="Aún no hay jornadas de siembra" text={puedeCrear ? 'Crea la primera abajo.' : 'Los docentes de la institución las registran.'} />
      )}

      {puedeCrear && institucionId ? <NuevaJornada institucionId={institucionId} /> : null}

      {esRevisor(perfil.data) && jornadas.data?.length ? (
        <Card title="Exportar plántulas" subtitle="Para la base de datos geográfica de la alcaldía o la CAR. Sin nombres de personas." icon="download">
          {descarga.error ? <InlineMessage>{getApiErrorMessage(descarga.error)}</InlineMessage> : null}
          {descarga.data && !descarga.isPending ? <InlineMessage tone="success">Listo: {descarga.data.nombre} ({descarga.data.filas} plántulas).</InlineMessage> : null}
          <View style={styles.botones}>
            <PrimaryButton title="GeoJSON" icon="download" variant="secondary" loading={descarga.isPending}
              onPress={() => descarga.mutate(() => siembrasService.exportar({ formato: 'geojson', institucion_id: institucionId }))} />
            <PrimaryButton title="CSV" icon="download" variant="secondary" disabled={descarga.isPending}
              onPress={() => descarga.mutate(() => siembrasService.exportar({ formato: 'csv', institucion_id: institucionId }))} />
          </View>
        </Card>
      ) : null}
    </Page>
  );
}

const useStyles = crearEstilos(({ palette, card }) => ({
  flex: { flex: 1, gap: 4 },
  lista: { gap: 10 },
  jornada: { ...card, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16 },
  presionado: { opacity: 0.8 },
  jornadaNombre: { color: palette.ink, fontSize: 16, fontFamily: fonts.bold },
  insignias: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  etiqueta: { color: palette.muted, fontSize: 12, fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 0.6 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.line },
  filaTitulo: { color: palette.ink, fontSize: 14, fontFamily: fonts.bold },
  botones: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
}));
