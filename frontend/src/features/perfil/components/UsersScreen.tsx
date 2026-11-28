import { useState } from 'react';
import { Text, View } from 'react-native';

import { useCatalogs } from '@/features/catalogs/hooks/useCatalogs';
import { useCursos } from '@/features/courses/api';
import { InstitucionSelector, useInstitucionElegida } from '@/features/perfil/components/InstitucionSelector';
import { useContrasenaTemporal, useEditarUsuario, useIncorporarEstudiante, useMiPerfil, useUsuarios } from '@/features/perfil/hooks/usePerfil';
import { ETIQUETA_ROL, esAdmin, esRevisor, rolSchema, type Rol, type Usuario } from '@/features/perfil/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { Field, InlineMessage, PrimaryButton, SelectField } from '@/shared/components/FormControls';
import { AppHeader, Badge, Card, ConfirmButton, EmptyState, ErrorState, LoadingState, Notice, Page, Tabs } from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

const SIN = '__sin__';

export function UsersScreen() {
  const styles = useStyles();
  const perfil = useMiPerfil();
  const institucion = useInstitucionElegida({ soloPropiaSiNoAdmin: true });
  const habilitado = esRevisor(perfil.data);
  const admin = esAdmin(perfil.data);
  // El administrador trae a todos para ver también las cuentas nuevas, que aún no tienen
  // institución y no saldrían filtrando por una.
  const usuarios = useUsuarios(admin ? undefined : institucion.institucionId, habilitado);
  const [filtro, setFiltro] = useState<'todos' | Rol>('todos');

  if (perfil.isLoading) return <Page><LoadingState /></Page>;
  if (!habilitado) {
    return <Page><AppHeader title="Usuarios" /><Notice tono="riesgo">Esta sección es para docentes y administradores.</Notice></Page>;
  }
  const todos = usuarios.data ?? [];
  const sinInstitucion = admin ? todos.filter((u) => !u.institucion_id) : [];
  const lista = todos
    .filter((u) => !admin || (u.institucion_id && (!institucion.institucionId || u.institucion_id === institucion.institucionId)))
    .filter((u) => filtro === 'todos' || u.rol === filtro);

  return (
    <Page onRefresh={() => void usuarios.refetch()} refreshing={usuarios.isFetching && !usuarios.isLoading}>
      <AppHeader
        eyebrow="Personas"
        title="Usuarios"
        subtitle={admin
          ? 'Asigna rol, institución y curso. Las cuentas se crean en Supabase Auth; aquí aparecen al iniciar sesión por primera vez.'
          : 'Incorpora estudiantes a tu institución y asígnales un curso.'}
      />
      {perfil.data?.rol === 'docente' && perfil.data.institucion_id ? <Incorporacion /> : null}
      {sinInstitucion.length ? (
        <View style={styles.nuevas}>
          <Notice tono="riesgo">
            {sinInstitucion.length === 1
              ? '1 cuenta nueva no tiene institución. Asígnale institución y rol para que pueda entrar a un curso y aparecer en el ranking.'
              : `${sinInstitucion.length} cuentas nuevas no tienen institución. Asígnales institución y rol para que puedan entrar a un curso y aparecer en el ranking.`}
          </Notice>
          {sinInstitucion.map((u) => <UsuarioCard key={u.usuario_id} usuario={u} admin propio={u.usuario_id === perfil.data?.usuario_id} />)}
        </View>
      ) : null}
      <InstitucionSelector value={institucion.institucionId} onChange={institucion.setInstitucionId} disabled={institucion.bloqueada} />
      <Tabs
        value={filtro}
        options={[{ label: 'Todos', value: 'todos' }, ...rolSchema.options.map((r) => ({ label: ETIQUETA_ROL[r], value: r }))]}
        onChange={setFiltro}
      />
      {usuarios.isLoading ? <LoadingState /> : usuarios.error ? (
        <ErrorState error={usuarios.error} onRetry={() => void usuarios.refetch()} />
      ) : !lista.length ? (
        <EmptyState title="No hay usuarios con este filtro" />
      ) : (
        lista.map((u) => <UsuarioCard key={u.usuario_id} usuario={u} admin={admin} propio={u.usuario_id === perfil.data?.usuario_id} />)
      )}
    </Page>
  );
}

function Incorporacion() {
  const [correo, setCorreo] = useState('');
  const incorporar = useIncorporarEstudiante();

  return (
    <Card title="Incorporar estudiante">
      <Field
        label="Correo con el que se registró"
        value={correo}
        onChangeText={(valor) => {
          setCorreo(valor);
          incorporar.reset();
        }}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        editable={!incorporar.isPending}
      />
      {incorporar.data ? <InlineMessage tone="info">{incorporar.data.nombre} ya pertenece a tu institución.</InlineMessage> : null}
      {incorporar.error ? <InlineMessage>{getApiErrorMessage(incorporar.error)}</InlineMessage> : null}
      <PrimaryButton
        title="Añadir a mi institución"
        disabled={!correo.trim()}
        loading={incorporar.isPending}
        onPress={() => incorporar.mutate(correo.trim(), { onSuccess: () => setCorreo('') })}
      />
    </Card>
  );
}

