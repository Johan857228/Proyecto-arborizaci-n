import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { crearEstilos } from '@/theme';

/** Versión vigente; debe coincidir con POLITICA_VERSION del backend (comun.py). */
export const POLITICA_VERSION = '2026-10-v1';

const SECCIONES: { titulo: string; parrafos: string[] }[] = [
  {
    titulo: 'Quién responde por tus datos',
    parrafos: [
      'La institución educativa a la que perteneces es la responsable del tratamiento de tus datos. El equipo de Arbolado Escolar, con el apoyo de la Universidad Popular del Cesar, actúa como encargado: trata los datos por cuenta de la institución y solo para lo que ella autoriza.',
    ],
  },
  {
    titulo: 'Qué datos tratamos',
    parrafos: [
      'Nombre, correo, rol, institución y curso; los árboles que registras, tus inspecciones y las fotos de los árboles; la ubicación GPS del árbol, nunca la tuya; tus puntos y logros; y, si los eliges, tu foto de perfil y tu alias.',
      'A todas las fotos les quitamos los metadatos que guarda el teléfono (por ejemplo, la ubicación y el modelo del dispositivo) antes de guardarlas.',
    ],
  },
  {
    titulo: 'Para qué los usamos',
    parrafos: [
      'Para llevar el inventario de árboles de la institución, asignar el trabajo de campo por curso, revisar las inspecciones, calcular puntos y logros, y generar reportes de la institución. Los reportes para entidades públicas no incluyen datos personales de estudiantes.',
    ],
  },
  {
    titulo: 'Estudiantes menores de edad',
    parrafos: [
      'Los datos de niños, niñas y adolescentes se tratan solo en su interés superior (Ley 1581 de 2012, art. 7). Para hacerlo, el acudiente da su autorización después de escuchar la opinión del estudiante (Decreto 1377 de 2013, art. 12).',
      'En los rankings, los demás estudiantes ven tu alias o tus iniciales, no tu nombre. Las fotos deben mostrar solo árboles: evita que aparezcan rostros de personas.',
    ],
  },
  {
    titulo: 'Con quién se comparten',
    parrafos: [
      'Con proveedores tecnológicos que actúan como subencargados: Supabase (almacenamiento y autenticación) y Anthropic (análisis de fotos de árboles con inteligencia artificial, solo cuando usas esa función). Pueden alojar los datos fuera de Colombia. Nunca vendemos datos.',
    ],
  },
  {
    titulo: 'Tus derechos',
    parrafos: [
      'Puedes conocer, actualizar y corregir tus datos; pedir que se eliminen; retirar la autorización; pedir prueba de la autorización; saber cómo se usan; y presentar quejas ante la Superintendencia de Industria y Comercio.',
      'Hazlo desde la app, en Privacidad y mis datos, o con tu institución. Las consultas se responden en máximo 10 días hábiles y los reclamos en máximo 15 (Ley 1581, arts. 14 y 15).',
    ],
  },
  {
    titulo: 'Cuánto tiempo los guardamos',
    parrafos: [
      'Mientras estés vinculado a la institución. Al egresar, tu cuenta se anonimiza: se conservan los registros de los árboles, sin tus datos personales.',
    ],
  },
];

/** Política de tratamiento de datos (plantilla que cada institución revisa con su asesor jurídico). */
export function PoliticaDatos() {
  const styles = useStyles();
  return (
    <View style={styles.contenedor}>
      {SECCIONES.map((seccion) => (
        <View key={seccion.titulo} style={styles.seccion}>
          <Text style={styles.titulo} accessibilityRole="header">{seccion.titulo}</Text>
          {seccion.parrafos.map((parrafo) => <Text key={parrafo} style={styles.parrafo}>{parrafo}</Text>)}
        </View>
      ))}
      <Text style={styles.nota}>
        Versión {POLITICA_VERSION}, vigente desde el 17 de octubre de 2026. Es una plantilla: cada institución debe revisarla con su asesor jurídico y publicar sus canales de atención.
      </Text>
    </View>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  contenedor: { gap: 18 },
  seccion: { gap: 6 },
  titulo: { color: palette.ink, fontSize: 16, fontFamily: fonts.bold },
  parrafo: { color: palette.ink, fontSize: 14, lineHeight: 21 },
  nota: { color: palette.muted, fontSize: 12, lineHeight: 18 },
}));
