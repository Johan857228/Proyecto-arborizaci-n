import type { Href } from 'expo-router';

import { esRevisor, type MiPerfil } from '@/features/perfil/schemas';
import type { IconName } from '@/shared/components/Icon';

export type GrupoModulo = 'campo' | 'seguimiento' | 'gestion';

export interface Modulo {
  clave: string;
  titulo: string;
  /** Nombre corto para la cuadrícula de accesos rápidos del inicio. */
  corto: string;
  texto: string;
  icono: IconName;
  href: Href;
  /** Prefijo de la ruta (sin el grupo "(app)") para marcar la navegación como activa. */
  ruta: string;
  grupo: GrupoModulo;
  /** Solo para docentes y administradores (el backend aplica el mismo permiso). */
  soloRevisores?: boolean;
}

export const GRUPOS: { clave: GrupoModulo; titulo: string }[] = [
  { clave: 'campo', titulo: 'Trabajo de campo' },
  { clave: 'seguimiento', titulo: 'Seguimiento y resultados' },
  { clave: 'gestion', titulo: 'Gestión institucional' },
];

export const MODULOS: Modulo[] = [
  { clave: 'mapa', titulo: 'Mapa con capas', corto: 'Mapa', texto: 'Sedes y árboles por estado, riesgo de caída, especie y origen, también sin conexión.', icono: 'map', href: '/(app)/map' as Href, ruta: '/map', grupo: 'campo' },
  { clave: 'alertas', titulo: 'Alertas de riesgo de caída', corto: 'Alertas', texto: 'Árboles con riesgo alto o inminente, ruta de emergencia y aviso a rectoría.', icono: 'warning', href: '/(app)/alerts' as Href, ruta: '/alerts', grupo: 'campo' },
  { clave: 'servicio', titulo: 'Servicio social', corto: 'Servicio', texto: 'Horas de 10.° y 11.°: bitácora con evidencia, aprobación docente y certificado con QR.', icono: 'school', href: '/(app)/service' as Href, ruta: '/service', grupo: 'campo' },
  { clave: 'revision', titulo: 'Revisión', corto: 'Revisión', texto: 'Confirma o anula las inspecciones pendientes de tu institución.', icono: 'review', href: '/(app)/review' as Href, ruta: '/review', grupo: 'campo', soloRevisores: true },
  { clave: 'intervenciones', titulo: 'Intervenciones', corto: 'Cuidados', texto: 'Mantenimiento realizado, programado y recomendado por árbol.', icono: 'tools', href: '/(app)/interventions' as Href, ruta: '/interventions', grupo: 'campo' },
  { clave: 'cursos', titulo: 'Cursos y zonas', corto: 'Cursos', texto: 'Zonas asignadas a cada curso, cobertura y productividad.', icono: 'school', href: '/(app)/courses' as Href, ruta: '/courses', grupo: 'campo' },
  { clave: 'progreso', titulo: 'Mi progreso', corto: 'Progreso', texto: 'Puntos, niveles, rachas, logros y rankings.', icono: 'trophy', href: '/(app)/progress' as Href, ruta: '/progress', grupo: 'seguimiento' },
  { clave: 'reportes', titulo: 'Reportes', corto: 'Reportes', texto: 'Inventario, riesgo, cobertura, productividad e intervenciones por periodo.', icono: 'chart', href: '/(app)/reports' as Href, ruta: '/reports', grupo: 'seguimiento' },
  { clave: 'metas', titulo: 'Metas', corto: 'Metas', texto: 'Metas institucionales por indicador y su avance.', icono: 'flag', href: '/(app)/goals' as Href, ruta: '/goals', grupo: 'seguimiento' },
  { clave: 'exportar', titulo: 'Exportar datos', corto: 'Exportar', texto: 'Inventario, inspecciones e intervenciones en CSV, GeoJSON o Shapefile, sin datos personales.', icono: 'download', href: '/(app)/export' as Href, ruta: '/export', grupo: 'seguimiento', soloRevisores: true },
  { clave: 'prae', titulo: 'PRAE', corto: 'PRAE', texto: 'Proyecto Ambiental Escolar del año: plan de acción, evidencias, evaluación anual e informe.', icono: 'leaf', href: '/(app)/prae' as Href, ruta: '/prae', grupo: 'gestion' },
  { clave: 'presupuestos', titulo: 'Presupuestos', corto: 'Presupuesto', texto: 'Gasto ejecutado, comprometido y proyecciones.', icono: 'wallet', href: '/(app)/budgets' as Href, ruta: '/budgets', grupo: 'gestion', soloRevisores: true },
  { clave: 'escenarios', titulo: 'Escenarios', corto: 'Escenarios', texto: 'Simula cómo repartir un presupuesto entre las acciones pendientes.', icono: 'tune', href: '/(app)/scenarios' as Href, ruta: '/scenarios', grupo: 'gestion', soloRevisores: true },
  { clave: 'configuracion', titulo: 'Configuración', corto: 'Ajustes', texto: 'Método de cálculo, pesos, umbrales y parámetros por institución.', icono: 'settings', href: '/(app)/settings' as Href, ruta: '/settings', grupo: 'gestion', soloRevisores: true },
  { clave: 'privacidad', titulo: 'Privacidad', corto: 'Privacidad', texto: 'Política de datos, autorización del acudiente, alias y solicitudes de datos.', icono: 'lock', href: '/(app)/privacy' as Href, ruta: '/privacy', grupo: 'gestion' },
  { clave: 'usuarios', titulo: 'Usuarios', corto: 'Usuarios', texto: 'Roles, instituciones, cursos y cuentas activas.', icono: 'users', href: '/(app)/users' as Href, ruta: '/users', grupo: 'gestion', soloRevisores: true },
];

/** Módulos que puede abrir el perfil. Mientras el perfil carga se muestran los de todos. */
export function modulosPara(perfil: MiPerfil | undefined) {
  const revisor = esRevisor(perfil);
  return MODULOS.filter((modulo) => !modulo.soloRevisores || revisor);
}

/** Rutas que se consideran parte de "Módulos" en la barra de navegación (incluye el perfil). */
export function esRutaDeModulo(path: string) {
  return path === '/modules' || path === '/profile' || path.startsWith('/inspections')
    || MODULOS.some((modulo) => path === modulo.ruta || path.startsWith(`${modulo.ruta}/`));
}
