import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useConsultarFuente, useRegistrarVeda } from '@/features/especies/api';
import { AMENAZAS, ESTATUS, FUENTES_ORIGEN, type EspecieCatalogo, type Fuente } from '@/features/especies/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Icon } from '@/shared/components/Icon';
import { Badge } from '@/shared/components/UI';
import { formatFecha, formatFechaHora } from '@/shared/format';
import { crearEstilos, useTema } from '@/theme';

/** Insignias de la especie: origen, bosque seco, amenaza, invasora, veda. */
export function MarcasEspecie({ especie }: { especie: EspecieCatalogo }) {
  const styles = useStyles();
  const f = especie.ficha;
  return (
    <View style={styles.marcas}>
      {especie.origen ? <Badge label={especie.origen === 'nativa' ? 'Nativa' : 'Exótica'} tono={especie.origen === 'nativa' ? 'sano' : 'riesgo'} />
        : <Badge label="Origen sin clasificar" />}
      {f?.bosque_seco_cesar ? <Badge label="Bosque seco del Cesar" tono="sano" /> : null}
      {f?.amenaza ? <Badge label={`${AMENAZAS[f.amenaza].etiqueta} (${f.amenaza})`} tono={AMENAZAS[f.amenaza].tono} /> : null}
      {f?.invasora ? <Badge label="Invasora" tono="critico" /> : null}
      {f?.veda ? <Badge label="En veda" tono="info" /> : null}
      {!f ? <Badge label="Sin fuente oficial" /> : null}
    </View>
  );
}

function Enlace({ titulo, url }: { titulo: string; url: string }) {
  const styles = useStyles();
  const { palette } = useTema();
  return (
    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(url)} style={styles.enlace} hitSlop={6}>
      <Text style={styles.enlaceTexto}>{titulo}</Text>
      <Icon name="openExternal" size={13} color={palette.forest} />
    </Pressable>
  );
}

function FuenteFila({ fuente }: { fuente: Fuente }) {
  const styles = useStyles();
  const detalle = [fuente.version ? `versión ${fuente.version}` : null, fuente.publicado ? `publicada el ${formatFecha(fuente.publicado)}` : null]
    .filter(Boolean).join(' · ');
  return (
    <View style={styles.fuente}>
      <Text style={styles.fuenteTitulo}>{fuente.titulo}</Text>
      <Text style={[styles.fuenteDato, !fuente.encontrada && styles.apagado]}>{fuente.dato}</Text>
      <Text style={styles.meta}>{fuente.editor}{detalle ? ` · ${detalle}` : ''}</Text>
      <View style={styles.enlaces}>
        {fuente.doi ? <Enlace titulo={`DOI ${fuente.doi}`} url={`https://doi.org/${fuente.doi}`} /> : null}
        {fuente.registro_url ? <Enlace titulo="Registro en GBIF" url={fuente.registro_url} /> : null}
      </View>
    </View>
  );
}

function Veda({ especie }: { especie: EspecieCatalogo }) {
  const styles = useStyles();
  const guardar = useRegistrarVeda();
  const [veda, setVeda] = useState(especie.ficha?.veda ?? '');
  const [url, setUrl] = useState(especie.ficha?.veda_url ?? '');
  const enviar = (texto: string | null) =>
    guardar.mutate({ id: especie.id, veda: texto, vedaUrl: texto && url.trim() ? url.trim() : null });
  return (
    <View style={styles.veda}>
      <Field label="Veda (norma que la establece)" value={veda} onChangeText={setVeda} maxLength={300}
        placeholder="Ej.: Resolución 0316 de 1974 del INDERENA" hint="La veda no está publicada como lista en GBIF: regístrala con su norma." />
      <Field label="Enlace a la norma (opcional)" value={url} onChangeText={setUrl} maxLength={300} autoCapitalize="none" keyboardType="url" placeholder="https://" />
      {guardar.error ? <InlineMessage>{getApiErrorMessage(guardar.error)}</InlineMessage> : null}
      <View style={styles.botones}>
        <PrimaryButton title="Guardar veda" icon="check" compact loading={guardar.isPending} disabled={veda.trim().length < 3}
          onPress={() => enviar(veda.trim())} />
        {especie.ficha?.veda ? <PrimaryButton title="Quitar veda" variant="ghost" compact disabled={guardar.isPending}
          onPress={() => { setVeda(''); setUrl(''); enviar(null); }} /> : null}
      </View>
    </View>
  );
}

