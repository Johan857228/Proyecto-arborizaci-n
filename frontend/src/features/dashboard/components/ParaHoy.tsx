import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useAvanceCurso, useCursos } from '@/features/courses/api';
import type { Curso } from '@/features/courses/schemas';
import { useMiProgreso } from '@/features/gamification/api';
import { usePendientes } from '@/features/inspections/hooks/useInspecciones';
import { useCuentasSinInstitucion } from '@/features/perfil/hooks/usePerfil';
import { esAdmin, esRevisor, type MiPerfil } from '@/features/perfil/schemas';
import { useReporte } from '@/features/reports/api';
import { getApiErrorMessage } from '@/services/api/client';
import { formatFecha, formatPesos } from '@/shared/format';
import { InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Icon, type IconName } from '@/shared/components/Icon';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { Card, IconChip, ProgressBar, type Tono } from '@/shared/components/UI';
import { crearEstilos, useTema } from '@/theme';

/** Qué consultas de "Para hoy" le tocan a cada perfil. Las mismas claves de caché que usan
 *  Revisión, Reportes y Cursos, así que los números coinciden con esas pantallas. */
function alcance(perfil: MiPerfil | undefined) {
  const institucionId = perfil?.institucion_id ?? undefined;
  const revisor = esRevisor(perfil) && (esAdmin(perfil) || Boolean(institucionId));
  const estudiante = perfil?.rol === 'estudiante' && Boolean(perfil.curso_id);
  return { institucionId, revisor, estudiante, admin: esAdmin(perfil) };
}

/** Total de pendientes del día para la portada: la suma de lo que muestra "Para hoy". */
export function usePendientesDeHoy(perfil: MiPerfil | undefined) {
  const a = alcance(perfil);
  const avance = useAvanceCurso(perfil?.curso_id ?? '', undefined, undefined, a.estudiante);
  const revision = usePendientes(a.institucionId, 0, a.revisor);
  const reporte = useReporte({ institucionId: a.institucionId }, a.revisor);
  const cuentas = useCuentasSinInstitucion(a.admin);
  if (a.estudiante) {
    const c = avance.data?.cobertura;
    return { total: c ? Math.max(0, c.arboles_asignados - c.arboles_inspeccionados) : undefined };
  }
  if (a.revisor) {
    if (!revision.data || !reporte.data) return { total: undefined };
    return {
      total: revision.data.total + reporte.data.riesgo.total_prioritarios + reporte.data.intervenciones.programadas_vencidas + cuentas,
    };
  }
  return { total: undefined };
}

/** Fila de una tarea: ícono, número, frase y flecha; toda la fila abre la pantalla de la tarea. */
function FilaTarea({ icon, tono, valor, texto, detalle, href }: { icon: IconName; tono: Tono; valor?: number; texto: string; detalle?: string; href: Href }) {
  const styles = useStyles();
  const { palette } = useTema();
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(href)} style={({ pressed }) => [styles.fila, pressed && styles.pressed]}>
      <IconChip icon={icon} tono={tono} size={36} />
      <View style={styles.filaTexto}>
        <Text style={styles.filaTitulo}>
          {valor !== undefined ? <Text style={styles.filaNumero}>{valor} </Text> : null}
          {texto}
        </Text>
        {detalle ? <Text style={styles.filaDetalle}>{detalle}</Text> : null}
      </View>
      <Icon name="chevronRight" size={18} color={palette.muted} />
    </Pressable>
  );
}

function Cargando({ texto }: { texto: string }) {
  const styles = useStyles();
  const { palette } = useTema();
  return (
    <View style={styles.cargando}>
      <ActivityIndicator color={palette.forest} />
      <Text style={styles.filaDetalle}>{texto}</Text>
    </View>
  );
}

function Enlace({ texto, href }: { texto: string; href: Href }) {
  const styles = useStyles();
  const { palette } = useTema();
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(href)} style={styles.enlace} hitSlop={8}>
      <Text style={styles.enlaceTexto}>{texto}</Text>
      <Icon name="chevronRight" size={16} color={palette.forest} />
    </Pressable>
  );
}

