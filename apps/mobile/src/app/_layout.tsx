import { BodoniModa_400Regular } from '@expo-google-fonts/bodoni-moda/400Regular';
import { BodoniModa_400Regular_Italic } from '@expo-google-fonts/bodoni-moda/400Regular_Italic';
import { BodoniModa_500Medium } from '@expo-google-fonts/bodoni-moda/500Medium';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono/400Regular';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium';
import { IBMPlexMono_700Bold } from '@expo-google-fonts/ibm-plex-mono/700Bold';
import { Inter_300Light } from '@expo-google-fonts/inter/300Light';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OverlayProvider } from '@/components/Overlay';
import { Gate } from '@/components/Gate';
import { AppStateProvider, useApp } from '@/lib/app-state';
import { CopyProvider } from '@/lib/copy';
import { InboxProvider } from '@/lib/inbox';
import { INK, PAPER } from '@/lib/theme';
import { installWebChrome } from '@/lib/web';

SplashScreen.preventAutoHideAsync().catch(() => {});
SystemUI.setBackgroundColorAsync(INK).catch(() => {});
installWebChrome();

function WithCopy({ children }: { children: React.ReactNode }) {
  const { userId } = useApp();
  return <CopyProvider userId={userId}>{children}</CopyProvider>;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    BodoniModa_400Regular,
    BodoniModa_400Regular_Italic,
    BodoniModa_500Medium,
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_700Bold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: INK }}>
      <SafeAreaProvider>
        <AppStateProvider>
          <WithCopy>
            <OverlayProvider>
              <InboxProvider>
                <Gate />
                <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: PAPER } }}>
                  <Stack.Screen name="index" options={{ contentStyle: { backgroundColor: INK } }} />
                  <Stack.Screen name="match/[matchId]" options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }} />
                  <Stack.Screen name="report/[userId]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                </Stack>
              </InboxProvider>
            </OverlayProvider>
          </WithCopy>
        </AppStateProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
