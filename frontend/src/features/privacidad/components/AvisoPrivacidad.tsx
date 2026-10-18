import { router, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { usePrivacidad } from '@/features/privacidad/api';
import { Icon } from '@/shared/components/Icon';
import { crearEstilos, useTema } from '@/theme';

/** Aviso del inicio cuando falta aceptar la política o la autorización del acudiente. */
export function AvisoPrivacidad() {
  const styles = useStyles();
  const { palette } = useTema();
  const estado = usePrivacidad();
  const e = estado.data;
  if (!e) return null;
  const faltaPolitica = e.politica_aceptada !== e.politica_vigente;
  const faltaAcudiente = e.requiere_consentimiento && !e.consentimiento;
  if (!faltaPolitica && !faltaAcudiente) return null;
  const texto = faltaAcudiente
    ? 'Falta la autorización de tu acudiente para tratar tus datos. Fírmala con él o ella en la app.'
    : 'Lee y acepta la política de tratamiento de datos.';
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push('/(app)/privacy' as Href)} style={({ pressed }) => [styles.aviso, pressed && styles.pressed]}>
      <View style={styles.icono}><Icon name="lock" size={18} color={palette.amber} /></View>
      <View style={styles.cuerpo}>
        <Text style={styles.titulo}>Privacidad de tus datos</Text>
        <Text style={styles.texto}>{texto}</Text>
      </View>
      <Icon name="chevronRight" size={18} color={palette.amber} />
    </Pressable>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  aviso: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: palette.amberSoft, borderWidth: 1, borderColor: palette.line },
  icono: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.paper },
  cuerpo: { flex: 1, gap: 2 },
  titulo: { color: palette.ink, fontSize: 14, fontFamily: fonts.bold },
  texto: { color: palette.ink, fontSize: 13, lineHeight: 18 },
  pressed: { opacity: 0.85 },
}));