/** Estudiante: los árboles de su zona que faltan por inspeccionar, con un toque hasta el formulario. */
function TuZona({ perfil }: { perfil: MiPerfil }) {
  const styles = useStyles();
  const cursoId = perfil.curso_id;
  const avance = useAvanceCurso(cursoId ?? '', undefined, undefined, Boolean(cursoId));
  const progreso = useMiProgreso();

  if (!cursoId) {
    return (
      <Card title="Tu zona" icon="location">
        <Text style={styles.texto}>Pide a tu docente que te asigne a un curso para ver los árboles de tu zona.</Text>
      </Card>
    );
  }
  if (avance.isLoading) return <Card title="Tu zona" icon="location"><Cargando texto="Cargando tu zona…" /></Card>;
  if (avance.error || !avance.data) {
    return <Card title="Tu zona" icon="location"><InlineMessage>{getApiErrorMessage(avance.error)}</InlineMessage></Card>;
  }
  const { cobertura, curso, periodo } = avance.data;
  const faltan = Math.max(0, cobertura.arboles_asignados - cobertura.arboles_inspeccionados);
  const porRevisar = progreso.data?.resumen.pendientes ?? 0;
  return (
    <Card
      title="Tu zona"
      subtitle={curso.zonas.length ? curso.zonas.join(' · ') : `Curso ${curso.nombre}`}
      icon="location"
      action={<Enlace texto="Ver todos" href={`/(app)/courses/${cursoId}` as Href} />}
    >
      <View style={styles.cobertura}>
        <ProgressBar pct={cobertura.cobertura_pct} />
        <Text style={styles.filaDetalle}>
          {cobertura.arboles_inspeccionados} de {cobertura.arboles_asignados} árboles inspeccionados desde el {formatFecha(periodo.desde)}
        </Text>
      </View>
      {faltan === 0 ? (
        <View style={styles.alDia}>
          <IconChip icon="checkCircle" size={36} />
          <Text style={[styles.filaTitulo, styles.flex]}>Tu zona está al día</Text>
          <PrimaryButton title="Registrar árbol" icon="add" compact onPress={() => router.navigate('/(app)/trees/new' as Href)} />
        </View>
      ) : (
        <View style={styles.lista}>
          {cobertura.pendientes.slice(0, 3).map((arbol) => (
            <Pressable
              key={arbol.id}
              accessibilityRole="link"
              accessibilityLabel={`Inspeccionar ${arbol.codigo}`}
              onPress={() => router.push(`/(app)/trees/${arbol.id}/inspect` as Href)}
              style={({ pressed }) => [styles.arbol, pressed && styles.pressed]}
            >
              <View style={styles.filaTexto}>
                <Text style={styles.arbolCodigo}>{arbol.codigo}</Text>
                <Text style={styles.filaDetalle} numberOfLines={1}>
                  {arbol.nombre_comun} · {arbol.zona} · {arbol.ultima_inspeccion_en ? `Última ${formatFecha(arbol.ultima_inspeccion_en)}` : 'Nunca inspeccionado'}
                </Text>
              </View>
              <StatusBadge estado={arbol.estado} />
            </Pressable>
          ))}
          {faltan > 3 ? <Text style={styles.filaDetalle}>Y {faltan - 3} más por inspeccionar.</Text> : null}
        </View>
      )}
      {porRevisar > 0 ? (
        <FilaTarea icon="review" tono="riesgo" valor={porRevisar} texto={porRevisar === 1 ? 'inspección tuya espera revisión' : 'inspecciones tuyas esperan revisión'} href={'/(app)/progress' as Href} />
      ) : null}
    </Card>
  );
}

