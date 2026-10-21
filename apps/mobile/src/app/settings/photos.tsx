import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { PhotoManager } from '@/components/PhotoManager';
import { Screen, TopBar } from '@/components/Screen';
import { Body, Em, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';

export default function EditPhotos() {
  const { userId, state, refresh } = useApp();
  if (!userId) return null;
  const active = state?.profile_status === 'active' || state?.profile_status === 'paused';
  return (
    <Screen
      scroll
      header={<TopBar left={{ label: '← Retour', onPress: () => router.back() }} right="Photos" />}
      footer={<Button label="Terminé" onPress={async () => { await refresh(); router.back(); }} />}
    >
      <View style={{ gap: 20, paddingTop: 4 }}>
        <Title size={42}>
          Vos <Em>photos.</Em>
        </Title>
        <Body>La première est la photo principale. Utilisez les flèches pour changer l’ordre.</Body>
        <PhotoManager userId={userId} keepMinimum={active} />
      </View>
    </Screen>
  );
}
