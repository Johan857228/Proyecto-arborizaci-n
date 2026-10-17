import { Text, View } from 'react-native';
import { useController, useWatch, type Control, type FieldValues, type Path } from 'react-hook-form';

import { fonts } from '@/config/constants';
import {
  COBERTURA_BEJUCOS,
  ENFERMEDADES,
  EPIFITAS,
  HEMIPARASITAS,
  INSECTOS,
  PARTES,
  PARTES_ARBOL,
  SEVERIDAD,
  TIPOS_ENFERMEDAD,
  TIPOS_EPIFITA,
  TIPOS_HEMIPARASITA,
  TIPOS_INSECTO,
  type TipoEpifita,
} from '@/features/inspections/bioticos';
import { ChoiceChip, Field, SelectField } from '@/shared/components/FormControls';
import { NumberField } from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

const NINGUNO = 'ninguno';

/**
 * Agentes bióticos FB-01 a FB-06, dentro del formulario de registro y del de inspección.
 * Funciona con cualquier formulario de react-hook-form que tenga los campos de `CamposBioticos`.
 */
export function BioticAgentsFields<T extends FieldValues>({
  control,
  codigoArbol,
}: {
  control: Control<T>;
  /** Para sugerir el rótulo de la muestra de laboratorio. */
  codigoArbol?: string;
}) {
  const styles = useStyles();
  const campo = (nombre: string) => nombre as Path<T>;
  const insecto = useWatch({ control, name: campo('insectos') }) as string | null;
  const enfermedad = useWatch({ control, name: campo('enfermedad') }) as string | null;
  const muestra = useWatch({ control, name: campo('muestra_lab') }) as boolean;
  const hemiparasita = useWatch({ control, name: campo('hemiparasitas') }) as string | null;
  // El porcentaje se vacía al quitar la hemiparásita para que no quede un dato oculto que no valide.
  const porcentaje = useController({ control, name: campo('pct_hemiparasitas') });

  return (
    <View style={styles.bloque}>
      <View style={styles.encabezado}>
        <Text style={styles.titulo}>Agentes bióticos</Text>
        <Text style={styles.ayuda}>Registra lo que observes en esta visita. Lo que no veas, déjalo en Ninguno.</Text>
      </View>

      <Variable codigo="FB-01" nombre="Insectos" responsable="Ambos grupos">
        <Selector
          control={control}
          nombre={campo('insectos')}
          etiqueta="Tipo de insecto"
          vacio="Ninguno observado"
          opciones={TIPOS_INSECTO.map((v) => ({ label: INSECTOS[v].nombre, value: v }))}
        />
        {insecto ? (
          <>
            <Text style={styles.senal}>{INSECTOS[insecto as keyof typeof INSECTOS]?.senal} Fotografía el insecto y el daño.</Text>
            <Selector
              control={control}
              nombre={campo('insectos_parte')}
              etiqueta="Parte afectada"
              opciones={PARTES_ARBOL.map((v) => ({ label: PARTES[v], value: v }))}
            />
            <Escala control={control} nombre={campo('insectos_sev')} etiqueta="Severidad" niveles={SEVERIDAD} />
          </>
        ) : null}
      </Variable>

      <Variable codigo="FB-02" nombre="Enfermedad sospechada" responsable="6.º semestre">
        <Selector
          control={control}
          nombre={campo('enfermedad')}
          etiqueta="Causa probable"
          vacio="Ninguna observada"
          opciones={TIPOS_ENFERMEDAD.map((v) => ({ label: ENFERMEDADES[v].nombre, value: v }))}
        />
        {enfermedad ? (
          <>
            <Text style={styles.senal}>{ENFERMEDADES[enfermedad as keyof typeof ENFERMEDADES]?.senal}</Text>
            <Selector
              control={control}
              nombre={campo('enfermedad_parte')}
              etiqueta="Parte afectada"
              opciones={PARTES_ARBOL.map((v) => ({ label: PARTES[v], value: v }))}
            />
            <Escala control={control} nombre={campo('enfermedad_sev')} etiqueta="Severidad" niveles={SEVERIDAD} />
          </>
        ) : null}
      </Variable>

      <Variable codigo="FB-03" nombre="Muestra de laboratorio" responsable="6.º semestre">
        <SiNo control={control} nombre={campo('muestra_lab')} etiqueta="¿Se tomó muestra?" />
        {muestra ? (
          <>
            <Text style={styles.senal}>
              Corta hojas o corteza con daño, guárdalas en bolsa resellable con papel húmedo y rotúlalas con el código del árbol.
            </Text>
            <Texto
              control={control}
              nombre={campo('cod_muestra_lab')}
              etiqueta="Código de la muestra"
              placeholder={codigoArbol ? `${codigoArbol}-M1` : 'IE001-0001-M1'}
            />
          </>
        ) : null}
      </Variable>

      <Variable codigo="FB-04" nombre="Hemiparásitas" responsable="Ambos grupos">
        <Selector
          control={control}
          nombre={campo('hemiparasitas')}
          etiqueta="Tipo"
          vacio="Ninguna observada"
          opciones={TIPOS_HEMIPARASITA.map((v) => ({ label: HEMIPARASITAS[v].nombre, value: v }))}
          alVaciar={() => porcentaje.field.onChange(undefined)}
        />
        {hemiparasita ? (
          <>
            <Text style={styles.senal}>{HEMIPARASITAS[hemiparasita as keyof typeof HEMIPARASITAS]?.senal}</Text>
            <NumberField
              label="Porcentaje de la copa cubierto (%)"
              value={porcentaje.field.value as number | undefined}
              onChange={porcentaje.field.onChange}
              onBlur={porcentaje.field.onBlur}
              error={porcentaje.fieldState.error?.message}
              help="De 1 a 100"
            />
          </>
        ) : null}
      </Variable>

      <Variable codigo="FB-05" nombre="Bejucos" responsable="Grados 10.° y 11.°">
        <Text style={styles.senal}>Enredaderas sobre el fuste o la copa: califica qué porción del individuo cubren.</Text>
        <Escala control={control} nombre={campo('bejucos')} etiqueta="Porción cubierta" niveles={COBERTURA_BEJUCOS} />
      </Variable>

      <Variable codigo="FB-06" nombre="Epífitas" responsable="Grados 10.° y 11.°">
        <Text style={styles.senal}>Plantas que se apoyan en el árbol sin parasitarlo. No las confundas con el pajarito.</Text>
        <Multiple control={control} nombre={campo('epifitas')} />
      </Variable>
    </View>
  );
}

