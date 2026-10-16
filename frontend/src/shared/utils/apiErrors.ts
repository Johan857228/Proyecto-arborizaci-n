// Nombres legibles de los campos que valida la API, para explicar al usuario qué revisar.
const nombresCampos: Record<string, string> = {
  institucion_id: 'institución',
  zona: 'zona',
  zona_otra: 'descripción de la zona',
  lat: 'ubicación GPS',
  lng: 'ubicación GPS',
  especie_id: 'especie',
  dap_cm: 'diámetro del tronco',
  altura_m: 'altura',
  copa_m: 'diámetro de copa',
  etapa: 'etapa de desarrollo',
  interferencia: 'interferencia',
  interferencia_otra: 'descripción de la interferencia',
  observaciones: 'observaciones',
  email: 'correo',
  password: 'contraseña',
  archivo: 'fotografía',
  tipo: 'tipo de fotografía',
};

/**
 * Convierte el `detail` de una respuesta de error de la API en un texto para el usuario.
 * FastAPI devuelve un texto en los errores propios, pero en los de validación (422) envía una
 * lista de objetos; mostrar esa lista tal cual rompe la pantalla.
 */
export function describeApiDetail(detail: unknown): string | null {
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (!Array.isArray(detail)) return null;

  const partes = detail.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return [];
    const { loc, msg } = item as { loc?: unknown; msg?: unknown };
    const campo = Array.isArray(loc) ? loc.filter((parte) => typeof parte === 'string' && parte !== 'body' && parte !== 'query').at(-1) : undefined;
    if (typeof campo === 'string') return [nombresCampos[campo] ?? campo];
    // Validaciones del modelo completo (p. ej. "Si la zona es 'Otra'..."): el backend ya las escribe en español.
    return typeof msg === 'string' ? [msg.replace(/^Value error, /, '')] : [];
  });
  const unicas = [...new Set(partes)];
  if (unicas.length === 0) return 'El servidor rechazó los datos enviados. Revísalos e intenta de nuevo.';
  return `El servidor rechazó estos datos: ${unicas.join(', ')}. Revísalos e intenta de nuevo.`;
}
