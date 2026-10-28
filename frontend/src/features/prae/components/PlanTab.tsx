import { useState } from 'react';
import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useBorrarAccion, useCrearAccion, useEditarAccion } from '@/features/prae/api';
import { accionFormSchema, ESTADOS_ACCION, nulo, type Accion, type EstadoAccion, type Prae } from '@/features/prae/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { ChoiceChip, Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Badge, Card, ConfirmButton, EmptyState } from '@/shared/components/UI';
import { formatFecha } from '@/shared/format';
import { crearEstilos } from '@/theme';

function FilaAccion({ accion, editable }: { accion: Accion; editable: boolean }) {
  const styles = useStyles();
  const editar = useEditarAccion();
  const borrar = useBorrarAccion();
  const estado = ESTADOS_ACCION[accion.estado];
  const fechas = [accion.fecha_inicio, accion.fecha_fin].filter(Boolean).map((f) => formatFecha(f)).join(' a ');
  return (
    <View style={styles.fila}>
      <View style={styles.filaArriba}>
        <Text style={styles.titulo}>{accion.titulo}</Text>
        <View style={styles.insignias}>
          <Badge label={estado.etiqueta} tono={estado.tono} />
          {accion.vencida ? <Badge label="Vencida" tono="critico" /> : null}
        </View>
      </View>
      <Text style={styles.meta}>{[accion.responsable, fechas].filter(Boolean).join(' · ') || 'Sin responsable ni fechas'}</Text>
      {accion.indicador || accion.meta ? (
        <Text style={styles.texto}>{accion.indicador ? `Indicador: ${accion.indicador}` : ''}{accion.indicador && accion.meta ? ' · ' : ''}{accion.meta ? `Meta: ${accion.meta}` : ''}</Text>
      ) : null}
      {editar.error || borrar.error ? <InlineMessage>{getApiErrorMessage(editar.error ?? borrar.error)}</InlineMessage> : null}
      {editable ? (
        <>
          <View style={styles.insignias}>
            {(Object.keys(ESTADOS_ACCION) as EstadoAccion[]).map((e) => (
              <ChoiceChip key={e} label={ESTADOS_ACCION[e].etiqueta} selected={accion.estado === e}
                onPress={() => { if (e !== accion.estado) editar.mutate({ id: accion.id, cambios: { estado: e } }); }} />
            ))}
          </View>
          <ConfirmButton title="Quitar del plan" confirmTitle="¿Quitar esta acción del plan?" loading={borrar.isPending} onConfirm={() => borrar.mutate(accion.id)} />
        </>
      ) : null}
    </View>
  );
}

function NuevaAccion({ praeId }: { praeId: string }) {
  const styles = useStyles();
  const crear = useCrearAccion();
  const vacio = { titulo: '', responsable: '', fecha_inicio: '', fecha_fin: '', indicador: '', meta: '' };
  const [v, setV] = useState(vacio);
  const [errores, setErrores] = useState<Partial<Record<keyof typeof vacio, string>>>({});
  const poner = (campo: keyof typeof vacio) => (texto: string) => setV((actual) => ({ ...actual, [campo]: texto }));

  async function agregar() {
    const validado = accionFormSchema.safeParse(v);
    if (!validado.success) {
      setErrores(Object.fromEntries(validado.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    setErrores({});
    const d = validado.data;
    try {
      await crear.mutateAsync({
        praeId,
        datos: { titulo: d.titulo, responsable: nulo(d.responsable), fecha_inicio: d.fecha_inicio || null, fecha_fin: d.fecha_fin || null, indicador: nulo(d.indicador), meta: nulo(d.meta) },
      });
      setV(vacio);
    } catch {
      // El error se muestra con crear.error.
    }
  }

  return (
    <Card title="Agregar acción" icon="add">
      <Field label="Acción" value={v.titulo} onChangeText={poner('titulo')} maxLength={150} placeholder="Ej.: Instalar puntos de reciclaje" error={errores.titulo} />
      <Field label="Responsable" value={v.responsable} onChangeText={poner('responsable')} maxLength={120} placeholder="Cargo, curso o aliado" error={errores.responsable} />
      <View style={styles.dos}>
        <View style={styles.celda}><Field label="Desde" value={v.fecha_inicio} onChangeText={poner('fecha_inicio')} placeholder="AAAA-MM-DD" autoCapitalize="none" error={errores.fecha_inicio} /></View>
        <View style={styles.celda}><Field label="Hasta" value={v.fecha_fin} onChangeText={poner('fecha_fin')} placeholder="AAAA-MM-DD" autoCapitalize="none" error={errores.fecha_fin} /></View>
      </View>
      <View style={styles.dos}>
        <View style={styles.celda}><Field label="Indicador" value={v.indicador} onChangeText={poner('indicador')} maxLength={300} placeholder="Ej.: kg de plástico recogido" /></View>
        <View style={styles.celda}><Field label="Meta" value={v.meta} onChangeText={poner('meta')} maxLength={300} placeholder="Ej.: 200 kg" /></View>
      </View>
      {crear.error ? <InlineMessage>{getApiErrorMessage(crear.error)}</InlineMessage> : null}
      <PrimaryButton title="Agregar al plan" icon="add" loading={crear.isPending} onPress={() => void agregar()} />
    </Card>
  );
}

/** Plan de acción del PRAE: qué se hará, quién, cuándo y cómo se mide. */
export function PlanTab({ prae }: { prae: Prae }) {
  const styles = useStyles();
  const r = prae.resumen_acciones;
  return (
    <>
      <Card title="Plan de acción" subtitle={r.total ? `${r.cumplida} de ${r.total - r.cancelada} acciones cumplidas` : undefined} icon="list">
        {prae.acciones.length ? (
          <View style={styles.lista}>{prae.acciones.map((a) => <FilaAccion key={a.id} accion={a} editable={prae.puede_editar} />)}</View>
        ) : (
          <EmptyState title="Aún no hay acciones" text={prae.puede_editar ? 'Agrega las actividades del proyecto con su responsable, fechas, indicador y meta.' : undefined} />
        )}
      </Card>
      {prae.puede_editar ? <NuevaAccion praeId={prae.id} /> : null}
    </>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  lista: { gap: 12 },
  fila: { gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.line },
  filaArriba: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titulo: { flexShrink: 1, color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  insignias: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  texto: { color: palette.ink, fontSize: 13, lineHeight: 19 },
  dos: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
  celda: { flexGrow: 1, flexBasis: 160 },
}));
