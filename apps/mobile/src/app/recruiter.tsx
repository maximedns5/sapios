import * as Linking from 'expo-linking';
import { View } from 'react-native';

import { Button, TextLink } from '@/components/Button';
import { BuildingIcon } from '@/components/Icons';
import { MaskUp, PopIn, Rise } from '@/components/motion';
import { Header, Screen } from '@/components/Screen';
import { Body, Eyebrow, Title } from '@/components/Text';
import { Wordmark } from '@/components/Wordmark';
import { useApp } from '@/lib/app-state';
import { RECRUITER_URL } from '@/lib/env';
import { alpha, colors } from '@/lib/theme';

/** Compte recruteur ouvert dans l'app candidat : l'espace recruteur est sur le web. */
export default function RecruiterRedirect() {
  const { state, signOut } = useApp();
  const company = state?.recruiter?.company_name;
  return (
    <Screen
      testID="recruiter-redirect"
      header={<Header center={<Wordmark size={26} />} right={<TextLink label="Se déconnecter" color={colors.muted} size={14} onPress={() => signOut()} />} />}
      footer={<Button testID="open-recruiter-space" label="Ouvrir l’espace recruteur" onPress={() => Linking.openURL(RECRUITER_URL)} />}
    >
      <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
        <PopIn>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: alpha(colors.accent, 0.1), alignItems: 'center', justifyContent: 'center' }}>
            <BuildingIcon size={34} color={colors.accent} stroke={1.9} />
          </View>
        </PopIn>
        <Rise delay={80}>
          <Eyebrow>Compte recruteur{company ? ` · ${company}` : ''}</Eyebrow>
        </Rise>
        <MaskUp delay={140}>
          <Title size={32}>Votre espace recruteur est sur le web</Title>
        </MaskUp>
        <Rise delay={260}>
          <Body secondary>
            Publier une offre, trier les candidatures anonymes et proposer des entretiens se fait depuis le site, sur ordinateur ou sur téléphone. Cette app est réservée aux candidats.
          </Body>
        </Rise>
        <Rise delay={340}>
          <Body muted size={14.5}>
            {RECRUITER_URL.replace(/^https?:\/\//, '')}
          </Body>
        </Rise>
      </View>
    </Screen>
  );
}
