import { router } from 'expo-router';
import { View } from 'react-native';

import { useOverlay } from '@/components/Overlay';
import { ProfileForm } from '@/components/ProfileForm';
import { Header, Screen } from '@/components/Screen';
import { Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';

export default function EditProfile() {
  const { userId, state, refresh } = useApp();
  const { toast } = useOverlay();
  if (!userId || !state) return null;
  return (
    <Screen scroll header={<Header onBack={() => router.back()} />}>
      <View style={{ gap: 22, paddingTop: 4 }}>
        <Title size={30}>Modifier mon profil</Title>
        <ProfileForm
          userId={userId}
          consentGiven={state.onboarding.consent_sensitive}
          criteriaLink={state.can_browse}
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
