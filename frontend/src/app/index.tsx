import { Redirect, type Href } from 'expo-router';

import { useAuthStore } from '@/features/auth/store';

export default function IndexRoute() {
  const session = useAuthStore((state) => state.session);
  return <Redirect href={(session ? '/(app)' : '/login') as Href} />;
}
