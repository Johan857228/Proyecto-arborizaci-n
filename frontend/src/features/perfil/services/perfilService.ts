import { z } from 'zod';

import { enviarValidado, getValidado } from '@/services/api/client';
import { miPerfilSchema, usuarioSchema, type CrearCuenta, type EditarUsuario } from '@/features/perfil/schemas';

export const perfilService = {
  miPerfil: () => getValidado('/perfil', miPerfilSchema),

  cambiarMiNombre: (nombre: string) => enviarValidado('patch', '/perfil', { nombre }, miPerfilSchema),

  usuarios: (institucionId?: string) => getValidado('/usuarios', z.array(usuarioSchema), { institucion_id: institucionId }),

  crearUsuario: (cuenta: CrearCuenta) => enviarValidado('post', '/usuarios', cuenta, usuarioSchema),

  editarUsuario: (usuarioId: string, cambios: Partial<EditarUsuario>) =>
    enviarValidado('patch', `/usuarios/${usuarioId}`, cambios, usuarioSchema),
};
