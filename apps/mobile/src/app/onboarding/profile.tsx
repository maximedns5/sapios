import { View } from 'react-native';

import { ProfileForm } from '@/components/ProfileForm';
import { RevealLines } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { Em, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';

export default function OnboardingProfile() {
  const { userId, state, refresh } = useApp();
  if (!userId || !state) return null;
  return (
    <Screen scroll header={<StepHeader step={3} />}>
      <View style={{ gap: 26, paddingTop: 12 }}>
        <View>
          <RevealLines
            lines={[
              <Title key="a" size={46}>
                Votre
              </Title>,
              <Title key="b" size={46}>
                <Em>profil.</Em>
              </Title>,
            ]}
          />
        </View>
        <ProfileForm userId={userId} consentGiven={state.onboarding.consent_sensitive} submitLabel="Continuer" onSaved={refresh} />
      </View>
    </Screen>
  );
}
