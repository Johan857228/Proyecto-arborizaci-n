import type { Href } from 'expo-router';

import { esRevisor, type MiPerfil } from '@/features/perfil/schemas';
import type { IconName } from '@/shared/components/Icon';

export type GrupoModulo = 'campo' | 'seguimiento' | 'gestion';

export interface Modulo {
  clave: string;
  titulo: string;
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
  { clave: 'revision', titulo: 'Revisión', texto: 'Confirma o anula las inspecciones pendientes de tu institución.', icono: 'review', href: '/(app)/review' as Href, ruta: '/review', grupo: 'campo', soloRevisores: true },
  { clave: 'intervenciones', titulo: 'Intervenciones', texto: 'Mantenimiento realizado, programado y recomendado por árbol.', icono: 'tools', href: '/(app)/interventions' as Href, ruta: '/interventions', grupo: 'campo' },
  { clave: 'cursos', titulo: 'Cursos y zonas', texto: 'Zonas asignadas a cada curso, cobertura y productividad.', icono: 'school', href: '/(app)/courses' as Href, ruta: '/courses', grupo: 'campo' },
  { clave: 'progreso', titulo: 'Mi progreso', texto: 'Puntos, niveles, rachas, logros y rankings.', icono: 'trophy', href: '/(app)/progress' as Href, ruta: '/progress', grupo: 'seguimiento' },
  { clave: 'reportes', titulo: 'Reportes', texto: 'Inventario, riesgo, cobertura, productividad e intervenciones por periodo.', icono: 'chart', href: '/(app)/reports' as Href, ruta: '/reports', grupo: 'seguimiento' },
  { clave: 'metas', titulo: 'Metas', texto: 'Metas institucionales por indicador y su avance.', icono: 'flag', href: '/(app)/goals' as Href, ruta: '/goals', grupo: 'seguimiento' },
  { clave: 'presupuestos', titulo: 'Presupuestos', texto: 'Gasto ejecutado, comprometido y proyecciones.', icono: 'wallet', href: '/(app)/budgets' as Href, ruta: '/budgets', grupo: 'gestion', soloRevisores: true },
  { clave: 'escenarios', titulo: 'Escenarios', texto: 'Simula cómo repartir un presupuesto entre las acciones pendientes.', icono: 'tune', href: '/(app)/scenarios' as Href, ruta: '/scenarios', grupo: 'gestion', soloRevisores: true },
  { clave: 'configuracion', titulo: 'Configuración', texto: 'Método de cálculo, pesos, umbrales y parámetros por institución.', icono: 'settings', href: '/(app)/settings' as Href, ruta: '/settings', grupo: 'gestion', soloRevisores: true },
  { clave: 'usuarios', titulo: 'Usuarios', texto: 'Roles, instituciones, cursos y cuentas activas.', icono: 'users', href: '/(app)/users' as Href, ruta: '/users', grupo: 'gestion', soloRevisores: true },
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
