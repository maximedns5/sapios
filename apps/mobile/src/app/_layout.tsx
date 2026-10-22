import { BodoniModa_500Medium_Italic } from '@expo-google-fonts/bodoni-moda/500Medium_Italic';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OverlayProvider } from '@/components/Overlay';
import { Gate } from '@/components/Gate';
import { AppStateProvider, useApp } from '@/lib/app-state';
import { CopyProvider } from '@/lib/copy';
import { InboxProvider } from '@/lib/inbox';
import { COLUMN, useLayout } from '@/lib/layout';
import { colors, shadow } from '@/lib/theme';
import { installWebChrome } from '@/lib/web';

SplashScreen.preventAutoHideAsync().catch(() => {});
SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
installWebChrome();

function WithCopy({ children }: { children: React.ReactNode }) {
  const { userId } = useApp();
  return <CopyProvider userId={userId}>{children}</CopyProvider>;
}

/** Sur grand écran, l'app reste une colonne de téléphone centrée sur un fond chaud. */
function Frame({ children }: { children: React.ReactNode }) {
  const { wide } = useLayout();
  return (
    <View style={{ flex: 1, backgroundColor: wide ? colors.surface : colors.bg }}>
      <View style={{ flex: 1, width: '100%', maxWidth: COLUMN, alignSelf: 'center', backgroundColor: colors.bg, overflow: 'hidden', boxShadow: wide ? shadow.card : undefined }}>
        {children}
      </View>
    </View>
  );
}

export default function RootLayout() {
  // Quatre graisses et le logotype : la moitié des fichiers de police de l'ancienne charte.
  const [loaded, error] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    BodoniModa_500Medium_Italic,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  if (!loaded && !error) {
    // Même logo que index.html, en attendant les polices : pas d'écran vide au premier chargement.
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 44, color: colors.text }}>sapios</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <Frame>
          <AppStateProvider>
            <WithCopy>
              <OverlayProvider>
                <InboxProvider>
                  <Gate />
                  <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.bg } }}>
                    <Stack.Screen name="match/[matchId]" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
                    <Stack.Screen name="report/[userId]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                  </Stack>
                </InboxProvider>
              </OverlayProvider>
            </WithCopy>
          </AppStateProvider>
        </Frame>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
