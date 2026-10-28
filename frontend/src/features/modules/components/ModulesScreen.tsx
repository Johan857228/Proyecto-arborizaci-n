import { type Href } from 'expo-router';
import { Text, View } from 'react-native';

import { fonts } from '@/config/constants';
import { usePendientes } from '@/features/inspections/hooks/useInspecciones';
import { GRUPOS, modulosPara } from '@/features/modules/modulos';
import { useCuentasSinInstitucion, useMiPerfil } from '@/features/perfil/hooks/usePerfil';
import { ETIQUETA_ROL, esAdmin, esRevisor } from '@/features/perfil/schemas';
import { AppHeader, Badge, NavCard, Page } from '@/shared/components/UI';
import { crearEstilos } from '@/theme';

export function ModulesScreen() {
  const styles = useStyles();
  const perfil = useMiPerfil();
  const modulos = modulosPara(perfil.data);
  // Mismo conteo y caché que la pantalla Revisión (limitado a la institución del docente).
  const institucionId = perfil.data?.institucion_id ?? undefined;
  const revision = usePendientes(institucionId, 0, esRevisor(perfil.data) && (esAdmin(perfil.data) || Boolean(institucionId)));
  const pendientes = revision.data?.total ?? 0;
  const cuentasNuevas = useCuentasSinInstitucion(esAdmin(perfil.data));

  return (
    <Page onRefresh={() => void Promise.all([perfil.refetch(), revision.refetch()])} refreshing={perfil.isRefetching}>
      <AppHeader
        eyebrow="Proyecto árbol"
        title="Módulos"
        subtitle="Todo lo que se hace después de registrar un árbol: inspecciones, revisión, mantenimiento, avance de los cursos y la gestión de la institución."
      />
      {perfil.data ? (
        <View style={styles.badges}>
          <Badge label={ETIQUETA_ROL[perfil.data.rol]} tono="info" />
          {perfil.data.institucion_nombre ? <Badge label={perfil.data.institucion_nombre} /> : null}
          {perfil.data.curso_nombre ? <Badge label={`Curso ${perfil.data.curso_nombre}`} /> : null}
        </View>
      ) : null}

      {GRUPOS.map((grupo) => {
        const delGrupo = modulos.filter((modulo) => modulo.grupo === grupo.clave);
        if (delGrupo.length === 0) return null;
        return (
          <View key={grupo.clave} style={styles.grupo}>
            <Text style={styles.grupoTitulo}>{grupo.titulo}</Text>
            <View style={styles.tarjetas}>
              {delGrupo.map((modulo) => (
                <NavCard
                  key={modulo.clave}
                  title={modulo.titulo}
                  text={modulo.texto}
                  href={modulo.href}
                  icon={modulo.icono}
                  badge={modulo.clave === 'revision' ? pendientes : modulo.clave === 'usuarios' ? cuentasNuevas : undefined}
                />
              ))}
            </View>
          </View>
        );
      })}

      <View style={styles.grupo}>
        <Text style={styles.grupoTitulo}>Tu cuenta</Text>
        <View style={styles.tarjetas}>
          <NavCard title="Mi perfil" text="Tu nombre, rol, institución y curso." href={'/(app)/profile' as Href} icon="person" />
        </View>
      </View>
    </Page>
  );
}

const useStyles = crearEstilos(({ palette }) => ({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  grupo: { gap: 12, marginTop: 4 },
  grupoTitulo: { color: palette.ink, fontSize: 18, fontFamily: fonts.extraBold, letterSpacing: -0.3 },
  tarjetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
}));
