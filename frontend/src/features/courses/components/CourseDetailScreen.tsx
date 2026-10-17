import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useAvanceCurso, useCurso, useGuardarCurso } from '@/features/courses/api';
import { ZONAS, type CursoDetalle, type Zona } from '@/features/courses/schemas';
import { useEditarUsuario, useUsuarios } from '@/features/perfil/hooks/usePerfil';
import { etiquetaRol } from '@/features/perfil/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { formatFecha, formatPorcentaje } from '@/shared/format';
import { fechaIso } from '@/shared/validacion';
import { ChoiceChip, Field, InlineMessage, PrimaryButton, SelectField } from '@/shared/components/FormControls';
import {
  AppHeader,
  Badge,
  Card,
  Cell,
  ConfirmButton,
  ErrorState,
  LoadingState,
  Notice,
  Page,
  ProgressBar,
  Row,
  StatGrid,
  StatTile,
  StateBadge,
} from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

export function CourseDetailScreen({ cursoId }: { cursoId: string }) {
  const curso = useCurso(cursoId);
  if (curso.isLoading) return <Page><LoadingState /></Page>;
  if (curso.error || !curso.data) {
    return <Page><AppHeader title="Curso" /><ErrorState error={curso.error} onRetry={() => void curso.refetch()} /></Page>;
  }
  return <Detalle curso={curso.data} />;
}

function Detalle({ curso }: { curso: CursoDetalle }) {
  const styles = useStyles();
  const [mensaje, setMensaje] = useState<string>();
  return (
    <Page>
      <AppHeader
        eyebrow={`Curso · ${curso.anio}`}
        title={curso.nombre}
        subtitle={`Docente: ${curso.docente_nombre ?? 'sin asignar'} · ${curso.integrantes} integrante(s)`}
        backTo={'/(app)/courses' as Href}
      />
      {mensaje ? <Notice tono="sano">{mensaje}</Notice> : null}
      <AvanceCurso cursoId={curso.id} />
      {curso.puede_gestionar ? (
        <>
          <ZonasCurso curso={curso} onGuardado={() => setMensaje('Zonas actualizadas.')} />
          <IntegrantesCurso curso={curso} onCambio={setMensaje} />
          <DatosCurso curso={curso} onCambio={setMensaje} />
        </>
      ) : (
        <Card title="Zonas e integrantes">
          <Text style={styles.texto}>Zonas: {curso.zonas.join(', ') || 'sin zonas'}</Text>
          <Text style={styles.texto}>Integrantes: {curso.miembros.map((m) => m.nombre).join(', ') || 'ninguno'}</Text>
        </Card>
      )}
    </Page>
  );
}

