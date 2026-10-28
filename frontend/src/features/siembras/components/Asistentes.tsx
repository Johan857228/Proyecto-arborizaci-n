import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useCurso, useCursos } from '@/features/courses/api';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { siembrasService, useAsistentes, useDescargaSiembras, useGuardarAsistentes, type DatosAsistente } from '@/features/siembras/api';
import { ROLES, type Asistente, type JornadaDetalle, type RolAsistente } from '@/features/siembras/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { Casilla, ChoiceChip, Field, InlineMessage, PrimaryButton, SelectField } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import { Card, LoadingState } from '@/shared/components/UI';
import { crearEstilos, useTema } from '@/theme';

interface Fila {
  clave: string;
  usuario_id?: string;
  nombre_externo?: string;
  nombre: string;
  rol: RolAsistente;
  curso: string | null;
  arboles_sembrados: number | null;
  autoriza_certificado: boolean;
}

const EXTERNOS: RolAsistente[] = ['acudiente', 'voluntario', 'otro'];

function aFilas(asistentes: Asistente[]): Fila[] {
  return asistentes.map((a) => ({
    clave: a.usuario_id ?? `externo:${a.nombre}`, usuario_id: a.usuario_id ?? undefined,
    nombre_externo: a.usuario_id ? undefined : a.nombre, nombre: a.nombre, rol: a.rol, curso: a.curso,
    arboles_sembrados: a.arboles_sembrados, autoriza_certificado: a.autoriza_certificado,
  }));
}

function EstudiantesDelCurso({ cursoId, filas, onAgregar }: { cursoId: string; filas: Fila[]; onAgregar: (nuevas: Fila[]) => void }) {
  const curso = useCurso(cursoId);
  const ya = new Set(filas.map((f) => f.usuario_id));
  const faltan = (curso.data?.miembros ?? []).filter((m) => m.rol === 'estudiante' && !ya.has(m.usuario_id));
  if (curso.isLoading) return <LoadingState text="Cargando el curso…" />;
  return (
    <PrimaryButton
      title={faltan.length ? `Agregar los ${faltan.length} estudiantes de ${curso.data?.nombre}` : 'Ya están todos los estudiantes del curso'}
      icon="users"
      variant="secondary"
      compact
      disabled={!faltan.length}
      onPress={() => onAgregar(faltan.map((m) => ({
        clave: m.usuario_id, usuario_id: m.usuario_id, nombre: m.nombre, rol: 'estudiante', curso: curso.data?.nombre ?? null,
        arboles_sembrados: null, autoriza_certificado: false,
      })))}
    />
  );
}

/** Asistentes de la jornada y la lista para la alcaldía (certificado Siembra Vida Buen Ciudadano).
 *  Solo la ven docentes y administradores porque lleva nombres de estudiantes. */
