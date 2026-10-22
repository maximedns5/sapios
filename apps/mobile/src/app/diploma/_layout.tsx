import { Stack } from 'expo-router';

import { colors } from '@/lib/theme';

export default function DiplomaLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.bg } }} />;
}
