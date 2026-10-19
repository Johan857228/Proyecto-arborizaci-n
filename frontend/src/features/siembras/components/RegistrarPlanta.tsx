import { useState } from 'react';
import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useCatalogs } from '@/features/catalogs/hooks/useCatalogs';
import { useCurso, useCursos } from '@/features/courses/api';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { useRegistrarPlanta } from '@/features/siembras/api';
import { PADRINOS, plantaFormSchema, vacio, type JornadaDetalle, type PadrinoTipo } from '@/features/siembras/schemas';
import { useCaptureLocation } from '@/features/trees/hooks/useCaptureLocation';
import { getApiErrorMessage } from '@/services/api/client';
import { ChoiceChip, Field, InlineMessage, PrimaryButton, SelectField } from '@/shared/components/FormControls';
import { Card, NumberField } from '@/shared/components/UI';
import { formatNumero, hoyIso, parsearNumero } from '@/shared/format';
import { crearEstilos } from '@/theme';

const OTRA = -1;

function EstudiantesDelCurso({ cursoId, value, onChange }: { cursoId: string; value?: string; onChange: (id: string) => void }) {
  const curso = useCurso(cursoId);
  const estudiantes = (curso.data?.miembros ?? []).filter((m) => m.rol === 'estudiante');
  return (
    <SelectField<string>
      label="Estudiante padrino"
      value={value}
      placeholder={curso.isLoading ? 'Cargando el curso…' : 'Elige el estudiante'}
      options={estudiantes.map((m) => ({ label: m.nombre, value: m.usuario_id }))}
      onChange={onChange}
    />
  );
}

/** Registro de una plántula en el sitio de la siembra. Después de guardar se conservan especie,
 *  vivero y padrino para registrar la siguiente más rápido. */
