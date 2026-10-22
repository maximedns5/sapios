import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { PhotoManager } from '@/components/PhotoManager';
import { Header, Screen } from '@/components/Screen';
import { Body, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';

export default function EditPhotos() {
  const { userId, state, refresh } = useApp();
  if (!userId) return null;
  const active = state?.profile_status === 'active' || state?.profile_status === 'paused';
  return (
    <Screen
      scroll
      header={<Header onBack={() => router.back()} />}
      footer={
        <Button
          label="Terminé"
          onPress={async () => {
            await refresh();
            router.back();
          }}
        />
      }
    >
      <View style={{ gap: 18, paddingTop: 4 }}>
        <Title size={30}>Mes photos</Title>
        <Body muted>La première est la photo principale. Les flèches changent l’ordre.</Body>
        <PhotoManager userId={userId} keepMinimum={active} />
      </View>
    </Screen>
  );
}