function AvanceCurso({ cursoId }: { cursoId: string }) {
  const styles = useStyles();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [filtro, setFiltro] = useState<{ desde?: string; hasta?: string }>({});
  const [error, setError] = useState<string>();
  const avance = useAvanceCurso(cursoId, filtro.desde, filtro.hasta);

  function aplicar() {
    setError(undefined);
    for (const valor of [desde, hasta]) {
      if (valor && !fechaIso.safeParse(valor).success) {
        setError('Usa fechas con formato AAAA-MM-DD.');
        return;
      }
    }
    setFiltro({ desde: desde || undefined, hasta: hasta || undefined });
  }

  return (
    <Card title="Avance">
      <Row>
        <Cell basis={140}><Field label="Desde" value={desde} onChangeText={setDesde} placeholder="AAAA-MM-DD" autoCapitalize="none" /></Cell>
        <Cell basis={140}><Field label="Hasta" value={hasta} onChangeText={setHasta} placeholder="AAAA-MM-DD" autoCapitalize="none" /></Cell>
      </Row>
      <PrimaryButton title="Aplicar periodo" variant="secondary" onPress={aplicar} />
      {error ? <InlineMessage>{error}</InlineMessage> : null}
      {avance.isLoading ? <LoadingState /> : avance.error || !avance.data ? (
        <ErrorState error={avance.error} onRetry={() => void avance.refetch()} />
      ) : (
        <>
          <Text style={styles.texto}>
            Periodo: {formatFecha(avance.data.periodo.desde)} a {formatFecha(avance.data.periodo.hasta)} (sin fechas se usa la ventana de revisita de la institución).
          </Text>
          <StatGrid>
            <StatTile label="Cobertura" value={formatPorcentaje(avance.data.cobertura.cobertura_pct)}
              hint={`${avance.data.cobertura.arboles_inspeccionados} de ${avance.data.cobertura.arboles_asignados} árboles`} tono="sano" />
            <StatTile label="Inspecciones válidas" value={avance.data.productividad.inspecciones}
              hint={`${avance.data.productividad.confirmadas} confirmadas · ${avance.data.productividad.pendientes} pendientes`} />
            <StatTile label="Promedio por integrante" value={avance.data.productividad.promedio_por_integrante ?? '—'} />
            <StatTile label="Confirmadas de las revisadas" value={formatPorcentaje(avance.data.productividad.pct_confirmadas_de_revisadas)} />
          </StatGrid>
          {avance.data.cobertura.por_zona.map((z) => (
            <View key={z.zona} style={styles.zona}>
              <View style={styles.zonaHeader}>
                <Text style={styles.zonaNombre}>{z.zona}</Text>
                <Text style={styles.texto}>{z.inspeccionados}/{z.asignados} · {formatPorcentaje(z.cobertura_pct)}</Text>
              </View>
              <ProgressBar pct={z.cobertura_pct} />
            </View>
          ))}
          {avance.data.productividad.por_integrante.length ? (
            <>
              <Text style={styles.subtitulo}>Integrantes</Text>
              {avance.data.productividad.por_integrante.map((p) => (
                <Text key={p.usuario_id} style={styles.texto}>
                  {p.nombre}: {p.inspecciones} inspecciones ({p.confirmadas} confirmadas, {p.anuladas} anuladas) · {p.arboles_registrados} árboles registrados
                </Text>
              ))}
            </>
          ) : null}
          {avance.data.cobertura.pendientes.length ? (
            <>
              <Text style={styles.subtitulo}>Árboles por inspeccionar en el periodo</Text>
              {avance.data.cobertura.pendientes.map((a) => (
                <View key={a.id} style={styles.pendiente}>
                  <Text style={[styles.link, styles.flex]} accessibilityRole="link" onPress={() => router.push(`/(app)/trees/${a.id}` as Href)}>
                    {a.codigo} · {a.nombre_comun} · {a.zona}
                  </Text>
                  <StateBadge estado={a.estado} />
                </View>
              ))}
            </>
          ) : null}
        </>
      )}
    </Card>
  );
}