function Variable({ codigo, nombre, responsable, children }: { codigo: string; nombre: string; responsable: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.variable}>
      <View style={styles.variableCabeza}>
        <Text style={styles.codigo}>{codigo}</Text>
        <Text style={styles.variableNombre}>{nombre}</Text>
        <Text style={styles.responsable}>Responsable: {responsable}</Text>
      </View>
      {children}
    </View>
  );
}

function Selector<T extends FieldValues>({
  control,
  nombre,
  etiqueta,
  opciones,
  vacio,
  alVaciar,
}: {
  control: Control<T>;
  nombre: Path<T>;
  etiqueta: string;
  opciones: { label: string; value: string }[];
  /** Si se da, la primera opción deja el agente sin registrar. */
  vacio?: string;
  alVaciar?: () => void;
}) {
  const { field, fieldState } = useController({ control, name: nombre });
  return (
    <SelectField
      label={etiqueta}
      value={(field.value as string | null) ?? (vacio ? NINGUNO : undefined)}
      options={vacio ? [{ label: vacio, value: NINGUNO }, ...opciones] : opciones}
      onChange={(valor) => {
        const nuevo = valor === NINGUNO ? null : valor;
        field.onChange(nuevo);
        if (!nuevo) alVaciar?.();
      }}
      error={fieldState.error?.message}
    />
  );
}

function Escala<T extends FieldValues>({
  control,
  nombre,
  etiqueta,
  niveles,
}: {
  control: Control<T>;
  nombre: Path<T>;
  etiqueta: string;
  niveles: readonly string[];
}) {
  const styles = useStyles();
  const { field, fieldState } = useController({ control, name: nombre });
  return (
    <View style={styles.escala}>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      <View style={styles.chips}>
        {niveles.map((texto, nivel) => (
          <ChoiceChip key={texto} label={`${nivel} · ${texto}`} selected={field.value === nivel} onPress={() => field.onChange(nivel)} />
        ))}
      </View>
      {fieldState.error?.message ? <Text style={styles.error}>{fieldState.error.message}</Text> : null}
    </View>
  );
}

function SiNo<T extends FieldValues>({ control, nombre, etiqueta }: { control: Control<T>; nombre: Path<T>; etiqueta: string }) {
  const styles = useStyles();
  const { field } = useController({ control, name: nombre });
  return (
    <View style={styles.escala}>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      <View style={styles.chips}>
        <ChoiceChip label="No" selected={!field.value} onPress={() => field.onChange(false)} />
        <ChoiceChip label="Sí" selected={Boolean(field.value)} onPress={() => field.onChange(true)} />
      </View>
    </View>
  );
}

function Texto<T extends FieldValues>({
  control,
  nombre,
  etiqueta,
  placeholder,
}: {
  control: Control<T>;
  nombre: Path<T>;
  etiqueta: string;
  placeholder?: string;
}) {
  const { field, fieldState } = useController({ control, name: nombre });
  return (
    <Field
      label={etiqueta}
      value={(field.value as string) ?? ''}
      onChangeText={field.onChange}
      onBlur={field.onBlur}
      autoCapitalize="characters"
      maxLength={40}
      placeholder={placeholder}
      error={fieldState.error?.message}
    />
  );
}

function Multiple<T extends FieldValues>({ control, nombre }: { control: Control<T>; nombre: Path<T> }) {
  const styles = useStyles();
  const { field } = useController({ control, name: nombre });
  const elegidas = (field.value as TipoEpifita[] | undefined) ?? [];
  return (
    <View style={styles.chips}>
      {TIPOS_EPIFITA.map((tipo) => (
        <ChoiceChip
          key={tipo}
          label={EPIFITAS[tipo]}
          selected={elegidas.includes(tipo)}
          onPress={() => field.onChange(elegidas.includes(tipo) ? elegidas.filter((e) => e !== tipo) : [...elegidas, tipo])}
        />
      ))}
    </View>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  bloque: { gap: 14 },
  encabezado: { gap: 3 },
  titulo: { color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  ayuda: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  variable: { gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.canvas },
  variableCabeza: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8, rowGap: 2 },
  codigo: { color: palette.forest, fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.6 },
  variableNombre: { color: palette.ink, fontSize: 14, fontFamily: fonts.bold },
  responsable: { marginLeft: 'auto', color: palette.muted, fontSize: 11 },
  senal: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  escala: { gap: 7 },
  etiqueta: { color: palette.ink, fontSize: 13, fontFamily: fonts.semiBold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: palette.red, fontSize: 13, lineHeight: 18 },
}));
