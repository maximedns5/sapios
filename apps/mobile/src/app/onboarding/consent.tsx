import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { ConsentForm } from '@/components/ConsentForm';
import { RevealLines } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { Body, Em, Label, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';

export default function Consent() {
  const { refresh, signOut } = useApp();
  const [refused, setRefused] = useState(false);

  if (refused) {
    return (
      <Screen
        tone="dark"
        footer={
          <>
            <Button label="Revenir au choix" onPress={() => setRefused(false)} />
            <Button label="Gérer mon compte" variant="outline" onPress={() => router.push('/settings')} />
            <Button label="Se déconnecter" variant="ghost" onPress={() => signOut()} />
          </>
        }
      >
        <View style={{ flex: 1, justifyContent: 'center', gap: 18 }} testID="consent-refused">
          <Label>Consentement refusé</Label>
          <RevealLines
            lines={[
              <Title key="a" size={48}>
                Votre choix,
              </Title>,
              <Title key="b" size={48}>
                <Em>respecté.</Em>
              </Title>,
            ]}
          />
          <Body style={{ opacity: 0.85 }}>
            Sans ce consentement, nous ne pouvons pas vous proposer de profils. Rien n’a été enregistré. Vous pouvez changer d’avis à tout moment.
          </Body>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll header={<StepHeader step={2} />}>
      <View style={{ paddingTop: 12 }}>
        <ConsentForm onDone={refresh} onRefuse={() => setRefused(true)} />
      </View>
    </Screen>
  );
}
