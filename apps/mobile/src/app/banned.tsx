import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { RevealLines } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { Body, Em, Label, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';
import { CONTACT_EMAIL } from '@/lib/env';

export default function Banned() {
  const { signOut } = useApp();
  return (
    <Screen
      tone="dark"
      footer={
        <>
          <Button label="Contacter l’éditeur" onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)} />
          <Button label="Mes données" variant="outline" onPress={() => router.push('/settings')} />
          <Button label="Se déconnecter" variant="outline" onPress={() => signOut()} />
        </>
      }
    >
      <View style={{ flex: 1, justifyContent: 'center', gap: 18 }} testID="banned">
        <Label>Compte suspendu</Label>
        <RevealLines
          lines={[
            <Title key="a" size={52}>
              Fin de
            </Title>,
            <Title key="b" size={52}>
              <Em>l’expérience.</Em>
            </Title>,
          ]}
        />
        <Body style={{ opacity: 0.85 }}>Votre compte a été suspendu par la modération. Vous pouvez demander des explications ou exporter vos données en nous écrivant.</Body>
      </View>
    </Screen>
  );
}
