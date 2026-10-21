import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, TextLink } from '@/components/Button';
import { Field } from '@/components/Field';
import { Notice } from '@/components/Notice';
import { RevealLines } from '@/components/Reveal';
import { Screen, TopBar } from '@/components/Screen';
import { Body, Em, Label, Title } from '@/components/Text';
import { sendEmailCode, verifyEmailCode } from '@/lib/auth';
import { AppError, errorMessage } from '@/lib/errors';
import { fonts } from '@/lib/theme';

export default function Verify() {
  const { email = '' } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(60);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async () => {
    setError(null);
    try {
      if (!/^\d{6}$/.test(code.trim())) throw new AppError('otp_invalid');
      await verifyEmailCode(email, code.trim());
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const resend = async () => {
    setError(null);
    try {
      await sendEmailCode(email);
      setCooldown(60);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen
      tone="dark"
      scroll
      header={<TopBar left={{ label: '← Retour', onPress: () => router.back() }} right="Connexion" />}
      footer={<Button testID="verify-code" label="Valider" trailing="→" onPress={submit} disabled={code.trim().length < 6} />}
    >
      <View style={{ gap: 28, paddingTop: 24 }}>
        <Label>Code envoyé à {email}</Label>
        <View>
          <RevealLines
            lines={[
              <Title key="a" size={48}>
                Prouvez que
              </Title>,
              <Title key="b" size={48}>
                c’est <Em>vous.</Em>
              </Title>,
            ]}
          />
        </View>
        <Body style={{ opacity: 0.8 }}>Saisissez les six chiffres reçus par email, ou touchez le lien depuis ce téléphone. Si vous les retenez du premier coup, c’est déjà bon signe.</Body>
        <Field
          testID="otp"
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          placeholder="••••••"
          maxLength={6}
          style={{ fontFamily: fonts.mono, fontSize: 32, letterSpacing: 14 }}
          onSubmitEditing={submit}
        />
        {error ? <Notice title="Erreur" message={error} /> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {cooldown > 0 ? (
            <Label style={{ opacity: 0.5 }}>Renvoyer dans {cooldown} s</Label>
          ) : (
            <TextLink label="Renvoyer le code" onPress={resend} />
          )}
          <TextLink label="Changer d’adresse" onPress={() => router.back()} />
        </View>
      </View>
    </Screen>
  );
}
