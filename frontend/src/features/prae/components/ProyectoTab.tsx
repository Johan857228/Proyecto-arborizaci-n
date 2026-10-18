import { useState } from 'react';
import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useEditarPrae } from '@/features/prae/api';
import { nulo, TEMAS, type Prae, type Tema } from '@/features/prae/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { ChoiceChip, Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Card } from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

function Bloque({ titulo, texto, vacio = 'Sin diligenciar.' }: { titulo: string; texto?: string | null; vacio?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.bloque}>
      <Text style={styles.etiqueta}>{titulo}</Text>
      <Text style={texto ? styles.texto : styles.vacio}>{texto || vacio}</Text>
    </View>
  );
}

function Formulario({ prae, onListo }: { prae: Prae; onListo: () => void }) {
  const styles = useStyles();
  const editar = useEditarPrae();
  const [tema, setTema] = useState<Tema>(prae.tema);
  const [temaOtro, setTemaOtro] = useState(prae.tema_otro ?? '');
  const [titulo, setTitulo] = useState(prae.titulo);
  const [problema, setProblema] = useState(prae.problema);
  const [diagnostico, setDiagnostico] = useState(prae.diagnostico ?? '');
  const [objetivo, setObjetivo] = useState(prae.objetivo_general ?? '');
  const [especificos, setEspecificos] = useState(prae.objetivos_especificos.join('\n'));
  const [comite, setComite] = useState(prae.comite ?? '');
  const [error, setError] = useState<string>();

  async function guardar() {
    setError(undefined);
    if (titulo.trim().length < 5) return setError('Escribe un título (mínimo 5 caracteres).');
    if (problema.trim().length < 10) return setError('Describe el problema ambiental (mínimo 10 caracteres).');
    if (tema === 'otro' && !temaOtro.trim()) return setError('Escribe el tema del PRAE.');
    try {
      await editar.mutateAsync({
        id: prae.id,
        cambios: {
          tema,
          tema_otro: tema === 'otro' ? nulo(temaOtro) : null,
          titulo: titulo.trim(),
          problema: problema.trim(),
          diagnostico: nulo(diagnostico),
          objetivo_general: nulo(objetivo),
          objetivos_especificos: especificos.split('\n').map((o) => o.trim()).filter(Boolean),
          comite: nulo(comite),
        },
      });
      onListo();
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  return (
    <Card title="Editar el proyecto" icon="edit">
      <Text style={styles.etiqueta}>Tema</Text>
      <View style={styles.chips}>
        {TEMAS.map((t) => <ChoiceChip key={t.valor} label={t.etiqueta} selected={tema === t.valor} onPress={() => setTema(t.valor)} />)}
      </View>
      {tema === 'otro' ? <Field label="¿Cuál?" value={temaOtro} onChangeText={setTemaOtro} maxLength={80} /> : null}
      <Field label="Título del proyecto" value={titulo} onChangeText={setTitulo} maxLength={150} />
      <Field label="Problema ambiental" value={problema} onChangeText={setProblema} multiline maxLength={2000} />
      <Field label="Diagnóstico ambiental local" value={diagnostico} onChangeText={setDiagnostico} multiline maxLength={5000}
        hint="Qué se observó, cómo se midió y con quién: encuestas, recorridos, datos del arbolado…" />
      <Field label="Objetivo general" value={objetivo} onChangeText={setObjetivo} multiline maxLength={1000} />
      <Field label="Objetivos específicos" value={especificos} onChangeText={setEspecificos} multiline hint="Uno por línea, máximo 10." />
      <Field label="Comité ambiental y responsables" value={comite} onChangeText={setComite} multiline maxLength={2000}
        hint="Cargos, cursos y aliados. Para los estudiantes basta con el curso o el cargo." />
      {error ? <InlineMessage>{error}</InlineMessage> : null}
      <PrimaryButton title="Guardar" icon="check" loading={editar.isPending} onPress={() => void guardar()} />
      <PrimaryButton title="Cancelar" variant="ghost" onPress={onListo} />
    </Card>
  );
}

/** Problema, diagnóstico, objetivos y comité del PRAE. */
export function ProyectoTab({ prae }: { prae: Prae }) {
  const styles = useStyles();
  const [editando, setEditando] = useState(false);
  if (editando) return <Formulario prae={prae} onListo={() => setEditando(false)} />;
  return (
    <Card title="Proyecto" icon="leaf" action={prae.puede_editar ? <PrimaryButton title="Editar" icon="edit" variant="ghost" compact onPress={() => setEditando(true)} /> : undefined}>
      <Bloque titulo="Problema ambiental" texto={prae.problema} />
      <Bloque titulo="Diagnóstico ambiental local" texto={prae.diagnostico} />
      <Bloque titulo="Objetivo general" texto={prae.objetivo_general} />
      <View style={styles.bloque}>
        <Text style={styles.etiqueta}>Objetivos específicos</Text>
        {prae.objetivos_especificos.length ? (
          prae.objetivos_especificos.map((o) => <Text key={o} style={styles.texto}>• {o}</Text>)
        ) : (
          <Text style={styles.vacio}>Sin diligenciar.</Text>
        )}
      </View>
      <Bloque titulo="Comité ambiental y responsables" texto={prae.comite} />
    </Card>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  bloque: { gap: 4, paddingVertical: 4 },
  etiqueta: { color: palette.muted, fontSize: 12, fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 0.6 },
  texto: { color: palette.ink, fontSize: 14, lineHeight: 21 },
  vacio: { color: palette.muted, fontSize: 14, fontStyle: 'italic' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
}));
