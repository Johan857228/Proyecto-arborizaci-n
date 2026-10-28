import { useState } from 'react';
import { View } from 'react-native';

import { useContactos, useGuardarContactos } from '@/features/riesgo/api';
import { contactosFormSchema, type Contactos, type ContactosForm } from '@/features/riesgo/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Card, KeyValue, LoadingState } from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

const CAMPOS: { clave: keyof ContactosForm; etiqueta: string; teclado?: 'phone-pad' | 'email-address'; ayuda?: string }[] = [
  { clave: 'rectoria_nombre', etiqueta: 'Rectoría (nombre o cargo)' },
  { clave: 'rectoria_telefono', etiqueta: 'Teléfono de rectoría', teclado: 'phone-pad', ayuda: 'Un celular permite avisar por WhatsApp.' },
  { clave: 'rectoria_correo', etiqueta: 'Correo de rectoría', teclado: 'email-address' },
  { clave: 'gestion_riesgo_telefono', etiqueta: 'Gestión del riesgo del municipio', teclado: 'phone-pad', ayuda: 'Consejo u oficina municipal de gestión del riesgo.' },
  { clave: 'autoridad_ambiental_nombre', etiqueta: 'Autoridad ambiental', ayuda: 'En Valledupar, Corpocesar.' },
  { clave: 'autoridad_ambiental_telefono', etiqueta: 'Teléfono de la autoridad ambiental', teclado: 'phone-pad' },
];

function aFormulario(c?: Contactos): ContactosForm {
  return Object.fromEntries(CAMPOS.map(({ clave }) => [clave, c?.[clave] ?? ''])) as ContactosForm;
}

function Formulario({ institucionId, contactos }: { institucionId: string; contactos?: Contactos }) {
  const styles = useStyles();
  const guardar = useGuardarContactos(institucionId);
  const [valores, setValores] = useState(() => aFormulario(contactos));
  const [errores, setErrores] = useState<Partial<Record<keyof ContactosForm, string>>>({});
  const [guardado, setGuardado] = useState(false);

  async function enviar() {
    setGuardado(false);
    const validado = contactosFormSchema.safeParse(valores);
    if (!validado.success) {
      setErrores(Object.fromEntries(validado.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    setErrores({});
    try {
      await guardar.mutateAsync(validado.data);
      setGuardado(true);
    } catch {
      // El error se muestra con guardar.error.
    }
  }

  return (
    <View style={styles.campos}>
      {CAMPOS.map((campo) => (
        <View key={campo.clave} style={styles.campo}>
          <Field
            label={campo.etiqueta}
            value={valores[campo.clave]}
            onChangeText={(v) => {
              setValores((actual) => ({ ...actual, [campo.clave]: v }));
              setGuardado(false);
            }}
            keyboardType={campo.teclado}
            autoCapitalize={campo.teclado === 'email-address' ? 'none' : undefined}
            hint={campo.ayuda}
            error={errores[campo.clave]}
          />
        </View>
      ))}
      {guardar.error ? <InlineMessage>{getApiErrorMessage(guardar.error)}</InlineMessage> : null}
      {guardado ? <InlineMessage tone="success">Contactos guardados.</InlineMessage> : null}
      <PrimaryButton title="Guardar contactos" icon="check" loading={guardar.isPending} onPress={() => void enviar()} />
    </View>
  );
}

/** Contactos de emergencia de la sede: los ve toda la institución y los editan docentes y el
 *  administrador. Se usan en la ruta de emergencia y para avisar a rectoría. */
export function ContactosEmergencia({ institucionId, editable }: { institucionId: string; editable: boolean }) {
  const contactos = useContactos(institucionId);
  return (
    <Card title="Contactos de emergencia" subtitle="A quién avisar en esta sede ante un riesgo de caída." icon="info">
      {contactos.isLoading ? (
        <LoadingState />
      ) : editable ? (
        <Formulario key={contactos.data?.actualizado_en ?? 'nuevo'} institucionId={institucionId} contactos={contactos.data} />
      ) : (
        <View>
          {CAMPOS.map((campo) => (
            <KeyValue key={campo.clave} label={campo.etiqueta} value={contactos.data?.[campo.clave] || '—'} />
          ))}
        </View>
      )}
    </Card>
  );
}

const useStyles = crearEstilos(() => ({
  campos: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
  campo: { flexGrow: 1, flexBasis: 220 },
}));