/** Docente y administrador: lo que necesita atención (revisión, riesgo, mantenimiento, cobertura). */
function ParaAtender({ perfil }: { perfil: MiPerfil }) {
  const styles = useStyles();
  const a = alcance(perfil);
  const revision = usePendientes(a.institucionId, 0, a.revisor);
  const reporte = useReporte({ institucionId: a.institucionId }, a.revisor);
  const cuentas = useCuentasSinInstitucion(a.admin);

  if (revision.isLoading || reporte.isLoading) return <Card title="Para atender" icon="flag"><Cargando texto="Revisando pendientes…" /></Card>;
  const error = revision.error ?? reporte.error;
  if (error) return <Card title="Para atender" icon="flag"><InlineMessage>{getApiErrorMessage(error)}</InlineMessage></Card>;

  const pendientes = revision.data?.total ?? 0;
  const r = reporte.data;
  const prioritarios = r?.riesgo.total_prioritarios ?? 0;
  const vencidas = r?.intervenciones.programadas_vencidas ?? 0;
  const programadas = r?.intervenciones.programadas ?? 0;
  const sinInspeccion = r?.cobertura.sin_inspeccion_reciente ?? 0;
  const filas: ReactNode[] = [];
  if (pendientes > 0) {
    filas.push(<FilaTarea key="revision" icon="review" tono="riesgo" valor={pendientes} texto={pendientes === 1 ? 'inspección espera revisión' : 'inspecciones esperan revisión'} href={'/(app)/review' as Href} />);
  }
  if (prioritarios > 0 && r) {
    filas.push(
      <View key="prioritarios" style={styles.grupo}>
        <FilaTarea icon="warning" tono="critico" valor={prioritarios} texto={prioritarios === 1 ? 'árbol prioritario' : 'árboles prioritarios'} detalle="Críticos o junto a redes y construcciones" href={'/(app)/reports?seccion=riesgo' as Href} />
        {r.riesgo.arboles_prioritarios.slice(0, 3).map((arbol) => (
          <Pressable
            key={arbol.id}
            accessibilityRole="link"
            accessibilityLabel={`Ver ficha de ${arbol.codigo}`}
            onPress={() => router.push(`/(app)/trees/${arbol.id}` as Href)}
            style={({ pressed }) => [styles.arbol, styles.arbolSangria, pressed && styles.pressed]}
          >
            <View style={styles.filaTexto}>
              <Text style={styles.arbolCodigo}>{arbol.codigo}</Text>
              <Text style={styles.filaDetalle} numberOfLines={1}>
                {arbol.nombre_comun} · {arbol.zona}{arbol.interferencia ? ` · ${arbol.interferencia}` : ''}
              </Text>
            </View>
            <StatusBadge estado={arbol.estado} />
          </Pressable>
        ))}
      </View>,
    );
  }
  if (programadas > 0) {
    const texto = vencidas > 0 ? `${vencidas === 1 ? 'intervención vencida' : 'intervenciones vencidas'} · ${programadas} programadas` : programadas === 1 ? 'intervención programada' : 'intervenciones programadas';
    filas.push(
      <FilaTarea
        key="intervenciones"
        icon="tools"
        tono={vencidas > 0 ? 'critico' : 'info'}
        valor={vencidas > 0 ? vencidas : programadas}
        texto={texto}
        detalle={a.admin && r ? `Costo estimado ${formatPesos(r.intervenciones.costo_programado)}` : undefined}
        href={'/(app)/interventions' as Href}
      />,
    );
  }
  if (sinInspeccion > 0 && r) {
    filas.push(<FilaTarea key="cobertura" icon="calendar" tono="neutro" valor={sinInspeccion} texto={`${sinInspeccion === 1 ? 'árbol' : 'árboles'} sin inspección en ${r.cobertura.dias_revisita} días`} href={'/(app)/reports?seccion=cobertura' as Href} />);
  }
  if (a.admin && cuentas > 0) {
    filas.push(<FilaTarea key="cuentas" icon="users" tono="info" valor={cuentas} texto={cuentas === 1 ? 'cuenta nueva sin institución' : 'cuentas nuevas sin institución'} href={'/(app)/users' as Href} />);
  }
  return (
    <Card title="Para atender" subtitle="Lo que necesita tu atención en la institución" icon="flag">
      {filas.length ? <View style={styles.lista}>{filas}</View> : (
        <View style={styles.alDia}>
          <IconChip icon="checkCircle" size={36} />
          <Text style={[styles.filaTitulo, styles.flex]}>Todo al día</Text>
        </View>
      )}
    </Card>
  );
}

function FilaCurso({ curso }: { curso: Curso }) {
  const styles = useStyles();
  const avance = useAvanceCurso(curso.id);
  const c = avance.data?.cobertura;
  const sinInspeccionar = c ? Math.max(0, c.arboles_asignados - c.arboles_inspeccionados) : undefined;
  const porRevisar = avance.data?.productividad.pendientes;
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(`/(app)/courses/${curso.id}` as Href)} style={({ pressed }) => [styles.curso, pressed && styles.pressed]}>
      <View style={styles.cursoTop}>
        <Text style={styles.arbolCodigo}>{curso.nombre} · {curso.anio}</Text>
        <Text style={styles.filaDetalle}>{c?.cobertura_pct != null ? `${Math.round(c.cobertura_pct)} %` : '—'}</Text>
      </View>
      <ProgressBar pct={c?.cobertura_pct} />
      <Text style={styles.filaDetalle}>
        {avance.isLoading ? 'Cargando avance…' : `${sinInspeccionar ?? '—'} sin inspeccionar · ${porRevisar ?? '—'} por revisar`}
      </Text>
    </Pressable>
  );
}

