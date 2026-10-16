import { Stack } from 'expo-router';

import { palette } from '@/config/constants';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.canvas },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="trees/index" />
      <Stack.Screen
        name="trees/new"
        options={{ presentation: 'card' }}
      />
    </Stack>
  );
}