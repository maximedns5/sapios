import { router } from 'expo-router';
import { View } from 'react-native';

import { ConsentForm } from '@/components/ConsentForm';
import { Screen, TopBar } from '@/components/Screen';
import { useApp } from '@/lib/app-state';

export default function SettingsConsent() {
  const { refresh } = useApp();
  return (
    <Screen scroll header={<TopBar left={{ label: '← Retour', onPress: () => router.back() }} right="Consentement" />}>
      <View style={{ paddingTop: 4 }}>
        <ConsentForm
          onDone={async () => {
            await refresh();
            router.back();
          }}
          onRefuse={() => router.back()}
        />
      </View>
    </Screen>
  );
}