export function Asistentes({ jornada }: { jornada: JornadaDetalle }) {
  const styles = useStyles();
  const { palette } = useTema();
  const perfil = useMiPerfil();
  const guardados = useAsistentes(jornada.id);
  const cursos = useCursos(jornada.institucion_id);
  const guardar = useGuardarAsistentes();
  const descarga = useDescargaSiembras();
  // null = sin cambios: se muestra lo guardado. Al editar, la copia local hasta guardar.
  const [editadas, setEditadas] = useState<Fila[] | null>(null);
  const [cursoId, setCursoId] = useState<string>();
  const [externo, setExterno] = useState('');
  const [rolExterno, setRolExterno] = useState<RolAsistente>('acudiente');

  const lista = editadas ?? (guardados.data ? aFilas(guardados.data) : []);
  const cambios = editadas !== null;
  const cambiar = (nuevas: Fila[]) => setEditadas(nuevas);
  const autorizados = lista.filter((f) => f.autoriza_certificado).length;

  async function enviar() {
    const datos: DatosAsistente[] = lista.map((f) => ({
      ...(f.usuario_id ? { usuario_id: f.usuario_id } : { nombre_externo: f.nombre_externo ?? f.nombre }),
      rol: f.rol, arboles_sembrados: f.arboles_sembrados, autoriza_certificado: f.autoriza_certificado,
    }));
    try {
      await guardar.mutateAsync({ jornadaId: jornada.id, asistentes: datos });
      setEditadas(null);
    } catch {
      // El error se muestra con guardar.error.
    }
  }

  function agregarExterno() {
    const nombre = externo.trim().replace(/\s+/g, ' ');
    if (nombre.length < 3 || lista.some((f) => f.clave === `externo:${nombre}`)) return;
    cambiar([...lista, { clave: `externo:${nombre}`, nombre_externo: nombre, nombre, rol: rolExterno, curso: null, arboles_sembrados: null, autoriza_certificado: false }]);
    setExterno('');
  }

  const yo = perfil.data;
  return (
    <Card
      title="Asistentes"
      subtitle="Para la lista que pide la alcaldía para el certificado Siembra Vida Buen Ciudadano. La app no expide el certificado."
      icon="users"
    >
      {guardados.isLoading ? <LoadingState /> : null}
      {guardados.error ? <InlineMessage>{getApiErrorMessage(guardados.error)}</InlineMessage> : null}
      {guardados.data ? (
        <>
          <SelectField<string>
            label="Agregar estudiantes de un curso"
            value={cursoId}
            placeholder="Elige el curso"
            options={(cursos.data ?? []).filter((c) => c.activo).map((c) => ({ label: `${c.nombre} (${c.anio})`, value: c.id }))}
            onChange={setCursoId}
          />
          {cursoId ? <EstudiantesDelCurso cursoId={cursoId} filas={lista} onAgregar={(nuevas) => cambiar([...lista, ...nuevas])} /> : null}
          {yo && !lista.some((f) => f.usuario_id === yo.usuario_id) ? (
            <PrimaryButton title="Agregarme como docente" icon="person" variant="ghost" compact onPress={() => cambiar([...lista, {
              clave: yo.usuario_id, usuario_id: yo.usuario_id, nombre: yo.nombre, rol: 'docente', curso: null, arboles_sembrados: null, autoriza_certificado: false,
            }])} />
          ) : null}
          <Text style={styles.etiqueta}>Acudientes y voluntarios (mayores de edad)</Text>
          <View style={styles.chips}>
            {EXTERNOS.map((r) => <ChoiceChip key={r} label={ROLES[r]} selected={rolExterno === r} onPress={() => setRolExterno(r)} />)}
          </View>
          <View style={styles.externo}>
            <View style={styles.flex}><Field label="Nombre completo" value={externo} onChangeText={setExterno} maxLength={120} onSubmitEditing={agregarExterno} /></View>
            <PrimaryButton title="Agregar" icon="add" compact variant="secondary" disabled={externo.trim().length < 3} onPress={agregarExterno} />
          </View>

          {lista.length ? (
            <View style={styles.lista}>
              {lista.map((f) => (
                <View key={f.clave} style={styles.fila}>
                  <View style={styles.flex}>
                    <Text style={styles.nombre}>{f.nombre}</Text>
                    <Text style={styles.meta}>{[ROLES[f.rol], f.curso].filter(Boolean).join(' · ')}</Text>
                    <Casilla
                      checked={f.autoriza_certificado}
                      onChange={(v) => cambiar(lista.map((x) => (x.clave === f.clave ? { ...x, autoriza_certificado: v } : x)))}
                    >
                      {f.rol === 'estudiante'
                        ? 'El acudiente firmó la autorización para entregar el nombre a la alcaldía'
                        : 'Aceptó que su nombre vaya en la lista para la alcaldía'}
                    </Casilla>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Quitar a ${f.nombre}`} hitSlop={8}
                    onPress={() => cambiar(lista.filter((x) => x.clave !== f.clave))}>
                    <Icon name="close" size={18} color={palette.muted} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.meta}>Aún no hay asistentes.</Text>
          )}
          <Text style={styles.meta}>
            Marca la autorización de un estudiante solo si tienes el formato firmado por su acudiente: el soporte queda en la institución.
            Quien no tenga autorización cuenta en el total, pero su nombre no sale en la lista.
          </Text>
          {guardar.error ? <InlineMessage>{getApiErrorMessage(guardar.error)}</InlineMessage> : null}
          {cambios ? <PrimaryButton title={`Guardar asistentes (${lista.length})`} icon="check" loading={guardar.isPending} onPress={() => void enviar()} /> : null}

          {!cambios && lista.length ? (
            <View style={styles.descargas}>
              <Text style={styles.meta}>{autorizados} de {lista.length} con autorización: {autorizados === 1 ? 'sale' : 'salen'} en la lista.</Text>
              {descarga.error ? <InlineMessage>{getApiErrorMessage(descarga.error)}</InlineMessage> : null}
              {descarga.data && !descarga.isPending ? <InlineMessage tone="success">Listo: {descarga.data.nombre}.</InlineMessage> : null}
              <View style={styles.botones}>
                <PrimaryButton title="Lista para la alcaldía (PDF)" icon="download" loading={descarga.isPending}
                  onPress={() => descarga.mutate(() => siembrasService.lista(jornada.id, 'pdf'))} />
                <PrimaryButton title="CSV" icon="download" variant="secondary" disabled={descarga.isPending}
                  onPress={() => descarga.mutate(() => siembrasService.lista(jornada.id, 'csv'))} />
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  flex: { flex: 1 },
  lista: { gap: 6 },
  fila: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.line },
  nombre: { color: palette.ink, fontSize: 14, fontFamily: fonts.bold },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  etiqueta: { color: palette.muted, fontSize: 12, fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  externo: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  descargas: { gap: 8 },
  botones: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
}));
