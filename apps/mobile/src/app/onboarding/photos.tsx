import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Notice } from '@/components/Notice';
import { PhotoManager } from '@/components/PhotoManager';
import { RevealLines } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { Body, Em, Title } from '@/components/Text';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { errorMessage } from '@/lib/errors';
import { MIN_PHOTOS } from '@/lib/profile';

export default function OnboardingPhotos() {
  const { userId, state, refresh } = useApp();
  const [count, setCount] = useState(state?.onboarding.photos_count ?? 0);
  const [error, setError] = useState<string | null>(null);
  if (!userId) return null;

  const activate = async () => {
    setError(null);
    try {
      await api.activate();
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen
      scroll
      header={<StepHeader step={4} />}
      footer={
        <Button
          testID="activate"
          label={count < MIN_PHOTOS ? `Encore ${MIN_PHOTOS - count} photo${MIN_PHOTOS - count > 1 ? 's' : ''}` : 'Activer mon profil'}
          trailing={count >= MIN_PHOTOS ? '→' : undefined}
          disabled={count < MIN_PHOTOS}
          onPress={activate}
        />
      }
    >
      <View style={{ gap: 22, paddingTop: 12 }}>
        <View>
          <RevealLines
            lines={[
              <Title key="a" size={46}>
                Montrez-vous
              </Title>,
              <Title key="b" size={46}>
                <Em>sous votre meilleur angle.</Em>
              </Title>,
            ]}
          />
        </View>
        <Body>Deux photos minimum, six au maximum. La première est la photo principale.</Body>
        <PhotoManager userId={userId} keepMinimum={false} onChange={setCount} />
        {error ? <Notice title="Erreur" message={error} /> : null}
      </View>
    </Screen>
  );
}
