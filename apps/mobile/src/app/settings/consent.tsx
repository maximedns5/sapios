import { router } from 'expo-router';
import { View } from 'react-native';

import { ConsentForm } from '@/components/ConsentForm';
import { Header, Screen } from '@/components/Screen';
import { useApp } from '@/lib/app-state';

export default function SettingsConsent() {
  const { refresh } = useApp();
  return (
    <Screen scroll header={<Header onBack={() => router.back()} />}>
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
