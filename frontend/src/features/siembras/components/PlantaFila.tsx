import { useState } from 'react';
import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useBorrarControl, useBorrarPlanta, useRegistrarControl } from '@/features/siembras/api';
import {
  controlFormSchema,
  ESTADOS_CONTROL,
  ESTADOS_PLANTA,
  HITOS,
  SIGUIENTE,
  textoHito,
  vacio,
  type EstadoControl,
  type Hito,
  type PadrinoTipo,
  type Siembra,
} from '@/features/siembras/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { Casilla, ChoiceChip, Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Badge, ConfirmButton, NumberField } from '@/shared/components/UI';
import { formatFecha, formatNumero, hoyIso } from '@/shared/format';
import { crearEstilos } from '@/theme';

const PADRINO_CORTO: Record<PadrinoTipo, string> = { curso: 'Curso', estudiante: 'Estudiante', docente: 'Docente', familia: 'Familia', empresa: 'Empresa', otro: 'Padrino' };

function NuevoControl({ siembra, onListo }: { siembra: Siembra; onListo: () => void }) {
  const styles = useStyles();
  const registrar = useRegistrarControl();
  const hechos = new Set(siembra.controles.map((c) => c.hito_meses));
  const [hito, setHito] = useState<Hito | undefined>((siembra.siguiente?.hito_meses as Hito | undefined) ?? undefined);
  const [fecha, setFecha] = useState(hoyIso());
  const [estado, setEstado] = useState<EstadoControl>();
  const [altura, setAltura] = useState<number>();
  const [mantenimiento, setMantenimiento] = useState(false);
  const [observaciones, setObservaciones] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});

  async function enviar() {
    const v = controlFormSchema(hoyIso(), siembra.fecha).safeParse({ hito_meses: hito, fecha: fecha.trim(), estado, altura_cm: altura, mantenimiento, observaciones });
    if (!v.success) {
      setErrores(Object.fromEntries(v.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrores({});
    const d = v.data;
    try {
      await registrar.mutateAsync({
        siembraId: siembra.id,
        datos: { hito_meses: d.hito_meses ?? null, fecha: d.fecha, estado: d.estado, altura_cm: d.altura_cm ?? null, mantenimiento: d.mantenimiento, observaciones: vacio(d.observaciones) },
      });
      onListo();
    } catch {
      // El error se muestra con registrar.error.
    }
  }

  return (
    <View style={styles.formulario}>
      <Text style={styles.etiqueta}>¿Qué control es?</Text>
      <View style={styles.chips}>
        {HITOS.filter((h) => !hechos.has(h)).map((h) => <ChoiceChip key={h} label={`${h} meses`} selected={hito === h} onPress={() => setHito(h)} />)}
        <ChoiceChip label="Control extra" selected={hito === undefined} onPress={() => setHito(undefined)} />
      </View>
      <Text style={styles.etiqueta}>¿Cómo está?</Text>
      <View style={styles.chips}>
        {(Object.keys(ESTADOS_CONTROL) as EstadoControl[]).map((e) => <ChoiceChip key={e} label={ESTADOS_CONTROL[e].etiqueta} selected={estado === e} onPress={() => setEstado(e)} />)}
      </View>
      {errores.estado ? <InlineMessage>{errores.estado}</InlineMessage> : null}
      <View style={styles.dos}>
        <View style={styles.celda}><Field label="Fecha del control" value={fecha} onChangeText={setFecha} placeholder="AAAA-MM-DD" autoCapitalize="none" error={errores.fecha} /></View>
        <View style={styles.celda}><NumberField label="Altura (cm)" value={altura} onChange={setAltura} error={errores.altura_cm} /></View>
      </View>
      <Casilla checked={mantenimiento} onChange={setMantenimiento}>Se hizo mantenimiento (riego, deshierbe, tutor o protección)</Casilla>
      <Field label="Observaciones" value={observaciones} onChangeText={setObservaciones} multiline maxLength={500} placeholder="Hojas, plagas, daños, si hay que reponerla" />
      {registrar.error ? <InlineMessage>{getApiErrorMessage(registrar.error)}</InlineMessage> : null}
      <PrimaryButton title="Guardar control" icon="check" compact loading={registrar.isPending} onPress={() => void enviar()} />
    </View>
  );
}

/** Una plántula: estado, próximo control, historial y el formulario para registrar el control. */
export function PlantaFila({ siembra, editable }: { siembra: Siembra; editable: boolean }) {
  const styles = useStyles();
  const [abierto, setAbierto] = useState(false);
  const borrar = useBorrarPlanta();
  const borrarControl = useBorrarControl();
  const s = siembra;
  const estado = ESTADOS_PLANTA[s.estado];
  return (
    <View style={styles.planta}>
      <View style={styles.cabeza}>
        <View style={styles.flex}>
          <Text style={styles.titulo}>{s.especie}{s.nombre_cientifico ? ` · ${s.nombre_cientifico}` : ''}</Text>
          <Text style={styles.meta}>
            {[`Sembrada el ${formatFecha(s.fecha)}`, s.padrino ? `${PADRINO_CORTO[s.padrino_tipo]}: ${s.padrino}` : null,
              s.vivero ? `Vivero: ${s.vivero}${s.vivero_registro_ica ? ` (registro ICA ${s.vivero_registro_ica})` : ''}` : null].filter(Boolean).join(' · ')}
          </Text>
          {/* Coordenadas con punto decimal, como las muestra un GPS: con coma se confundirían con el separador. */}
          <Text style={styles.coordenadas}>{s.lat.toFixed(5)}, {s.lng.toFixed(5)}{s.precision_gps_m != null ? ` · ±${formatNumero(s.precision_gps_m, 0)} m` : ''}</Text>
        </View>
        <View style={styles.insignias}>
          <Badge label={estado.etiqueta} tono={estado.tono} />
          {s.origen ? <Badge label={s.origen === 'nativa' ? 'Nativa' : 'Exótica'} tono={s.origen === 'nativa' ? 'sano' : 'riesgo'} /> : null}
        </View>
      </View>
      {s.siguiente ? (
        <Text style={styles.siguiente}>
          Control de {s.siguiente.hito_meses} meses: {formatFecha(s.siguiente.fecha)} · <Text style={styles.negrita}>{SIGUIENTE[s.siguiente.estado].etiqueta}</Text>
        </Text>
      ) : s.estado === 'viva' ? <Text style={styles.siguiente}>Terminó los 2 años de seguimiento.</Text> : null}
      {s.controles.length ? (
        <View style={styles.controles}>
          {s.controles.map((c) => (
            <View key={c.id} style={styles.control}>
              <Text style={[styles.meta, styles.flex]}>
                {textoHito(c.hito_meses)} · {formatFecha(c.fecha)} · {ESTADOS_CONTROL[c.estado].etiqueta}
                {c.altura_cm != null ? ` · ${formatNumero(c.altura_cm, 0)} cm` : ''}{c.mantenimiento ? ' · mantenimiento' : ''}
                {c.observaciones ? ` · ${c.observaciones}` : ''}
              </Text>
              {c.puede_borrar ? <ConfirmButton title="Quitar" confirmTitle="¿Quitar este control?" loading={borrarControl.isPending} onConfirm={() => borrarControl.mutate(c.id)} /> : null}
            </View>
          ))}
        </View>
      ) : null}
      {abierto ? <NuevoControl siembra={s} onListo={() => setAbierto(false)} /> : null}
      <View style={styles.acciones}>
        {s.estado !== 'muerta' || s.controles.length === 0 ? (
          <PrimaryButton title={abierto ? 'Cancelar' : 'Registrar control'} icon={abierto ? 'close' : 'review'} compact variant={abierto ? 'ghost' : 'secondary'} onPress={() => setAbierto(!abierto)} />
        ) : null}
        {editable ? <ConfirmButton title="Quitar plántula" confirmTitle="¿Quitar la plántula y sus controles?" loading={borrar.isPending} onConfirm={() => borrar.mutate(s.id)} /> : null}
      </View>
      {borrar.error ? <InlineMessage>{getApiErrorMessage(borrar.error)}</InlineMessage> : null}
    </View>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  flex: { flex: 1 },
  planta: { gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.line },
  cabeza: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8 },
  titulo: { color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  coordenadas: { color: palette.muted, fontSize: 11, lineHeight: 16 },
  insignias: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  siguiente: { color: palette.ink, fontSize: 13, lineHeight: 18 },
  negrita: { fontFamily: fonts.bold },
  controles: { gap: 4, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: palette.line },
  control: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  formulario: { gap: 4, padding: 12, borderRadius: 12, backgroundColor: palette.tile },
  etiqueta: { color: palette.muted, fontSize: 12, fontFamily: fonts.bold, textTransform: 'uppercase', letterSpacing: 0.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  dos: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
  celda: { flexGrow: 1, flexBasis: 150 },
}));