function UsuarioCard({ usuario, admin, propio }: { usuario: Usuario; admin: boolean; propio: boolean }) {
  const styles = useStyles();
  const catalogos = useCatalogs();
  const editar = useEditarUsuario();
  const [institucion, setInstitucion] = useState<string | null>(usuario.institucion_id);
  const cursos = useCursos(institucion ?? undefined);
  const [rol, setRol] = useState<Rol>(usuario.rol);
  const [curso, setCurso] = useState<string | null>(usuario.curso_id);
  const [activo, setActivo] = useState(usuario.activo);
  const [mensaje, setMensaje] = useState<string>();
  const [error, setError] = useState<string>();
  const cambios = {
    ...(rol !== usuario.rol ? { rol } : {}),
    ...(institucion !== usuario.institucion_id ? { institucion_id: institucion } : {}),
    ...(curso !== usuario.curso_id ? { curso_id: curso } : {}),
    ...(activo !== usuario.activo ? { activo } : {}),
  };
  const hayCambios = Object.keys(cambios).length > 0;

  async function guardar() {
    setError(undefined);
    setMensaje(undefined);
    try {
      await editar.mutateAsync({ usuarioId: usuario.usuario_id, cambios: admin ? cambios : { curso_id: curso } });
      setMensaje('Cambios guardados.');
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  const cursosDisponibles = (cursos.data ?? []).filter((c) => c.institucion_id === institucion);

  return (
    <Card>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.nombre}>{usuario.nombre}{propio ? ' (tú)' : ''}</Text>
          <Text style={styles.texto}>{usuario.correo ?? 'sin correo'}</Text>
        </View>
        <Badge label={ETIQUETA_ROL[usuario.rol]} tono={usuario.rol === 'administrador' ? 'critico' : usuario.rol === 'docente' ? 'info' : 'neutro'} />
        {!usuario.activo ? <Badge label="Inactivo" tono="riesgo" /> : null}
      </View>
      {admin ? (
        <>
          <SelectField label="Rol" value={rol} options={rolSchema.options.map((r) => ({ label: ETIQUETA_ROL[r], value: r }))} onChange={setRol} />
          <InstitucionSelector
            value={institucion ?? undefined}
            permitirTodas={false}
            onChange={(v) => {
              setInstitucion(v ?? null);
              if (v !== usuario.institucion_id) setCurso(null);
            }}
          />
        </>
      ) : null}
      <SelectField
        label="Curso"
        value={curso ?? SIN}
        options={[{ label: 'Sin curso', value: SIN }, ...cursosDisponibles.map((c) => ({ label: `${c.nombre} (${c.anio})`, value: c.id }))]}
        onChange={(v) => setCurso(v === SIN ? null : v)}
      />
      {admin && !propio ? (
        <SelectField
          label="Estado de la cuenta"
          value={activo ? 'activa' : 'inactiva'}
          options={[{ label: 'Activa', value: 'activa' }, { label: 'Desactivada', value: 'inactiva' }]}
          onChange={(v) => setActivo(v === 'activa')}
        />
      ) : null}
      {catalogos.error ? <InlineMessage>{getApiErrorMessage(catalogos.error)}</InlineMessage> : null}
      {mensaje ? <InlineMessage tone="info">{mensaje}</InlineMessage> : null}
      {error ? <InlineMessage>{error}</InlineMessage> : null}
      <PrimaryButton title="Guardar cambios" disabled={!hayCambios} loading={editar.isPending} onPress={() => void guardar()} />
      {(admin && !propio && usuario.rol !== 'administrador') || (!admin && usuario.rol === 'estudiante') ? (
        <ContrasenaTemporal usuario={usuario} />
      ) : null}
    </Card>
  );
}

/** Para quien olvidó su contraseña: mientras el enlace del correo no funcione, el administrador (o
 *  el docente, con sus estudiantes) crea una temporal y se la da en persona. Se muestra una sola vez. */
function ContrasenaTemporal({ usuario }: { usuario: Usuario }) {
  const styles = useStyles();
  const crear = useContrasenaTemporal();
  return (
    <View style={styles.temporal}>
      <Text style={styles.texto}>¿Olvidó su contraseña o no puede entrar? Crea una temporal y dásela en persona; luego la cambia en Mi perfil.</Text>
      {crear.data ? (
        <View style={styles.claveCaja}>
          <Text style={styles.texto}>{crear.data.mensaje}</Text>
          <Text selectable style={styles.clave}>{crear.data.contrasena}</Text>
        </View>
      ) : null}
      {crear.error ? <InlineMessage>{getApiErrorMessage(crear.error)}</InlineMessage> : null}
      <ConfirmButton
        title={crear.data ? 'Crear otra contraseña temporal' : 'Crear contraseña temporal'}
        confirmTitle={`¿Crear una contraseña temporal para ${usuario.nombre}? La que tiene ahora deja de servir.`}
        loading={crear.isPending}
        onConfirm={() => crear.mutate(usuario.usuario_id)}
      />
    </View>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  nuevas: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  nombre: { color: palette.ink, fontSize: 15, fontWeight: '900' },
  texto: { color: palette.muted, fontSize: 12 },
  temporal: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.line },
  claveCaja: { gap: 4, padding: 12, borderRadius: 12, backgroundColor: palette.forestSoft },
  clave: { color: palette.forest, fontSize: 20, fontWeight: '900', letterSpacing: 0.5 },
}));
