import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { useDiccionario, useExportar, useInstituciones, type Conjunto, type Exportacion, type Formato } from '@/features/exportar/api';
import { InstitucionSelector, useInstitucionElegida } from '@/features/perfil/components/InstitucionSelector';
import { useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { esAdmin, esRevisor } from '@/features/perfil/schemas';
import { getApiErrorMessage } from '@/services/api/client';
import { InlineMessage, PrimaryButton } from '@/shared/components/FormControls';
import { Icon, type IconName } from '@/shared/components/Icon';
import { AppHeader, Card, EmptyState, LoadingState, Page } from '@/shared/components/UI';
import { crearEstilos, useTema } from '@/theme';

const ETIQUETA_FORMATO: Record<Formato, string> = { csv: 'CSV', geojson: 'GeoJSON', shp: 'Shapefile', zip: 'ZIP' };

const OPCIONES: { conjunto: Conjunto; titulo: string; texto: string; icono: IconName; formatos: Formato[] }[] = [
  {
    conjunto: 'todo',
    titulo: 'Paquete completo',
    texto: 'Inventario (CSV, GeoJSON y Shapefile), inspecciones, intervenciones, diccionario de datos y un LEEME. Ideal para entregar a la Secretaría, la alcaldía o Corpocesar.',
    icono: 'modules',
    formatos: ['zip'],
  },
  {
    conjunto: 'arboles',
    titulo: 'Inventario de árboles',
    texto: 'Un árbol por fila con especie, medidas, ubicación y estado actual. GeoJSON y Shapefile se abren en QGIS o ArcGIS.',
    icono: 'tree',
    formatos: ['csv', 'geojson', 'shp'],
  },
  {
    conjunto: 'inspecciones',
    titulo: 'Inspecciones',
    texto: 'Cada visita con medidas, hallazgos, agentes bióticos y revisión docente.',
    icono: 'review',
    formatos: ['csv'],
  },
  {
    conjunto: 'intervenciones',
    titulo: 'Intervenciones',
    texto: 'Mantenimiento programado, ejecutado o cancelado, con fechas, costos y resultado.',
    icono: 'tools',
    formatos: ['csv'],
  },
];

/** En web la descarga empieza sin salir de la app (el enlace trae Content-Disposition); en el
 *  teléfono se abre en el navegador, que la guarda en Descargas. */
async function abrirDescarga(url: string) {
  if (Platform.OS === 'web') {
    window.location.assign(url);
    return;
  }
  await Linking.openURL(url);
}

function Diccionario() {
  const styles = useStyles();
  const diccionario = useDiccionario(true);
  if (diccionario.isLoading) return <LoadingState text="Cargando el diccionario…" />;
  if (diccionario.error || !diccionario.data) return <InlineMessage>{getApiErrorMessage(diccionario.error)}</InlineMessage>;
  const d = diccionario.data;
  return (
    <View style={styles.diccionario}>
      <Text style={styles.meta}>Coordenadas en {d.sistema_de_coordenadas}. El nombre entre paréntesis es el de la columna en el Shapefile.</Text>
      {Object.entries(d.conjuntos).map(([clave, descripcion]) => (
        <View key={clave} style={styles.grupo}>
          <Text style={styles.grupoTitulo}>{clave}.csv</Text>
          <Text style={styles.meta}>{descripcion}</Text>
          {d.campos.filter((c) => c.conjunto === clave).map((c) => (
            <View key={c.campo} style={styles.campo}>
              <Text style={styles.campoNombre}>{c.campo} <Text style={styles.meta}>({c.nombre_shapefile})</Text></Text>
              <Text style={styles.campoTexto}>{c.descripcion}{c.unidad ? ` · ${c.unidad}` : ''}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export function ExportarScreen() {
  const styles = useStyles();
  const { palette } = useTema();
  const perfil = useMiPerfil();
  const institucion = useInstitucionElegida({ soloPropiaSiNoAdmin: true });
  const instituciones = useInstituciones();
  const exportar = useExportar();
  const [enCurso, setEnCurso] = useState<string>();
  const [ultima, setUltima] = useState<Exportacion>();
  const [verDiccionario, setVerDiccionario] = useState(false);
  const admin = esAdmin(perfil.data);

  if (perfil.isLoading) return <Page><LoadingState /></Page>;
  if (!esRevisor(perfil.data)) {
    return <Page><AppHeader title="Exportar datos" /><EmptyState title="Solo para docentes y administradores" /></Page>;
  }
  const sede = (instituciones.data ?? []).find((i) => i.id === institucion.institucionId);

  async function descargar(conjunto: Conjunto, formato: Formato) {
    const clave = `${conjunto}-${formato}`;
    setEnCurso(clave);
    try {
      const resultado = await exportar.mutateAsync({ conjunto, formato, institucionId: institucion.institucionId });
      setUltima(resultado);
      await abrirDescarga(resultado.url);
    } catch {
      // El error se muestra con exportar.error.
    } finally {
      setEnCurso(undefined);
    }
  }

  return (
    <Page>
      <AppHeader
        eyebrow="Datos abiertos"
        title="Exportar datos"
        subtitle="Llévate los datos de la institución cuando quieras, o entrégalos a la Secretaría, la alcaldía o Corpocesar."
      />
      {admin ? <InstitucionSelector value={institucion.institucionId} onChange={institucion.setInstitucionId} /> : null}

      {sede && !sede.codigo_dane ? (
        <InlineMessage tone="warning">
          {sede.nombre_corto} aún no tiene código DANE. Sin él, la Secretaría no puede cruzar estos datos con el SIMAT.
          {admin ? ' Agrégalo en Configuración → Sedes.' : ' Pídele al administrador que lo agregue.'}
        </InlineMessage>
      ) : null}
      {sede?.codigo_dane ? (
        <View style={styles.dane}>
          <Icon name="building" size={16} color={palette.forest} />
          <Text style={styles.daneTexto}>{sede.nombre} · DANE {sede.codigo_dane}{sede.municipio ? ` · ${sede.municipio}` : ''}</Text>
        </View>
      ) : null}

      {exportar.error ? <InlineMessage>{getApiErrorMessage(exportar.error)}</InlineMessage> : null}
      {ultima && !exportar.isPending ? (
        <InlineMessage tone="success">
          Listo: {ultima.nombre} ({ultima.filas} {ultima.filas === 1 ? 'fila' : 'filas'}). Si la descarga no empezó, usa el botón de abajo; el enlace vence en {Math.round(ultima.vence_en_segundos / 60)} minutos.
        </InlineMessage>
      ) : null}
      {ultima && !exportar.isPending ? (
        <PrimaryButton title="Descargar de nuevo" icon="download" variant="secondary" onPress={() => void abrirDescarga(ultima.url)} />
      ) : null}
      {ultima && ultima.sin_codigo_dane.length > 0 ? (
        <InlineMessage tone="warning">Sedes incluidas sin código DANE: {ultima.sin_codigo_dane.join(', ')}.</InlineMessage>
      ) : null}

      <View style={styles.opciones}>
        {OPCIONES.map((opcion) => (
          <Card key={opcion.conjunto} title={opcion.titulo} icon={opcion.icono}>
            <Text style={styles.texto}>{opcion.texto}</Text>
            <View style={styles.botones}>
              {opcion.formatos.map((formato) => (
                <PrimaryButton
                  key={formato}
                  title={opcion.conjunto === 'todo' ? 'Descargar paquete (ZIP)' : ETIQUETA_FORMATO[formato]}
                  icon="download"
                  compact
                  variant={opcion.conjunto === 'todo' ? 'primary' : 'secondary'}
                  disabled={Boolean(enCurso) && enCurso !== `${opcion.conjunto}-${formato}`}
                  loading={enCurso === `${opcion.conjunto}-${formato}`}
                  onPress={() => void descargar(opcion.conjunto, formato)}
                />
              ))}
            </View>
          </Card>
        ))}
      </View>

      <Card title="Qué incluye" icon="info">
        <Text style={styles.texto}>
          Coordenadas en WGS84 (EPSG:4326), CSV separado por comas en UTF-8 (se abre en Excel) y cada sede con su código DANE y DIVIPOLA.
        </Text>
        <Text style={styles.texto}>
          No incluye datos personales: ni nombres de estudiantes ni de responsables, ni notas de texto libre (Ley 1581 de 2012). Cada fila se identifica con el código del árbol.
        </Text>
        <Pressable accessibilityRole="button" onPress={() => setVerDiccionario((v) => !v)} style={styles.enlace}>
          <Text style={styles.enlaceTexto}>{verDiccionario ? 'Ocultar el diccionario de datos' : 'Ver el diccionario de datos'}</Text>
          <Icon name={verDiccionario ? 'chevronLeft' : 'chevronRight'} size={16} color={palette.forest} />
        </Pressable>
        {verDiccionario ? <Diccionario /> : null}
        {admin ? (
          <Pressable accessibilityRole="link" onPress={() => router.push('/(app)/settings?vista=sedes' as Href)} style={styles.enlace}>
            <Text style={styles.enlaceTexto}>Editar los códigos DANE de las sedes</Text>
            <Icon name="chevronRight" size={16} color={palette.forest} />
          </Pressable>
        ) : null}
      </Card>
    </Page>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  opciones: { gap: 14 },
  texto: { color: palette.ink, fontSize: 14, lineHeight: 20 },
  botones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dane: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: palette.forestSoft },
  daneTexto: { flex: 1, color: palette.ink, fontSize: 13, fontFamily: fonts.semiBold },
  enlace: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 2 },
  enlaceTexto: { color: palette.forest, fontSize: 14, fontFamily: fonts.bold },
  diccionario: { gap: 14 },
  grupo: { gap: 6 },
  grupoTitulo: { color: palette.ink, fontSize: 15, fontFamily: fonts.bold },
  campo: { gap: 1, paddingVertical: 6, borderTopWidth: 1, borderTopColor: palette.line },
  campoNombre: { color: palette.ink, fontSize: 13, fontFamily: fonts.bold },
  campoTexto: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  meta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
}));
