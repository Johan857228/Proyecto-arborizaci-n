import { type Href } from 'expo-router';

import { PoliticaDatos } from '@/features/privacidad/components/PoliticaDatos';
import { AppHeader, Card, Page } from '@/shared/components/UI';

/** Política de tratamiento de datos: se puede leer con o sin sesión (el registro la enlaza). */
export default function PoliticaRoute() {
  return (
    <Page maxWidth={720}>
      <AppHeader eyebrow="Privacidad" title="Política de tratamiento de datos" backTo={'/login' as Href} />
      <Card>
        <PoliticaDatos />
      </Card>
    </Page>
  );
}
