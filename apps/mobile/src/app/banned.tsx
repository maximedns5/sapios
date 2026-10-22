import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { BlockIcon } from '@/components/Icons';
import { MaskUp, PopIn, Rise } from '@/components/motion';
import { Screen } from '@/components/Screen';
import { Body, Eyebrow, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';
import { CONTACT_EMAIL } from '@/lib/env';
import { colors } from '@/lib/theme';

export default function Banned() {
  const { signOut } = useApp();
  return (
    <Screen
      footer={
        <>
          <Button label="Contacter l’éditeur" onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)} />
          <Button label="Mes données" variant="secondary" onPress={() => router.push('/settings')} />
          <Button label="Se déconnecter" variant="ghost" onPress={() => signOut()} />
        </>
      }
    >
      <View style={{ flex: 1, justifyContent: 'center', gap: 14 }} testID="banned">
        <PopIn>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <BlockIcon size={30} color={colors.danger} />
          </View>
        </PopIn>
        <Eyebrow color={colors.danger}>Compte suspendu</Eyebrow>
        <MaskUp>
          <Title size={34}>Fin de l’expérience.</Title>
        </MaskUp>
        <Rise delay={200}>
          <Body secondary>Votre compte a été suspendu par la modération. Vous pouvez demander des explications ou exporter vos données en nous écrivant.</Body>
        </Rise>
      </View>
    </Screen>
  );
}
