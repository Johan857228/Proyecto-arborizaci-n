import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { InstitucionSelector, useInstitucionElegida } from '@/features/perfil/components/InstitucionSelector';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin } from '@/features/perfil/schemas';
import { useBorrarClase, useClases, useGuias } from '@/features/guias/api';
import { AREAS, textoGrados, type Area, type Clase, type GuiaResumen } from '@/features/guias/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { ChoiceChip, InlineMessage } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import { AppHeader, Badge, Card, ConfirmButton, EmptyState, ErrorState, IconChip, LoadingState, Notice, Page } from '@/shared/components/UI';
import { formatFecha } from '@/shared/format';
import { crearEstilos, useTema } from '@/theme';

function TarjetaGuia({ guia }: { guia: GuiaResumen }) {
  const styles = useStyles();
  const { palette } = useTema();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${guia.titulo}, ${textoGrados(guia.grados)}`}
      onPress={() => router.push(`/(app)/guides/${guia.id}` as Href)}
      style={({ pressed }) => [styles.guia, pressed && styles.presionado]}
    >
      <IconChip icon={guia.area === 'matematicas' ? 'laboratorio' : 'leaf'} tono={guia.area === 'matematicas' ? 'info' : 'sano'} size={40} />
      <View style={styles.flex}>
        <Text style={styles.guiaTitulo}>{guia.titulo}</Text>
        <View style={styles.insignias}>
          <Badge label={textoGrados(guia.grados)} tono="sano" />
          <Badge label={AREAS[guia.area]} tono={guia.area === 'matematicas' ? 'info' : 'neutro'} />
          <Badge label={`${guia.duracion_min} min`} tono="neutro" />
          {guia.aplicaciones ? <Badge label={`Dictada ${guia.aplicaciones} ${guia.aplicaciones === 1 ? 'vez' : 'veces'}`} tono="info" /> : null}
        </View>
        <Text style={styles.referente} numberOfLines={2}>{guia.referente}</Text>
      </View>
      <Icon name="chevronRight" size={16} color={palette.forest} />
    </Pressable>
  );
}

export function FilaClase({ clase, mostrarGuia = true }: { clase: Clase; mostrarGuia?: boolean }) {
  const styles = useStyles();
  const borrar = useBorrarClase();
  return (
    <View style={styles.clase}>
      <View style={styles.flex}>
        <Text style={styles.claseTitulo}>{formatFecha(clase.fecha)}{mostrarGuia ? ` · ${clase.guia_titulo}` : ''}</Text>
        <Text style={styles.meta}>
          {[clase.curso_nombre ? `Curso ${clase.curso_nombre}` : null, clase.asistentes ? `${clase.asistentes} estudiantes` : null, clase.docente_nombre]
            .filter(Boolean).join(' · ') || 'Sin detalles'}
        </Text>
        {clase.notas ? <Text style={styles.nota}>{clase.notas}</Text> : null}
        {borrar.error ? <InlineMessage>{getApiErrorMessage(borrar.error)}</InlineMessage> : null}
      </View>
      {clase.puede_borrar ? <ConfirmButton title="Quitar" confirmTitle="¿Quitar esta clase de la bitácora?" loading={borrar.isPending} onConfirm={() => borrar.mutate(clase.id)} /> : null}
    </View>
  );
}

/** Guías de clase por grado con los árboles del colegio y la bitácora de clases dictadas. */
export function GuiasScreen() {
  const styles = useStyles();
  const perfil = useMiPerfil();
  const admin = esAdmin(perfil.data);
  const institucion = useInstitucionElegida();
  const institucionId = institucion.institucionId;
  const listo = !perfil.isLoading;
  const guias = useGuias(institucionId, listo);
  const clases = useClases(institucionId, listo && Boolean(institucionId));
  const [area, setArea] = useState<Area | undefined>();
  const [grado, setGrado] = useState<number | undefined>();

  const todas = guias.data ?? [];
  const grados = [...new Set(todas.flatMap((g) => g.grados))].sort((a, b) => a - b);
  const visibles = todas.filter((g) => (!area || g.area === area) && (grado == null || g.grados.includes(grado)));

  return (
    <Page onRefresh={() => { void guias.refetch(); void clases.refetch(); }} refreshing={guias.isRefetching}>
      <AppHeader
        eyebrow="Aula"
        title="Guías de clase"
        subtitle="Secuencias por grado con los árboles del propio colegio, de Ciencias Naturales y de Matemáticas."
      />
      {admin ? <InstitucionSelector value={institucionId} onChange={institucion.setInstitucionId} permitirTodas={false} /> : null}
      <Notice tono="info">
        Pensadas para el aula con el celular restringido: el docente muestra la app y cada grupo trabaja con la ficha impresa, que trae los datos reales del colegio.
      </Notice>

      <View style={styles.filtros}>
        <ChoiceChip label="Todas las áreas" selected={!area} onPress={() => setArea(undefined)} />
        {(Object.keys(AREAS) as Area[]).map((a) => <ChoiceChip key={a} label={AREAS[a]} selected={area === a} onPress={() => setArea(a)} />)}
      </View>
      {grados.length ? (
        <View style={styles.filtros}>
          <ChoiceChip label="Todos los grados" selected={grado == null} onPress={() => setGrado(undefined)} />
          {grados.map((g) => <ChoiceChip key={g} label={`${g}.°`} selected={grado === g} onPress={() => setGrado(g)} />)}
        </View>
      ) : null}

      {guias.isLoading ? (
        <LoadingState text="Cargando las guías…" />
      ) : guias.error && !guias.data ? (
        <ErrorState error={guias.error} onRetry={() => void guias.refetch()} />
      ) : visibles.length ? (
        <View style={styles.lista}>{visibles.map((g) => <TarjetaGuia key={g.id} guia={g} />)}</View>
      ) : (
        <EmptyState title="No hay guías con ese filtro" />
      )}

      {institucionId ? (
        <Card title="Bitácora de clases" subtitle="Clases dictadas con las guías en tu institución. Cuentan como acciones pedagógicas del PRAE." icon="calendar">
          {clases.isLoading ? (
            <LoadingState />
          ) : clases.data?.length ? (
            <View style={styles.lista}>{clases.data.map((c) => <FilaClase key={c.id} clase={c} />)}</View>
          ) : (
            <Text style={styles.meta}>Aún no hay clases registradas. Al terminar una clase, regístrala desde la guía.</Text>
          )}
        </Card>
      ) : null}
    </Page>
  );
}

const useStyles = crearEstilos(({ palette, card }) => ({
  flex: { flex: 1, gap: 6 },
  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  lista: { gap: 10 },
  guia: { ...card, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16 },
  presionado: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  guiaTitulo: { color: palette.ink, fontSize: 16, fontFamily: fonts.bold, lineHeight: 21 },
  insignias: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  referente: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  clase: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.line },
  claseTitulo: { color: palette.ink, fontSize: 14, fontFamily: fonts.bold },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  nota: { color: palette.ink, fontSize: 13, lineHeight: 18 },
}));
