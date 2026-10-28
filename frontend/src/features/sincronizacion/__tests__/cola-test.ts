import { describe, expect, it, jest } from '@jest/globals';
import { AxiosError, type AxiosResponse } from 'axios';

import {
  clasificarFalla,
  enviarRegistros,
  type ArbolEnCola,
  type Cambios,
  type InspeccionEnCola,
  type RegistroEnCola,
  type Servicios,
} from '@/features/sincronizacion/cola';
import type { ArbolCrear } from '@/features/trees/types';
import { FotoNoDisponible } from '@/services/offline/tipos';
import { nuevoId } from '@/shared/utils/id';

const sinRed = () => new AxiosError('Network Error', 'ERR_NETWORK');
const respuesta = (status: number, detail = 'Rechazado') =>
  new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status, data: { detail } } as AxiosResponse);

const foto = (id: string, tipo: 'completo' | 'detalle' | 'adicional' = 'completo') => ({
  id,
  tipo,
  uri: `file:///fotos/${id}.jpg`,
  name: `${id}.jpg`,
  mimeType: 'image/jpeg' as const,
  sizeBytes: 1000,
  subida: false,
});

const payloadArbol = { institucion_id: 'sj', zona: 'Patio central', especie_id: 1 } as unknown as ArbolCrear;

function arbol(id: string, extra: Partial<ArbolEnCola> = {}): ArbolEnCola {
  return {
    tipo: 'arbol',
    id,
    creadoEn: '2026-10-18T14:00:00.000Z',
    payload: payloadArbol,
    fotos: [foto(`${id}-f1`), foto(`${id}-f2`, 'detalle')],
    estado: 'pendiente',
    intentos: 0,
    titulo: 'Mango',
    detalle: 'San José · Patio central',
    ...extra,
  };
}

function inspeccion(id: string, extra: Partial<InspeccionEnCola> = {}): InspeccionEnCola {
  return {
    tipo: 'inspeccion',
    id,
    creadoEn: '2026-10-18T15:00:00.000Z',
    arbolId: 'arbol-servidor',
    payload: {} as InspeccionEnCola['payload'],
    fotos: [foto(`${id}-f1`)],
    estado: 'pendiente',
    intentos: 0,
    titulo: 'Inspección de IE001-0003',
    detalle: 'Mango',
    ...extra,
  };
}

/** Servicios falsos: la creación se puede hacer fallar. Guarda el último estado de cada registro. */
function preparar(fallas: { crearArbol?: () => unknown; crearInspeccion?: () => unknown } = {}) {
  const llamadas: string[] = [];
  const servicios: Servicios = {
    crearArbol: jest.fn<Servicios['crearArbol']>(async (_payload, envio) => {
      llamadas.push(`arbol:${envio.idCliente}`);
      if (fallas.crearArbol) throw fallas.crearArbol();
      return { id: `srv-${envio.idCliente}`, codigo: 'IE001-0042' };
    }),
    crearInspeccion: jest.fn<Servicios['crearInspeccion']>(async (_arbolId, _payload, envio) => {
      llamadas.push(`inspeccion:${envio.idCliente}`);
      if (fallas.crearInspeccion) throw fallas.crearInspeccion();
      return { id: `srv-${envio.idCliente}` };
    }),
    subirFotoArbol: jest.fn<Servicios['subirFotoArbol']>(async (_arbolId, _foto, idCliente) => {
      llamadas.push(`foto:${idCliente}`);
    }),
    subirFotoInspeccion: jest.fn<Servicios['subirFotoInspeccion']>(async (_id, _foto, idCliente) => {
      llamadas.push(`foto:${idCliente}`);
    }),
    prepararFoto: jest.fn<Servicios['prepararFoto']>(async (f) => f),
  };
  const estado = new Map<string, RegistroEnCola>();
  const terminados: string[] = [];
  const cambios: Cambios = {
    guardar: async (registro) => {
      estado.set(registro.id, registro);
    },
    terminar: async (registro, enviado) => {
      estado.delete(registro.id);
      terminados.push(`${registro.id}:${enviado.codigo ?? ''}:${enviado.fotosConError}`);
    },
  };
  return { servicios, cambios, llamadas, estado, terminados };
}