/** Docente: avance de sus cursos (máximo 3, porque cada avance recorre las inspecciones). */
function TusCursos({ perfil }: { perfil: MiPerfil }) {
  const styles = useStyles();
  const cursos = useCursos(perfil.institucion_id ?? undefined, Boolean(perfil.institucion_id));
  const mios = (cursos.data ?? []).filter((curso) => curso.docente_id === perfil.usuario_id);
  if (!mios.length) return null;
  return (
    <Card title="Tus cursos" subtitle="Cobertura de las zonas asignadas" icon="school" action={mios.length > 3 ? <Enlace texto="Ver todos" href={'/(app)/courses' as Href} /> : undefined}>
      <View style={styles.lista}>
        {mios.slice(0, 3).map((curso) => <FilaCurso key={curso.id} curso={curso} />)}
      </View>
    </Card>
  );
}

/** Progreso compacto (estudiante y docente): toda la tarjeta abre Mi progreso. */
function ProgresoCompacto() {
  const styles = useStyles();
  const { palette } = useTema();
  const progreso = useMiProgreso();
  const d = progreso.data;
  if (!d) return null;
  const partes = [
    d.nivel.siguiente ? `Faltan ${d.nivel.faltan} para ${d.nivel.siguiente}` : 'Nivel máximo',
    `Racha ${d.racha.actual} sem`,
    d.posicion_institucion ? `Puesto ${d.posicion_institucion.posicion} de ${d.posicion_institucion.de}` : null,
  ].filter(Boolean);
  return (
    <Pressable accessibilityRole="link" accessibilityLabel="Ver mi progreso" onPress={() => router.push('/(app)/progress' as Href)} style={({ pressed }) => [styles.progreso, pressed && styles.pressed]}>
      <IconChip icon="trophy" tono="riesgo" size={40} />
      <View style={[styles.filaTexto, styles.progresoTexto]}>
        <Text style={styles.filaTitulo}>{d.nivel.nombre} · {d.puntos} pts</Text>
        <ProgressBar pct={d.nivel.progreso_pct} />
        <Text style={styles.filaDetalle}>{partes.join(' · ')}</Text>
      </View>
      <Icon name="chevronRight" size={18} color={palette.muted} />
    </Pressable>
  );
}

/** Bloque "Para hoy" según el rol. */
export function ParaHoy({ perfil }: { perfil: MiPerfil }) {
  const styles = useStyles();
  const a = alcance(perfil);
  if (!perfil.institucion_id && !a.admin) return null;
  return (
    <View style={styles.bloque}>
      <View style={styles.encabezado}>
        <View style={styles.raya} />
        <Text style={styles.titulo}>Para hoy</Text>
      </View>
      {perfil.rol === 'estudiante' ? <TuZona perfil={perfil} /> : <ParaAtender perfil={perfil} />}
      {perfil.rol === 'docente' ? <TusCursos perfil={perfil} /> : null}
      {perfil.rol !== 'administrador' ? <ProgresoCompacto /> : null}
    </View>
  );
}

const useStyles = crearEstilos(({ palette, card }) => ({
  bloque: { gap: 12 },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  raya: { width: 18, height: 3, borderRadius: 2, backgroundColor: palette.leaf },
  titulo: { color: palette.ink, fontSize: 20, fontFamily: fonts.extraBold, letterSpacing: -0.3 },
  flex: { flex: 1 },
  texto: { color: palette.muted, fontSize: 14, lineHeight: 20 },
  lista: { gap: 8 },
  grupo: { gap: 6 },
  fila: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14, backgroundColor: palette.tile },
  filaTexto: { flex: 1, minWidth: 0, gap: 2 },
  filaTitulo: { color: palette.ink, fontSize: 14, fontFamily: fonts.semiBold },
  filaNumero: { color: palette.ink, fontSize: 16, fontFamily: fonts.extraBold },
  filaDetalle: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  arbol: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: palette.line },
  arbolSangria: { marginLeft: 22 },
  arbolCodigo: { color: palette.ink, fontSize: 13, fontFamily: fonts.bold },
  alDia: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, backgroundColor: palette.forestSoft },
  cobertura: { gap: 6 },
  cargando: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  enlace: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  enlaceTexto: { color: palette.forest, fontSize: 13, fontFamily: fonts.bold },
  curso: { gap: 6, padding: 12, borderRadius: 14, backgroundColor: palette.tile },
  cursoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  progreso: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, ...card, borderRadius: 18 },
  progresoTexto: { gap: 6 },
  pressed: { opacity: 0.8 },
}));
