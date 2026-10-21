import { Stack } from 'expo-router';

import { PAPER } from '@/lib/theme';

export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: PAPER } }} />;
}
