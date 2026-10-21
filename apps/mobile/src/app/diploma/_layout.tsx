import { Stack } from 'expo-router';

import { PAPER } from '@/lib/theme';

export default function DiplomaLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: PAPER } }} />;
}
