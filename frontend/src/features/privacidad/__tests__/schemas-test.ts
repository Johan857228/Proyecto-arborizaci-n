import { describe, expect, it } from '@jest/globals';
import { aliasSchema, firmaSchema, solicitudInSchema } from '@/features/privacidad/schemas';

describe('firmaSchema (autorización del acudiente)', () => {
  const valida = {
    acudiente_nombre: '  Rosa   Pérez Díaz ',
    acudiente_documento: '1065123456',
    parentesco: 'madre' as const,
    acudiente_contacto: '',
    estudiante_escuchado: true,
    autoriza_tratamiento: true,
    firma: 'rosa pérez díaz',
  };

  function errorEn(cambios: object, campo: string) {
    const resultado = firmaSchema.safeParse({ ...valida, ...cambios });
    return resultado.success ? undefined : resultado.error.issues.find((i) => i.path[0] === campo)?.message;
  }

  it('acepta una firma igual al nombre (sin importar mayúsculas ni espacios)', () => {
    expect(firmaSchema.parse(valida)).toMatchObject({ acudiente_nombre: 'Rosa Pérez Díaz', firma: 'rosa pérez díaz' });
  });

  it('rechaza lo que pide la ley y lo que no cuadra', () => {
    expect(errorEn({ firma: 'Otra Persona' }, 'firma')).toBe('La firma debe ser el mismo nombre completo del acudiente.');
    expect(errorEn({ estudiante_escuchado: false }, 'estudiante_escuchado')).toBe('Confirma que se escuchó la opinión del estudiante.');
    expect(errorEn({ autoriza_tratamiento: false }, 'autoriza_tratamiento')).toBe('El acudiente debe autorizar el tratamiento de los datos.');
    expect(errorEn({ acudiente_documento: '12 34' }, 'acudiente_documento')).toBeDefined();
    expect(errorEn({ parentesco: 'vecino' }, 'parentesco')).toBeDefined();
  });
});

describe('aliasSchema', () => {
  it('deja vacío (iniciales) o un alias seguro', () => {
    expect(aliasSchema.parse('   ')).toBe('');
    expect(aliasSchema.parse('  Ceiba   veloz ')).toBe('Ceiba veloz');
  });

  it('no deja datos personales en el alias', () => {
    expect(aliasSchema.safeParse('ana@correo.com').success).toBe(false);
    expect(aliasSchema.safeParse('Llámame 3001234567').success).toBe(false);
    expect(aliasSchema.safeParse('ab').success).toBe(false);
    expect(aliasSchema.safeParse('<script>').success).toBe(false);
  });
});

describe('solicitudInSchema', () => {
  it('pide un detalle mínimo', () => {
    expect(solicitudInSchema.safeParse({ tipo: 'consulta', detalle: 'hola' }).success).toBe(false);
    expect(solicitudInSchema.safeParse({ tipo: 'supresion', detalle: 'Quiero que borren mi foto de perfil' }).success).toBe(true);
  });
});
