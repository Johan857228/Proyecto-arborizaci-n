import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { especiesService, useCatalogoEspecies, useRefrescarCatalogo } from '@/features/especies/api';
import { FichaEspecie } from '@/features/especies/components/FichaEspecie';
import { FILTROS, filtrarEspecies, ordenDeConsulta, type Catalogo, type Filtro } from '@/features/especies/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { ChoiceChip, Field, InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { AppHeader, Card, ErrorState, LoadingState, Notice, Page, ProgressBar, StatGrid, StatTile } from '@/shared/components/UI';
import { formatNumero } from '@/shared/format';
import { crearEstilos } from '@/theme';

interface Avance {
  hechas: number;
  total: number;
  actual?: string;
  errores: string[];
  terminado: boolean;
}

/** Consulta las listas oficiales para varias especies, una por una, con avance y opción de parar. */
function ActualizarDesdeFuentes({ catalogo }: { catalogo: Catalogo }) {
  const styles = useStyles();
  const refrescar = useRefrescarCatalogo();
  const [avance, setAvance] = useState<Avance | null>(null);
  const parar = useRef(false);
  const sinFicha = catalogo.especies.filter((e) => !e.ficha).length;
  const corriendo = Boolean(avance && !avance.terminado);

  async function actualizar(todas: boolean) {
    const lista = ordenDeConsulta(catalogo.especies).filter((e) => todas || !e.ficha);
    parar.current = false;
    const errores: string[] = [];
    setAvance({ hechas: 0, total: lista.length, errores, terminado: false });
    for (const [i, especie] of lista.entries()) {
      if (parar.current) break;
      setAvance({ hechas: i, total: lista.length, actual: especie.nombre_comun, errores: [...errores], terminado: false });
      try {
        await especiesService.consultar(especie.id);
      } catch (error) {
        const mensaje = getApiErrorMessage(error);
        errores.push(`${especie.nombre_comun}: ${mensaje}`);
        // Sin conexión con GBIF no tiene sentido seguir con las demás.
        if (/GBIF|conexi/i.test(mensaje)) break;
      }
      setAvance({ hechas: i + 1, total: lista.length, errores: [...errores], terminado: false });
    }
    setAvance((a) => a && { ...a, actual: undefined, errores: [...errores], terminado: true });
    refrescar();
  }

  return (
    <Card title="Fuentes oficiales" subtitle="Listas que el SiB Colombia publica en GBIF. Cada ficha guarda la versión y el DOI de la lista que consultó." icon="leaf">
      {catalogo.listas.map((l) => <Text key={l.clave} style={styles.lista}>• {l.titulo} ({l.editor})</Text>)}
      {avance ? (
        <View style={styles.avance}>
          <ProgressBar pct={avance.total ? (100 * avance.hechas) / avance.total : 100} />
          <Text style={styles.meta}>
            {avance.terminado
              ? `Listo: ${avance.hechas} de ${avance.total} especies consultadas.`
              : `Consultando ${avance.hechas + 1} de ${avance.total}${avance.actual ? `: ${avance.actual}` : ''}…`}
          </Text>
          {avance.errores.map((e) => <InlineMessage key={e}>{e}</InlineMessage>)}
        </View>
      ) : null}
      <View style={styles.botones}>
        {corriendo ? (
          <PrimaryButton title="Detener" variant="ghost" compact onPress={() => { parar.current = true; }} />
        ) : (
          <>
            {sinFicha ? <PrimaryButton title={`Consultar ${sinFicha} sin ficha`} icon="refresh" compact onPress={() => void actualizar(false)} /> : null}
            <PrimaryButton title="Actualizar todas" icon="refresh" compact variant="secondary" onPress={() => void actualizar(true)} />
          </>
        )}
      </View>
      <Text style={styles.meta}>Cada especie tarda unos segundos. La veda se registra a mano en la ficha de la especie, con su norma.</Text>
    </Card>
  );
}

/** Catálogo de especies con fuente oficial: nativas, exóticas, invasoras, amenazadas, en veda y
 *  de bosque seco del Cesar, con la fuente de cada dato. */
export function CatalogoEspeciesScreen() {
  const styles = useStyles();
  const catalogo = useCatalogoEspecies();
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [texto, setTexto] = useState('');
  const datos = catalogo.data;
  const r = datos?.resumen;
  const lista = datos ? filtrarEspecies(datos.especies, filtro, texto) : [];

  return (
    <Page onRefresh={() => void catalogo.refetch()} refreshing={catalogo.isRefetching}>
      <AppHeader
        eyebrow="Catálogo de Plantas de Colombia · SiB"
        title="Catálogo de especies"
        subtitle="Qué especies son nativas, exóticas, invasoras, amenazadas o están en veda, según las listas oficiales y con la fuente de cada dato."
      />
      {catalogo.isLoading ? (
        <LoadingState text="Cargando el catálogo…" />
      ) : catalogo.error && !datos ? (
        <ErrorState error={catalogo.error} onRetry={() => void catalogo.refetch()} />
      ) : datos && r ? (
        <>
          {datos.migracion_pendiente ? (
            <Notice tono="riesgo">Falta aplicar la migración 015 en Supabase: mientras tanto el origen sale de la lista de la app, sin fuente oficial.</Notice>
          ) : null}
          <StatGrid>
            <StatTile label="Árboles de especies nativas" value={r.pct_arboles_nativos == null ? '—' : `${formatNumero(r.pct_arboles_nativos, 0)} %`}
              hint={`${r.nativas} especies nativas y ${r.exoticas} exóticas`} icon="leaf" tono="sano" />
            <StatTile label="Nativas del bosque seco del Cesar" value={r.bosque_seco_cesar}
              hint={`${formatNumero(r.arboles_bosque_seco_cesar, 0)} árboles`} icon="tree" tono="sano" />
            <StatTile label="Especies amenazadas" value={r.amenazadas} hint="Resolución 0126 de 2024" icon="warning" tono={r.amenazadas ? 'riesgo' : undefined} />
            <StatTile label="Especies invasoras" value={r.invasoras} hint={`${formatNumero(r.arboles_invasoras, 0)} árboles · ${r.en_veda} en veda`}
              icon="pest" tono={r.invasoras ? 'critico' : undefined} />
          </StatGrid>
          <Text style={styles.meta}>{r.con_ficha} de {r.especies} especies tienen ficha oficial.</Text>

          {datos.editable ? <ActualizarDesdeFuentes catalogo={datos} /> : null}

          <Card title="Especies" subtitle="Toca una especie para ver su ficha y la fuente de cada dato." icon="list">
            <Field label="Buscar" value={texto} onChangeText={setTexto} placeholder="Nombre común o científico" autoCapitalize="none" />
            <View style={styles.chips}>
              {(Object.keys(FILTROS) as Filtro[]).map((f) => <ChoiceChip key={f} label={FILTROS[f]} selected={filtro === f} onPress={() => setFiltro(f)} />)}
            </View>
            {lista.length ? lista.map((e) => <FichaEspecie key={e.id} especie={e} editable={datos.editable} />)
              : <Text style={styles.meta}>Ninguna especie con ese filtro.</Text>}
          </Card>
        </>
      ) : null}
    </Page>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  botones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  avance: { gap: 8 },
  lista: { color: palette.ink, fontSize: 13, lineHeight: 19 },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
}));
