import { router } from 'expo-router';
import { View } from 'react-native';

import { useOverlay } from '@/components/Overlay';
import { ProfileForm } from '@/components/ProfileForm';
import { Screen, TopBar } from '@/components/Screen';
import { Em, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';

export default function EditProfile() {
  const { userId, state, refresh } = useApp();
  const { toast } = useOverlay();
  if (!userId || !state) return null;
  return (
    <Screen scroll header={<TopBar left={{ label: '← Retour', onPress: () => router.back() }} right="Profil" />}>
      <View style={{ gap: 24, paddingTop: 4 }}>
        <Title size={42}>
          Modifier <Em>le profil.</Em>
        </Title>
        <ProfileForm
          userId={userId}
          consentGiven={state.onboarding.consent_sensitive}
          submitLabel="Enregistrer"
          onSaved={async () => {
            await refresh();
            toast('Profil enregistré.');
            router.back();
          }}
        />
      </View>
    </Screen>
  );
}
