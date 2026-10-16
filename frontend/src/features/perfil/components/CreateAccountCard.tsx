import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';

import { palette } from '@/config/constants';
import { CLAVE_MIN } from '@/features/auth/schemas';
import { useCursos } from '@/features/courses/api';
import { InstitucionSelector } from '@/features/perfil/components/InstitucionSelector';
import { useCrearUsuario } from '@/features/perfil/hooks/usePerfil';
import {
  ETIQUETA_ROL,
  crearCuentaSchema,
  rolSchema,
  type CrearCuenta,
  type CrearCuentaInput,
} from '@/features/perfil/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { Field, InlineMessage, PrimaryButton, SelectField } from '@/shared/components/FormControls';
import { Card } from '@/shared/components/UI';

const SIN = '__sin__';

/** El administrador crea una cuenta lista para usar: confirmada, con rol, institución y curso.
 *  La contraseña inicial queda a la vista para compartirla con la persona. */
export function CreateAccountCard({ institucionInicial }: { institucionInicial?: string }) {
  const [abierta, setAbierta] = useState(false);
  const [creada, setCreada] = useState<{ nombre: string; correo: string }>();
  const crear = useCrearUsuario();
  const valoresIniciales: CrearCuentaInput = {
    nombre: '',
    email: '',
    password: '',
    rol: 'estudiante',
    institucion_id: institucionInicial ?? null,
    curso_id: null,
  };
  const { control, handleSubmit, reset, setValue } = useForm<CrearCuentaInput, unknown, CrearCuenta>({
    resolver: zodResolver(crearCuentaSchema),
    defaultValues: valoresIniciales,
  });
  const institucion = useWatch({ control, name: 'institucion_id' });
  const cursos = useCursos(institucion ?? undefined);
  const cursosDisponibles = (cursos.data ?? []).filter((c) => c.institucion_id === institucion);

  async function guardar(cuenta: CrearCuenta) {
    setCreada(undefined);
    try {
      const nueva = await crear.mutateAsync(cuenta);
      setCreada({ nombre: nueva.nombre, correo: nueva.correo ?? cuenta.email });
      // Se conserva la institución para crear varias cuentas seguidas del mismo colegio.
      reset({ ...valoresIniciales, institucion_id: cuenta.institucion_id });
      setAbierta(false);
    } catch {
      // El error se muestra con crear.error.
    }
  }

  if (!abierta) {
    return (
      <Card>
        <View style={styles.cerrada}>
          <View style={styles.flex}>
            <Text style={styles.titulo}>Crear una cuenta</Text>
            <Text style={styles.texto}>Para docentes o estudiantes que no se registraron solos. Entran de una vez, sin confirmar el correo.</Text>
          </View>
          <PrimaryButton title="Crear cuenta" icon="person" compact onPress={() => setAbierta(true)} />
        </View>
        {creada ? (
          <InlineMessage tone="success">
            Listo: {creada.nombre} ya puede entrar con {creada.correo} y la contraseña que le asignaste.
          </InlineMessage>
        ) : null}
      </Card>
    );
  }

  return (
    <Card title="Crear una cuenta">
      <Controller name="nombre" control={control} render={({ field, fieldState }) => (
        <Field label="Nombre completo" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur}
          autoCapitalize="words" error={fieldState.error?.message} />
      )} />
      <Controller name="email" control={control} render={({ field, fieldState }) => (
        <Field label="Correo electrónico" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur}
          autoCapitalize="none" keyboardType="email-address" autoComplete="off" error={fieldState.error?.message} />
      )} />
      <Controller name="password" control={control} render={({ field, fieldState }) => (
        <Field label="Contraseña inicial" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur}
          autoCapitalize="none" autoCorrect={false} autoComplete="off" error={fieldState.error?.message}
          hint={`Mínimo ${CLAVE_MIN} caracteres. Compártela con la persona por un medio privado.`} />
      )} />
      <Controller name="rol" control={control} render={({ field }) => (
        <SelectField label="Rol" value={field.value} options={rolSchema.options.map((r) => ({ label: ETIQUETA_ROL[r], value: r }))}
          onChange={field.onChange} />
      )} />
      <Controller name="institucion_id" control={control} render={({ field, fieldState }) => (
        <View>
          <InstitucionSelector
            value={field.value ?? undefined}
            permitirTodas={false}
            onChange={(valor) => {
              field.onChange(valor ?? null);
              setValue('curso_id', null);
            }}
          />
          {fieldState.error ? <InlineMessage>{fieldState.error.message}</InlineMessage> : null}
        </View>
      )} />
      <Controller name="curso_id" control={control} render={({ field }) => (
        <SelectField
          label="Curso (opcional)"
          value={field.value ?? SIN}
          options={[{ label: 'Sin curso', value: SIN }, ...cursosDisponibles.map((c) => ({ label: `${c.nombre} (${c.anio})`, value: c.id }))]}
          onChange={(valor) => field.onChange(valor === SIN ? null : valor)}
        />
      )} />
      {crear.error ? <InlineMessage>{getApiErrorMessage(crear.error)}</InlineMessage> : null}
      <View style={styles.acciones}>
        <PrimaryButton title="Crear cuenta" icon="person" loading={crear.isPending} onPress={handleSubmit(guardar)} />
        <PrimaryButton title="Cancelar" variant="ghost" onPress={() => { crear.reset(); reset(valoresIniciales); setAbierta(false); }} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  cerrada: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  flex: { flex: 1, minWidth: 220, gap: 4 },
  titulo: { color: palette.ink, fontSize: 15, fontWeight: '900' },
  texto: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  acciones: { gap: 8 },
});
