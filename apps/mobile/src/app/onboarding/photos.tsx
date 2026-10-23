import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { ArrowRightIcon } from '@/components/Icons';
import { MaskUp, Rise } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { PhotoManager } from '@/components/PhotoManager';
import { Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { Body, Eyebrow, Title } from '@/components/Text';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { errorMessage } from '@/lib/errors';
import { MIN_PHOTOS } from '@/lib/profile';

/** Étape 4 : de deux à six photos, puis le profil est enregistré et l'on passe au diplôme. */
export default function OnboardingPhotos() {
  const { userId, state, refresh } = useApp();
  const [count, setCount] = useState(state?.onboarding.photos_count ?? 0);
  const [error, setError] = useState<string | null>(null);
  if (!userId) return null;
  const missing = Math.max(0, MIN_PHOTOS - count);

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
      testID="onboarding-photos"
      header={<StepHeader step={5} fraction={Math.min(count, MIN_PHOTOS) / MIN_PHOTOS} />}
      footer={
        <Button
          testID="activate"
          label={missing ? `Encore ${missing} photo${missing > 1 ? 's' : ''}` : 'Continuer vers le diplôme'}
          trailing={missing ? undefined : <ArrowRightIcon size={20} color="#FFFFFF" stroke={2.4} />}
          disabled={!!missing}
          onPress={activate}
        />
      }
    >
      <View style={{ gap: 22, paddingTop: 20 }}>
        <View style={{ gap: 10 }}>
          <Rise>
            <Eyebrow>Plus que deux étapes</Eyebrow>
          </Rise>
          <MaskUp delay={80}>
            <Title size={34}>Vos photos</Title>
          </MaskUp>
          <Rise delay={200}>
            <Body muted>Deux au minimum, six au plus. Votre visage, bien éclairé, sans lunettes de soleil.</Body>
          </Rise>
        </View>
        <Rise delay={280}>
          <PhotoManager userId={userId} keepMinimum={false} onChange={setCount} />
        </Rise>
        {error ? <Notice kind="error" message={error} /> : null}
      </View>
    </Screen>
  );
}
