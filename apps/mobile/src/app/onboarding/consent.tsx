import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { ConsentForm } from '@/components/ConsentForm';
import { MaskUp, Rise } from '@/components/motion';
import { Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { Body, Eyebrow, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';

/** Étape 2 : consentement à la donnée sensible. Le refus est respecté, sans culpabiliser. */
export default function Consent() {
  const { refresh, signOut } = useApp();
  const [refused, setRefused] = useState(false);

  if (refused) {
    return (
      <Screen
        footer={
          <>
            <Button label="Revenir au choix" onPress={() => setRefused(false)} />
            <Button label="Gérer mon compte" variant="secondary" onPress={() => router.push('/settings')} />
            <Button label="Se déconnecter" variant="ghost" onPress={() => signOut()} />
          </>
        }
      >
        <View style={{ flex: 1, justifyContent: 'center', gap: 12 }} testID="consent-refused">
          <Eyebrow>Consentement refusé</Eyebrow>
          <MaskUp>
            <Title size={34}>Votre choix, respecté.</Title>
          </MaskUp>
          <Rise delay={200}>
            <Body secondary>Sans ce consentement, nous ne pouvons pas vous proposer de profils. Rien n’a été enregistré. Vous pouvez changer d’avis à tout moment.</Body>
          </Rise>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll header={<StepHeader step={2} />}>
      <View style={{ paddingTop: 20 }}>
        <ConsentForm onDone={refresh} onRefuse={() => setRefused(true)} />
      </View>
    </Screen>
  );
}
