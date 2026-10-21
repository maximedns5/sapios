import { Stack } from 'expo-router';

import { INK } from '@/lib/theme';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: INK } }} />;
}