describe('enviarRegistros', () => {
  it('crea cada registro con su id_cliente y hora de captura, y luego sube sus fotos, en orden', async () => {
    const { servicios, cambios, llamadas, terminados } = preparar();
    const resultado = await enviarRegistros([arbol('a1'), inspeccion('i1')], servicios, cambios);

    expect(resultado).toEqual({ enviados: 2, conError: 0 });
    expect(llamadas).toEqual(['arbol:a1', 'foto:a1-f1', 'foto:a1-f2', 'inspeccion:i1', 'foto:i1-f1']);
    expect(servicios.crearArbol).toHaveBeenCalledWith(payloadArbol, { idCliente: 'a1', capturadoEn: '2026-10-18T14:00:00.000Z' });
    expect(servicios.subirFotoArbol).toHaveBeenCalledWith('srv-a1', expect.anything(), 'a1-f1');
    expect(terminados).toEqual(['a1:IE001-0042:0', 'i1::0']);
  });

  it('si la señal se cae a mitad, guarda el avance y la siguiente vez sigue donde quedó', async () => {
    const primera = preparar();
    // Se cae la señal al subir la segunda foto del primer árbol.
    (primera.servicios.subirFotoArbol as jest.Mock<Servicios['subirFotoArbol']>).mockImplementation(async (_a, _f, idCliente) => {
      primera.llamadas.push(`foto:${idCliente}`);
      if (idCliente === 'a1-f2') throw sinRed();
    });
    const resultado = await enviarRegistros([arbol('a1'), arbol('a2')], primera.servicios, primera.cambios);

    expect(resultado).toEqual({ enviados: 0, conError: 0, detenido: 'sin_conexion' });
    expect(primera.llamadas).toEqual(['arbol:a1', 'foto:a1-f1', 'foto:a1-f2']); // a2 espera su turno
    const avance = primera.estado.get('a1') as ArbolEnCola;
    expect(avance.registroId).toBe('srv-a1');
    expect(avance.codigo).toBe('IE001-0042');
    expect(avance.fotos.map((f) => f.subida)).toEqual([true, false]);
    expect(avance.intentos).toBe(1);

    const segunda = preparar();
    await enviarRegistros([avance], segunda.servicios, segunda.cambios);
    expect(segunda.llamadas).toEqual(['foto:a1-f2']); // no vuelve a crear el árbol ni a subir la primera foto
    expect(segunda.terminados).toEqual(['a1:IE001-0042:0']);
  });

  it('un rechazo de datos deja el registro con error y sigue con los demás', async () => {
    const { servicios, cambios, estado, terminados } = preparar({ crearArbol: () => respuesta(422, 'La especie no existe') });
    const resultado = await enviarRegistros([arbol('a1'), inspeccion('i1')], servicios, cambios);

    expect(resultado).toEqual({ enviados: 1, conError: 1 });
    expect(estado.get('a1')).toMatchObject({ estado: 'error', error: 'La especie no existe', intentos: 1 });
    expect(terminados).toEqual(['i1::0']);
  });

  it('una foto rechazada (o que ya no está en el teléfono) no detiene el registro: se avisa', async () => {
    const { servicios, cambios, terminados, estado } = preparar();
    (servicios.subirFotoArbol as jest.Mock<Servicios['subirFotoArbol']>).mockImplementation(async (_a, _f, idCliente) => {
      if (idCliente === 'a1-f1') throw respuesta(409, 'Ya hay 3 fotos adicionales');
    });
    (servicios.prepararFoto as jest.Mock<Servicios['prepararFoto']>).mockImplementation(async (f) => {
      if (f.uri.includes('a1-f2')) throw new FotoNoDisponible();
      return f;
    });
    const resultado = await enviarRegistros([arbol('a1')], servicios, cambios);

    expect(resultado).toEqual({ enviados: 1, conError: 0 });
    expect(terminados).toEqual(['a1:IE001-0042:2']);
    expect(estado.size).toBe(0);
  });

  it('con la sesión vencida se detiene para enviar después de iniciar sesión', async () => {
    const { servicios, cambios, llamadas } = preparar({ crearArbol: () => respuesta(401) });
    const resultado = await enviarRegistros([arbol('a1'), arbol('a2')], servicios, cambios);
    expect(resultado.detenido).toBe('sesion');
    expect(llamadas).toEqual(['arbol:a1']);
  });

  it('no reintenta solo los registros que quedaron con error', async () => {
    const { servicios, cambios, llamadas } = preparar();
    await enviarRegistros([arbol('a1', { estado: 'error', error: 'x' })], servicios, cambios);
    expect(llamadas).toEqual([]);
  });
});

describe('clasificarFalla', () => {
  it('reintenta sin red o con el servidor ocupado; no reintenta datos rechazados', () => {
    expect(clasificarFalla(sinRed())).toBe('reintentar');
    expect(clasificarFalla(respuesta(503))).toBe('reintentar');
    expect(clasificarFalla(respuesta(429))).toBe('reintentar');
    expect(clasificarFalla(respuesta(401))).toBe('sesion');
    expect(clasificarFalla(respuesta(403))).toBe('definitiva');
    expect(clasificarFalla(new FotoNoDisponible())).toBe('definitiva');
    expect(clasificarFalla(new AxiosError('cancelada', 'ERR_CANCELED'))).toBe('definitiva');
  });
});

describe('nuevoId', () => {
  it('genera UUID v4 distintos', () => {
    const ids = new Set(Array.from({ length: 200 }, nuevoId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
