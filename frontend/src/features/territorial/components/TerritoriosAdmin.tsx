import { useState } from 'react';
import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useCatalogs } from '@/features/catalogs/hooks/useCatalogs';
import { useUsuarios } from '@/features/perfil/hooks/usePerfil';
import { useBorrarTerritorio, useGuardarTerritorio, useMiembros } from '@/features/territorial/api';
import { divipolasValidas, separarDivipolas, TIPOS, type Territorio, type TipoTerritorio } from '@/features/territorial/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { ChoiceChip, Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Card, ConfirmButton } from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

function Formulario({ territorio, onListo }: { territorio?: Territorio; onListo: () => void }) {
  const styles = useStyles();
  const catalogos = useCatalogs();
  const guardar = useGuardarTerritorio();
  const [nombre, setNombre] = useState(territorio?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoTerritorio>(territorio?.tipo ?? 'secretaria_educacion');
  const [divipolas, setDivipolas] = useState((territorio?.divipolas ?? []).join(', '));
  const [sueltas, setSueltas] = useState<string[]>(territorio?.institucion_ids ?? []);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    const lista = separarDivipolas(divipolas);
    if (nombre.trim().length < 3) return setError('Ponle un nombre al territorio (mínimo 3 caracteres).');
    if (!divipolasValidas(lista)) return setError('Cada municipio va con su código DIVIPOLA de 5 dígitos (Valledupar: 20001).');
    if (!lista.length && !sueltas.length) return setError('Agrega al menos un municipio o un colegio.');
    setError(null);
    try {
      await guardar.mutateAsync({ id: territorio?.id, datos: { nombre: nombre.trim(), tipo, divipolas: lista, institucion_ids: sueltas } });
      onListo();
    } catch {
      // El error se muestra con guardar.error.
    }
  }

  return (
    <View style={styles.formulario}>
      <Field label="Nombre" value={nombre} onChangeText={setNombre} maxLength={160} placeholder="Ej.: Secretaría de Educación de Valledupar" />
      <View style={styles.chips}>
        {(Object.keys(TIPOS) as TipoTerritorio[]).map((t) => <ChoiceChip key={t} label={TIPOS[t]} selected={tipo === t} onPress={() => setTipo(t)} />)}
      </View>
      <Field label="Municipios (código DIVIPOLA)" value={divipolas} onChangeText={setDivipolas} placeholder="20001, 20011" autoCapitalize="none"
        hint="Todos los colegios con ese DIVIPOLA entran solos. Se asigna en Exportar → Instituciones." />
      <Text style={styles.etiqueta}>Colegios sueltos (además de los municipios)</Text>
      <View style={styles.chips}>
        {(catalogos.data?.instituciones ?? []).map((i) => (
          <ChoiceChip key={i.id} label={i.nombre_corto} selected={sueltas.includes(i.id)}
            onPress={() => setSueltas(sueltas.includes(i.id) ? sueltas.filter((x) => x !== i.id) : [...sueltas, i.id])} />
        ))}
      </View>
      {error ? <InlineMessage>{error}</InlineMessage> : null}
      {guardar.error ? <InlineMessage>{getApiErrorMessage(guardar.error)}</InlineMessage> : null}
      <View style={styles.botones}>
        <PrimaryButton title={territorio ? 'Guardar cambios' : 'Crear territorio'} icon="check" compact loading={guardar.isPending} onPress={() => void enviar()} />
        <PrimaryButton title="Cancelar" variant="ghost" compact onPress={onListo} />
      </View>
    </View>
  );
}

function Miembros({ territorio }: { territorio: Territorio }) {
  const styles = useStyles();
  const usuarios = useUsuarios();
  const miembros = useMiembros();
  const funcionarios = (usuarios.data ?? []).filter((u) => u.rol === 'territorial' && u.activo);
  const actuales = new Set(territorio.miembros.map((m) => m.usuario_id));
  const alternar = (id: string) => {
    const nuevos = actuales.has(id) ? [...actuales].filter((x) => x !== id) : [...actuales, id];
    miembros.mutate({ id: territorio.id, usuarioIds: nuevos });
  };
  return (
    <View style={styles.miembros}>
      <Text style={styles.etiqueta}>Funcionarios que lo ven</Text>
      {funcionarios.length ? (
        <View style={styles.chips}>
          {funcionarios.map((u) => <ChoiceChip key={u.usuario_id} label={u.nombre} selected={actuales.has(u.usuario_id)} onPress={() => alternar(u.usuario_id)} />)}
        </View>
      ) : (
        <Text style={styles.meta}>Aún no hay cuentas con el rol Funcionario territorial. Asígnalo en Usuarios a la persona de la Secretaría o de la autoridad ambiental.</Text>
      )}
      {miembros.error ? <InlineMessage>{getApiErrorMessage(miembros.error)}</InlineMessage> : null}
    </View>
  );
}

/** Territorios (municipios o colegios) y sus funcionarios: solo el administrador. */
export function TerritoriosAdmin({ territorios }: { territorios: Territorio[] }) {
  const styles = useStyles();
  const borrar = useBorrarTerritorio();
  const [editando, setEditando] = useState<string | null>(null);
  return (
    <Card title="Territorios" subtitle="Qué colegios ve cada Secretaría, autoridad ambiental o Gobernación." icon="territorio">
      {territorios.map((t) => (
        <View key={t.id} style={styles.territorio}>
          <Text style={styles.nombre}>{t.nombre}</Text>
          <Text style={styles.meta}>
            {TIPOS[t.tipo]} · {t.instituciones} {t.instituciones === 1 ? 'colegio' : 'colegios'}
            {t.divipolas.length ? ` · municipios ${t.divipolas.join(', ')}` : ''}
          </Text>
          {editando === t.id ? <Formulario territorio={t} onListo={() => setEditando(null)} /> : (
            <>
              <Miembros territorio={t} />
              <View style={styles.botones}>
                <PrimaryButton title="Editar" icon="edit" compact variant="secondary" onPress={() => setEditando(t.id)} />
                <ConfirmButton title="Borrar" confirmTitle="¿Borrar el territorio? Sus funcionarios dejarán de verlo." loading={borrar.isPending} onConfirm={() => borrar.mutate(t.id)} />
              </View>
            </>
          )}
        </View>
      ))}
      {borrar.error ? <InlineMessage>{getApiErrorMessage(borrar.error)}</InlineMessage> : null}
      {editando === 'nuevo' ? <Formulario onListo={() => setEditando(null)} /> : (
        <PrimaryButton title="Nuevo territorio" icon="add" variant="secondary" onPress={() => setEditando('nuevo')} />
      )}
    </Card>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  territorio: { gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.line },
  nombre: { color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  etiqueta: { color: palette.muted, fontSize: 12, fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 0.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  botones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  formulario: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: palette.tile },
  miembros: { gap: 6 },
}));