export function RegistrarPlanta({ jornada }: { jornada: JornadaDetalle }) {
  const styles = useStyles();
  const catalogos = useCatalogs();
  const perfil = useMiPerfil();
  const cursos = useCursos(jornada.institucion_id);
  const registrar = useRegistrarPlanta();
  const gps = useCaptureLocation();
  const hoy = hoyIso();
  const [especie, setEspecie] = useState<number>();
  const [especieOtra, setEspecieOtra] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [precision, setPrecision] = useState<number | null>(null);
  const [fecha, setFecha] = useState(jornada.fecha <= hoy ? jornada.fecha : hoy);
  const [vivero, setVivero] = useState('');
  const [ica, setIca] = useState('');
  const [altura, setAltura] = useState<number>();
  const [padrinoTipo, setPadrinoTipo] = useState<PadrinoTipo>('curso');
  const [cursoId, setCursoId] = useState<string>();
  const [usuarioId, setUsuarioId] = useState<string>();
  const [padrinoNombre, setPadrinoNombre] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [registradas, setRegistradas] = useState(0);

  const especies = catalogos.data?.especies ?? [];
  const elegida = especies.find((e) => e.id === especie);

  async function tomarGps() {
    const punto = await gps.capture();
    if (punto) {
      setLat(String(Number(punto.lat.toFixed(6))));
      setLng(String(Number(punto.lng.toFixed(6))));
      setPrecision(punto.accuracy != null ? Math.round(punto.accuracy * 10) / 10 : null);
    }
  }

  async function enviar() {
    const v = plantaFormSchema(hoy).safeParse({
      especie_id: especie === OTRA ? undefined : especie, especie_otra: especie === OTRA ? especieOtra : '',
      lat: parsearNumero(lat), lng: parsearNumero(lng), fecha: fecha.trim(), vivero, vivero_registro_ica: ica, altura_inicial_cm: altura,
      padrino_tipo: padrinoTipo, padrino_curso_id: padrinoTipo === 'curso' || padrinoTipo === 'estudiante' ? cursoId : undefined,
      padrino_usuario_id: padrinoTipo === 'docente' ? perfil.data?.usuario_id : padrinoTipo === 'estudiante' ? usuarioId : undefined,
      padrino_nombre: ['familia', 'empresa', 'otro'].includes(padrinoTipo) ? padrinoNombre : '',
    });
    if (!v.success) {
      setErrores(Object.fromEntries(v.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrores({});
    const d = v.data;
    try {
      await registrar.mutateAsync({
        jornadaId: jornada.id,
        datos: {
          especie_id: d.especie_id ?? null, especie_otra: vacio(d.especie_otra), lat: d.lat, lng: d.lng, precision_gps_m: precision,
          fecha: d.fecha, vivero: vacio(d.vivero), vivero_registro_ica: vacio(d.vivero_registro_ica), altura_inicial_cm: d.altura_inicial_cm ?? null,
          padrino_tipo: d.padrino_tipo, padrino_curso_id: d.padrino_tipo === 'curso' ? d.padrino_curso_id ?? null : null,
          padrino_usuario_id: d.padrino_usuario_id ?? null, padrino_nombre: vacio(d.padrino_nombre),
        },
      });
      // La siguiente plántula queda en otro sitio: se borran las coordenadas, no la especie ni el padrino.
      setLat('');
      setLng('');
      setPrecision(null);
      setAltura(undefined);
      setRegistradas((n) => n + 1);
    } catch {
      // El error se muestra con registrar.error.
    }
  }

  return (
    <Card title="Registrar plántula" subtitle="Una por una, con el GPS junto a la plántula: así queda georreferenciada como pide la Resolución 1491." icon="siembra">
      <SelectField<number>
        label="Especie"
        value={especie}
        placeholder="Elige la especie"
        options={[...especies.map((e) => ({ label: `${e.nombre_comun} (${e.nombre_cientifico})`, value: e.id })), { label: 'Otra especie', value: OTRA }]}
        onChange={setEspecie}
        error={errores.especie_id}
      />
      {especie === OTRA ? <Field label="¿Cuál especie?" value={especieOtra} onChangeText={setEspecieOtra} maxLength={80} /> : null}
      {elegida?.origen === 'exotica' ? (
        <InlineMessage tone="warning">Es una especie exótica: para las siembras de la Ley del Árbol se piden especies nativas.</InlineMessage>
      ) : null}

      <Text style={styles.etiqueta}>Ubicación</Text>
      <PrimaryButton title={lat && lng ? 'Volver a tomar el GPS' : 'Tomar ubicación con el GPS'} icon="myLocation" variant="secondary" loading={gps.loading} onPress={() => void tomarGps()} />
      {gps.error ? <InlineMessage>{gps.error}</InlineMessage> : null}
      <View style={styles.dos}>
        <View style={styles.celda}><Field label="Latitud" value={lat} onChangeText={setLat} keyboardType="numbers-and-punctuation" placeholder="10.4641" error={errores.lat} /></View>
        <View style={styles.celda}><Field label="Longitud" value={lng} onChangeText={setLng} keyboardType="numbers-and-punctuation" placeholder="-73.2562" error={errores.lng} /></View>
      </View>
      {precision != null ? (
        <Text style={[styles.meta, precision > 15 && styles.alerta]}>
          Precisión del GPS: {formatNumero(precision, 1)} m{precision > 15 ? '. Es baja: espera unos segundos al aire libre y vuelve a tomarla.' : '.'}
        </Text>
      ) : null}

      <View style={styles.dos}>
        <View style={styles.celda}><Field label="Fecha de siembra" value={fecha} onChangeText={setFecha} placeholder="AAAA-MM-DD" autoCapitalize="none" error={errores.fecha} /></View>
        <View style={styles.celda}><NumberField label="Altura al sembrar (cm)" value={altura} onChange={setAltura} error={errores.altura_inicial_cm} /></View>
      </View>
      <View style={styles.dos}>
        <View style={styles.celda}><Field label="Vivero de origen" value={vivero} onChangeText={setVivero} maxLength={120} /></View>
        <View style={styles.celda}><Field label="Registro ICA del vivero" value={ica} onChangeText={setIca} maxLength={40} autoCapitalize="characters" /></View>
      </View>

      <Text style={styles.etiqueta}>Padrino (quién la cuida)</Text>
      <View style={styles.chips}>
        {(Object.keys(PADRINOS) as PadrinoTipo[]).map((p) => <ChoiceChip key={p} label={p === 'docente' ? 'Yo (docente)' : PADRINOS[p]} selected={padrinoTipo === p} onPress={() => setPadrinoTipo(p)} />)}
      </View>
      {padrinoTipo === 'curso' || padrinoTipo === 'estudiante' ? (
        <SelectField<string>
          label="Curso"
          value={cursoId}
          placeholder="Elige el curso"
          options={(cursos.data ?? []).filter((c) => c.activo).map((c) => ({ label: `${c.nombre} (${c.anio})`, value: c.id }))}
          onChange={(v) => { setCursoId(v); setUsuarioId(undefined); }}
          error={errores.padrino_curso_id}
        />
      ) : null}
      {padrinoTipo === 'estudiante' && cursoId ? <EstudiantesDelCurso cursoId={cursoId} value={usuarioId} onChange={setUsuarioId} /> : null}
      {errores.padrino_usuario_id ? <InlineMessage>{errores.padrino_usuario_id}</InlineMessage> : null}
      {['familia', 'empresa', 'otro'].includes(padrinoTipo) ? (
        <Field label={padrinoTipo === 'empresa' ? 'Empresa' : padrinoTipo === 'familia' ? 'Familia' : 'Quién'} value={padrinoNombre} onChangeText={setPadrinoNombre} maxLength={120}
          placeholder={padrinoTipo === 'familia' ? 'Ej.: Familia Pérez' : undefined} error={errores.padrino_nombre} />
      ) : null}

      {registrar.error ? <InlineMessage>{getApiErrorMessage(registrar.error)}</InlineMessage> : null}
      {registradas && !registrar.isPending ? (
        <InlineMessage tone="success">
          {registradas === 1 ? 'Plántula registrada.' : `${registradas} plántulas registradas.`} Toma el GPS junto a la siguiente: la especie y el padrino se conservan.
        </InlineMessage>
      ) : null}
      <PrimaryButton title="Registrar plántula" icon="check" loading={registrar.isPending} onPress={() => void enviar()} />
    </Card>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  etiqueta: { color: palette.muted, fontSize: 12, fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  dos: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
  celda: { flexGrow: 1, flexBasis: 150 },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17, marginBottom: 8 },
  alerta: { color: palette.amber },
}));
