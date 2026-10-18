import { zodResolver } from '@hookform/resolvers/zod';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';

import { useCursos, useGuardarCurso } from '@/features/courses/api';
import { GRADOS, ZONAS, cursoFormSchema, type CursoFormInput } from '@/features/courses/schemas';
import { InstitucionSelector, useInstitucionElegida } from '@/features/perfil/components/InstitucionSelector';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { gestiona } from '@/features/perfil/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { hoyIso } from '@/shared/format';
import { ChoiceChip, Field, InlineMessage, PrimaryButton, SelectField } from '@/shared/components/FormControls';
import { AppHeader, Badge, Card, EmptyState, ErrorState, LoadingState, NumberField, Page } from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

export function CoursesScreen() {
  const styles = useStyles();
  const perfil = useMiPerfil();
  const institucion = useInstitucionElegida();
  const cursos = useCursos(institucion.institucionId);
  const puedeCrear = gestiona(perfil.data, institucion.institucionId);

  return (
    <Page onRefresh={() => void cursos.refetch()} refreshing={cursos.isFetching && !cursos.isLoading}>
      <AppHeader
        eyebrow="Organización"
        title="Cursos y zonas"
        subtitle="Cada curso cuida unas zonas del colegio. Aquí ves su avance de cobertura y la productividad de sus integrantes."
      />
      <InstitucionSelector value={institucion.institucionId} onChange={institucion.setInstitucionId} />
      {puedeCrear && institucion.institucionId ? <NuevoCurso institucionId={institucion.institucionId} /> : null}
      {cursos.isLoading ? <LoadingState /> : cursos.error ? (
        <ErrorState error={cursos.error} onRetry={() => void cursos.refetch()} />
      ) : !cursos.data?.length ? (
        <EmptyState title="No hay cursos" text={puedeCrear ? 'Crea el primero con el formulario de arriba.' : 'Un docente o el administrador debe crearlos.'} />
      ) : (
        cursos.data.map((c) => (
          <Card key={c.id}>
            <View style={styles.header}>
              <Text style={styles.titulo} accessibilityRole="link" onPress={() => router.push(`/(app)/courses/${c.id}` as Href)}>
                {c.nombre} · {c.anio}
              </Text>
              {c.activo ? <Badge label="Activo" tono="sano" /> : <Badge label="Inactivo" />}
            </View>
            <Text style={styles.texto}>
              {c.integrantes} integrante(s) · Docente: {c.docente_nombre ?? 'sin asignar'}
            </Text>
            <Text style={styles.texto}>Zonas: {c.zonas.length ? c.zonas.join(', ') : 'sin zonas asignadas'}</Text>
            <Text style={styles.link} accessibilityRole="link" onPress={() => router.push(`/(app)/courses/${c.id}` as Href)}>
              Ver avance y gestionar
            </Text>
          </Card>
        ))
      )}
    </Page>
  );
}

function NuevoCurso({ institucionId }: { institucionId: string }) {
  const styles = useStyles();
  const { crear } = useGuardarCurso();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string>();
  const { control, handleSubmit, reset } = useForm<CursoFormInput>({
    resolver: zodResolver(cursoFormSchema),
    defaultValues: { nombre: '', anio: Number(hoyIso().slice(0, 4)), zonas: [] },
  });

  if (!abierto) return <PrimaryButton title="＋ Nuevo curso" onPress={() => setAbierto(true)} />;

  const enviar = handleSubmit(async (v) => {
    setError(undefined);
    try {
      const creado = await crear.mutateAsync({ institucion_id: institucionId, nombre: v.nombre.trim(), anio: v.anio, zonas: v.zonas, grado: v.grado ?? null });
      reset();
      setAbierto(false);
      router.push(`/(app)/courses/${creado.id}` as Href);
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  });

  return (
    <Card title="Nuevo curso">
      <Controller name="nombre" control={control} render={({ field, fieldState }) => (
        <Field label="Nombre" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} placeholder="Ej.: 10-A" error={fieldState.error?.message} />
      )} />
      <Controller name="anio" control={control} render={({ field, fieldState }) => (
        <NumberField label="Año escolar" value={field.value} onChange={field.onChange} error={fieldState.error?.message} />
      )} />
      <Controller name="grado" control={control} render={({ field }) => (
        <SelectField label="Grado" value={field.value} placeholder="Según el nombre del curso" options={GRADOS} onChange={field.onChange} />
      )} />
      <Text style={styles.texto}>10.° y 11.° prestan servicio social. Si no eliges el grado, se toma del nombre (por ejemplo, 10-A).</Text>
      <Controller name="zonas" control={control} render={({ field }) => (
        <View style={styles.chips}>
          {ZONAS.map((zona) => (
            <ChoiceChip
              key={zona}
              label={zona}
              selected={field.value.includes(zona)}
              onPress={() => field.onChange(field.value.includes(zona) ? field.value.filter((z) => z !== zona) : [...field.value, zona])}
            />
          ))}
        </View>
      )} />
      {error ? <InlineMessage>{error}</InlineMessage> : null}
      <PrimaryButton title="Crear curso" loading={crear.isPending} onPress={() => void enviar()} />
      <PrimaryButton title="Cancelar" variant="secondary" onPress={() => setAbierto(false)} />
    </Card>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titulo: { color: palette.forest, fontSize: 16, fontWeight: '900', flexShrink: 1 },
  texto: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  link: { color: palette.forest, fontSize: 13, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
}));