function ZonasCurso({ curso, onGuardado }: { curso: CursoDetalle; onGuardado: () => void }) {
  const styles = useStyles();
  const { zonas } = useGuardarCurso();
  const [seleccion, setSeleccion] = useState<Zona[]>(curso.zonas.filter((z): z is Zona => (ZONAS as readonly string[]).includes(z)));
  const [error, setError] = useState<string>();

  async function guardar() {
    setError(undefined);
    try {
      await zonas.mutateAsync({ id: curso.id, zonas: seleccion });
      onGuardado();
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  return (
    <Card title="Zonas asignadas">
      <View style={styles.chips}>
        {ZONAS.map((zona) => (
          <ChoiceChip
            key={zona}
            label={zona}
            selected={seleccion.includes(zona)}
            onPress={() => setSeleccion((actual) => (actual.includes(zona) ? actual.filter((z) => z !== zona) : [...actual, zona]))}
          />
        ))}
      </View>
      {error ? <InlineMessage>{error}</InlineMessage> : null}
      <PrimaryButton title="Guardar zonas" loading={zonas.isPending} onPress={() => void guardar()} />
    </Card>
  );
}

function IntegrantesCurso({ curso, onCambio }: { curso: CursoDetalle; onCambio: (mensaje: string) => void }) {
  const styles = useStyles();
  const usuarios = useUsuarios(curso.institucion_id);
  const editar = useEditarUsuario();
  const [elegido, setElegido] = useState<string>();
  const [error, setError] = useState<string>();
  const candidatos = (usuarios.data ?? []).filter((u) => u.activo && u.curso_id !== curso.id && u.rol === 'estudiante');

  async function asignar(usuarioId: string, cursoId: string | null, texto: string) {
    setError(undefined);
    try {
      await editar.mutateAsync({ usuarioId, cambios: { curso_id: cursoId } });
      setElegido(undefined);
      onCambio(texto);
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  return (
    <Card title="Integrantes">
      {curso.miembros.length ? curso.miembros.map((m) => (
        <View key={m.usuario_id} style={styles.pendiente}>
          <Text style={[styles.texto, styles.flex]}>{m.nombre}</Text>
          <Badge label={etiquetaRol(m.rol)} />
          <Text style={styles.quitar} accessibilityRole="button" onPress={() => void asignar(m.usuario_id, null, `${m.nombre} salió del curso.`)}>
            Quitar
          </Text>
        </View>
      )) : <Text style={styles.texto}>Aún no hay integrantes.</Text>}
      {usuarios.isLoading ? <LoadingState text="Cargando estudiantes…" /> : usuarios.error ? (
        <InlineMessage>{getApiErrorMessage(usuarios.error)}</InlineMessage>
      ) : candidatos.length ? (
        <>
          <SelectField
            label="Agregar estudiante"
            value={elegido}
            placeholder="Selecciona un estudiante"
            options={candidatos.map((u) => ({ label: `${u.nombre}${u.curso_id ? ' (está en otro curso)' : ''}`, value: u.usuario_id }))}
            onChange={setElegido}
          />
          <PrimaryButton
            title="Agregar al curso"
            disabled={!elegido}
            loading={editar.isPending}
            onPress={() => elegido && void asignar(elegido, curso.id, 'Estudiante agregado al curso.')}
          />
        </>
      ) : (
        <Text style={styles.texto}>No hay más estudiantes activos de la institución para agregar.</Text>
      )}
      {error ? <InlineMessage>{error}</InlineMessage> : null}
    </Card>
  );
}

function DatosCurso({ curso, onCambio }: { curso: CursoDetalle; onCambio: (mensaje: string) => void }) {
  const { editar, borrar } = useGuardarCurso();
  const usuarios = useUsuarios(curso.institucion_id);
  const [nombre, setNombre] = useState(curso.nombre);
  const [docente, setDocente] = useState<string | undefined>(curso.docente_id ?? undefined);
  const [error, setError] = useState<string>();
  const docentes = (usuarios.data ?? []).filter((u) => u.activo && (u.rol === 'docente' || u.rol === 'administrador'));

  async function guardar() {
    setError(undefined);
    if (!nombre.trim()) {
      setError('Escribe el nombre del curso.');
      return;
    }
    try {
      await editar.mutateAsync({ id: curso.id, cambios: { nombre: nombre.trim(), docente_id: docente ?? null } });
      onCambio('Datos del curso guardados.');
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  async function alternarActivo() {
    setError(undefined);
    try {
      await editar.mutateAsync({ id: curso.id, cambios: { activo: !curso.activo } });
      onCambio(curso.activo ? 'Curso desactivado.' : 'Curso activado.');
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  async function eliminar() {
    setError(undefined);
    try {
      await borrar.mutateAsync(curso.id);
      router.replace('/(app)/courses' as Href);
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  return (
    <Card title="Datos del curso">
      <Field label="Nombre" value={nombre} onChangeText={setNombre} />
      <SelectField
        label="Docente a cargo"
        value={docente}
        placeholder="Sin asignar"
        options={docentes.map((u) => ({ label: u.nombre, value: u.usuario_id }))}
        onChange={setDocente}
      />
      {error ? <InlineMessage>{error}</InlineMessage> : null}
      <PrimaryButton title="Guardar" loading={editar.isPending} onPress={() => void guardar()} />
      <PrimaryButton title={curso.activo ? 'Desactivar curso' : 'Activar curso'} variant="secondary" onPress={() => void alternarActivo()} />
      <ConfirmButton
        title="Eliminar curso"
        confirmTitle="¿Eliminar el curso? Sus integrantes quedarán sin curso; no se borra ningún registro."
        loading={borrar.isPending}
        onConfirm={() => void eliminar()}
      />
    </Card>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  texto: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  subtitulo: { marginTop: 4, color: palette.ink, fontSize: 14, fontWeight: '900' },
  zona: { gap: 6 },
  zonaHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  zonaNombre: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  pendiente: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  link: { color: palette.forest, fontSize: 13, fontWeight: '800' },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quitar: { color: palette.red, fontSize: 13, fontWeight: '800' },
}));