/** Fila del catálogo: nombre, insignias y, al tocarla, la ficha con cada fuente oficial. */
export function FichaEspecie({ especie, editable }: { especie: EspecieCatalogo; editable: boolean }) {
  const styles = useStyles();
  const { palette } = useTema();
  const consultar = useConsultarFuente();
  const [abierta, setAbierta] = useState(false);
  const f = especie.ficha;
  const deptos = f?.departamentos.length ?? 0;

  return (
    <View style={styles.fila}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: abierta }}
        accessibilityLabel={`${especie.nombre_comun}: ${abierta ? 'ocultar' : 'ver'} la ficha`}
        onPress={() => setAbierta(!abierta)}
        style={({ pressed }) => [styles.cabeza, pressed && styles.presionado]}
      >
        <View style={styles.flex}>
          <Text style={styles.nombre}>{especie.nombre_comun}</Text>
          {especie.nombre_cientifico ? <Text style={styles.cientifico}>{especie.nombre_cientifico}</Text> : null}
          <MarcasEspecie especie={especie} />
        </View>
        <View style={styles.derecha}>
          <Text style={styles.conteo}>{especie.arboles}</Text>
          <Text style={styles.meta}>{especie.arboles === 1 ? 'árbol' : 'árboles'}</Text>
        </View>
        <View style={abierta && styles.girado}><Icon name="chevronRight" size={18} color={palette.muted} /></View>
      </Pressable>

      {abierta ? (
        <View style={styles.detalle}>
          {especie.origen_fuente ? <Text style={styles.meta}>Origen: {FUENTES_ORIGEN[especie.origen_fuente].toLowerCase()}.</Text> : null}
          {f ? (
            <>
              {f.coincidencia === 'sinonimo' && f.nombre_aceptado ? <Text style={styles.texto}>Nombre aceptado: <Text style={styles.cursiva}>{f.nombre_aceptado}</Text></Text> : null}
              <Text style={styles.texto}>
                {[f.estatus ? ESTATUS[f.estatus] : null, f.forma_de_vida, deptos ? `${deptos} departamentos${f.en_cesar ? ', incluido Cesar' : ''}` : null,
                  f.riesgo_invasion ? `potencial de invasión: ${f.riesgo_invasion.toLowerCase()}` : null].filter(Boolean).join(' · ')}
              </Text>
              {f.veda ? (
                <View style={styles.marcas}>
                  <Text style={styles.texto}>Veda: {f.veda}</Text>
                  {f.veda_url ? <Enlace titulo="Ver la norma" url={f.veda_url} /> : null}
                </View>
              ) : null}
              {f.avisos.map((aviso) => <InlineMessage key={aviso} tone="warning">{aviso}</InlineMessage>)}
              {f.fuentes.map((fuente) => <FuenteFila key={fuente.clave} fuente={fuente} />)}
              {f.consultado_en ? <Text style={styles.meta}>Consultado en GBIF (SiB Colombia) el {formatFechaHora(f.consultado_en)}.</Text> : null}
            </>
          ) : (
            <Text style={styles.meta}>Aún no se han consultado las listas oficiales para esta especie.</Text>
          )}
          {consultar.error ? <InlineMessage>{getApiErrorMessage(consultar.error)}</InlineMessage> : null}
          {editable ? (
            <>
              <PrimaryButton title={f ? 'Consultar de nuevo' : 'Consultar fuentes oficiales'} icon="refresh" compact variant="secondary"
                loading={consultar.isPending} onPress={() => consultar.mutate(especie.id)} />
              {f ? <Veda key={f.veda ?? ''} especie={especie} /> : null}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  flex: { flex: 1, minWidth: 0, gap: 4 },
  fila: { paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.line, gap: 10 },
  cabeza: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  presionado: { opacity: 0.75 },
  girado: { transform: [{ rotate: '90deg' }] },
  nombre: { color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  cientifico: { color: palette.muted, fontSize: 13, fontStyle: 'italic' },
  cursiva: { fontStyle: 'italic' },
  marcas: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  derecha: { alignItems: 'flex-end' },
  conteo: { color: palette.ink, fontSize: 18, fontFamily: fonts.extraBold },
  detalle: { gap: 10, padding: 12, borderRadius: 12, backgroundColor: palette.tile },
  texto: { color: palette.ink, fontSize: 13, lineHeight: 19 },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  apagado: { color: palette.muted },
  fuente: { gap: 3, paddingTop: 8, borderTopWidth: 1, borderTopColor: palette.line },
  fuenteTitulo: { color: palette.ink, fontSize: 13, fontFamily: fonts.bold },
  fuenteDato: { color: palette.ink, fontSize: 13, lineHeight: 19 },
  enlaces: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  enlace: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  enlaceTexto: { color: palette.forest, fontSize: 12, fontFamily: fonts.semiBold },
  veda: { gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: palette.line },
  botones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
}));
