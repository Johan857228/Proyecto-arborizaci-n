import { type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useCatalogs } from '@/features/catalogs/hooks/useCatalogs';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin } from '@/features/perfil/schemas';
import { useEditarZonas, useZonas, type ZonaInstitucion, type ZonasInstitucion } from '@/features/zonas/api';
import { getApiErrorMessage } from '@/services/api/client';
import { Field, InlineMessage, PrimaryButton, SelectField } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import { AppHeader, Card, ConfirmButton, EmptyState, ErrorState, LoadingState, Notice, Page } from '@/shared/components/UI';
import { crearEstilos, useTema } from '@/theme';

function cuantos(zona: ZonaInstitucion) {
  const partes = [
    `${zona.arboles} ${zona.arboles === 1 ? 'árbol' : 'árboles'}`,
    zona.cursos ? `${zona.cursos} ${zona.cursos === 1 ? 'curso' : 'cursos'}` : null,
  ];
  return partes.filter(Boolean).join(' · ');
}

/** Una zona de la lista: nombre y conteos; quien gestiona la institución la renombra o la borra. */
function FilaZona({ zona, datos }: { zona: ZonaInstitucion; datos: ZonasInstitucion }) {
  const styles = useStyles();
  const { palette } = useTema();
  const { renombrar, borrar } = useEditarZonas();
  const [modo, setModo] = useState<'ver' | 'renombrar' | 'borrar'>('ver');
  const [nombre, setNombre] = useState(zona.nombre);
  const otras = datos.zonas.filter((z) => z.nombre !== zona.nombre).map((z) => z.nombre);
  const [destino, setDestino] = useState<string>();
  const [error, setError] = useState<string>();

  async function guardarNombre() {
    setError(undefined);
    if (!zona.id) return;
    try {
      await renombrar.mutateAsync({ id: zona.id, nombre: nombre.trim() });
      setModo('ver');
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  async function eliminar() {
    setError(undefined);
    if (!zona.id) return;
    try {
      await borrar.mutateAsync({ id: zona.id, moverA: zona.arboles > 0 ? destino : undefined });
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  return (
    <View style={styles.fila}>
      <View style={styles.filaTop}>
        <View style={styles.icono}><Icon name="location" size={16} color={palette.forest} /></View>
        <View style={styles.flex}>
          <Text style={styles.nombre}>{zona.nombre}</Text>
          <Text style={styles.detalle}>{cuantos(zona)}</Text>
        </View>
        {datos.puede_editar && modo === 'ver' ? (
          <View style={styles.acciones}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Renombrar ${zona.nombre}`} hitSlop={6} onPress={() => setModo('renombrar')} style={styles.accion}>
              <Icon name="edit" size={16} color={palette.forest} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Borrar ${zona.nombre}`} hitSlop={6} onPress={() => setModo('borrar')} style={styles.accion}>
              <Icon name="trash" size={16} color={palette.red} />
            </Pressable>
          </View>
        ) : null}
      </View>

      {modo === 'renombrar' ? (
        <View style={styles.editor}>
          <Field label="Nuevo nombre" value={nombre} maxLength={60} onChangeText={setNombre} />
          <Text style={styles.detalle}>
            {zona.arboles || zona.cursos ? 'Sus árboles y los cursos que la tienen asignada pasan al nombre nuevo.' : 'Todavía no tiene árboles ni cursos.'}
          </Text>
          <View style={styles.botones}>
            <View style={styles.flex}>
              <PrimaryButton title="Guardar" loading={renombrar.isPending} disabled={nombre.trim().length < 2} onPress={() => void guardarNombre()} />
            </View>
            <View style={styles.flex}>
              <PrimaryButton title="Cancelar" variant="secondary" onPress={() => { setModo('ver'); setNombre(zona.nombre); setError(undefined); }} />
            </View>
          </View>
        </View>
      ) : null}

      {modo === 'borrar' ? (
        <View style={styles.editor}>
          {zona.arboles > 0 ? (
            <SelectField
              label={`Pasar sus ${zona.arboles} ${zona.arboles === 1 ? 'árbol' : 'árboles'} a`}
              value={destino}
              placeholder="Elige otra zona"
              options={otras.map((n) => ({ label: n, value: n }))}
              onChange={setDestino}
            />
          ) : null}
          {zona.cursos > 0 ? <Text style={styles.detalle}>Los cursos que la tienen asignada dejarán de tenerla.</Text> : null}
          <ConfirmButton
            title={`Borrar «${zona.nombre}»`}
            confirmTitle={zona.arboles > 0 && destino ? `¿Borrar «${zona.nombre}» y pasar sus árboles a «${destino}»?` : `¿Borrar «${zona.nombre}»?`}
            disabled={zona.arboles > 0 && !destino}
            loading={borrar.isPending}
            onConfirm={() => void eliminar()}
          />
          <PrimaryButton title="Cancelar" variant="ghost" onPress={() => { setModo('ver'); setError(undefined); }} />
        </View>
      ) : null}
      {error ? <InlineMessage>{error}</InlineMessage> : null}
    </View>
  );
}

function NuevaZona({ institucionId }: { institucionId: string }) {
  const styles = useStyles();
  const { crear } = useEditarZonas();
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string>();

  async function agregar() {
    setError(undefined);
    try {
      await crear.mutateAsync({ institucionId, nombre: nombre.trim() });
      setNombre('');
    } catch (causa) {
      setError(getApiErrorMessage(causa));
    }
  }

  return (
    <View style={styles.nueva}>
      <View style={styles.flex}>
        <Field label="Nueva zona" value={nombre} maxLength={60} placeholder="Ej.: Cancha múltiple, Huerta, Bloque B" onChangeText={setNombre} onSubmitEditing={() => void agregar()} />
      </View>
      <PrimaryButton title="Agregar" icon="add" loading={crear.isPending} disabled={nombre.trim().length < 2} onPress={() => void agregar()} />
      {error ? <View style={styles.errorNueva}><InlineMessage>{error}</InlineMessage></View> : null}
    </View>
  );
}

/** Zonas de la sede: las define un docente de la institución o el administrador y aparecen al
 *  registrar árboles, al filtrar el inventario y al asignar zonas a los cursos. */
export function ZonasScreen() {
  const styles = useStyles();
  const perfil = useMiPerfil();
  const catalogs = useCatalogs();
  const admin = esAdmin(perfil.data);
  const [elegida, setElegida] = useState<string>();
  const institucionId = elegida ?? perfil.data?.institucion_id ?? undefined;
  const zonas = useZonas(institucionId);
  const datos = zonas.data;

  return (
    <Page>
      <AppHeader
        eyebrow="Gestión institucional"
        title="Zonas de la sede"
        subtitle="Las zonas del colegio (patios, canchas, entradas, bloques) que se eligen al registrar un árbol y al asignar zonas a un curso."
        backTo={'/(app)/modules' as Href}
      />

      {admin ? (
        <SelectField
          label="Institución"
          value={institucionId}
          placeholder="Elige una institución"
          options={(catalogs.data?.instituciones ?? []).map((i) => ({ label: i.nombre, value: i.id }))}
          onChange={setElegida}
        />
      ) : null}

      {!institucionId ? (
        perfil.isLoading ? <LoadingState /> : (
          <EmptyState
            title={admin ? 'Elige una institución' : 'Tu cuenta no tiene institución'}
            text={admin ? 'Cada institución tiene sus propias zonas.' : 'Cuando un administrador te asigne una institución verás aquí sus zonas.'}
          />
        )
      ) : zonas.isLoading ? <LoadingState text="Cargando zonas…" /> : zonas.error || !datos ? (
        <ErrorState error={zonas.error} onRetry={() => void zonas.refetch()} />
      ) : (
        <>
          {!datos.editable ? (
            <Notice tono="riesgo">
              Estas son las zonas de siempre. Para que cada colegio tenga las suyas, el administrador de Supabase debe aplicar la migración 016.
            </Notice>
          ) : !datos.puede_editar ? (
            <Notice tono="info">Solo un docente de esta institución o un administrador puede cambiar las zonas.</Notice>
          ) : null}
          <Card title={`${datos.zonas.length} ${datos.zonas.length === 1 ? 'zona' : 'zonas'}`} subtitle="Además está «Otra», para escribir una zona que no esté en la lista." icon="location">
            <View style={styles.lista}>
              {datos.zonas.map((zona) => <FilaZona key={zona.id ?? zona.nombre} zona={zona} datos={datos} />)}
            </View>
            {datos.puede_editar ? <NuevaZona institucionId={datos.institucion_id} /> : null}
          </Card>
        </>
      )}
    </Page>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  flex: { flex: 1, minWidth: 0 },
  lista: { gap: 8 },
  fila: { gap: 10, padding: 12, borderRadius: 14, backgroundColor: palette.tile },
  filaTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icono: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: palette.forestSoft },
  nombre: { color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  detalle: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  acciones: { flexDirection: 'row', gap: 6 },
  accion: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line },
  editor: { gap: 8 },
  botones: { flexDirection: 'row', gap: 8 },
  nueva: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10, marginTop: 6 },
  errorNueva: { flexBasis: '100%' },
}));
