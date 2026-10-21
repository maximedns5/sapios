import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { Button, TextLink } from '@/components/Button';
import { Field } from '@/components/Field';
import { Notice } from '@/components/Notice';
import { Reveal } from '@/components/Reveal';
import { Rule, Screen } from '@/components/Screen';
import { Body, Em, Label, Title } from '@/components/Text';
import { CropMarks } from '@/components/CropMarks';
import { Wordmark } from '@/components/Wordmark';
import {
  appleAvailable,
  fetchProviders,
  sendEmailCode,
  signInWithApple,
  signInWithGoogle,
  signInWithPassword,
  type Providers,
} from '@/lib/auth';
import { PASSWORD_LOGIN } from '@/lib/env';
import { AppError, errorMessage } from '@/lib/errors';
import { ease, fonts, PAPER } from '@/lib/theme';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Underline({ delay }: { delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: 550, easing: ease.expoInOut }));
  }, [delay, p]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value }] }));
  return <Animated.View style={[{ position: 'absolute', left: '3%', right: '3%', bottom: 6, height: 2, backgroundColor: PAPER, transformOrigin: 'left' }, style]} />;
}

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'otp' | 'password'>('otp');
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<Providers>({ apple: false, google: false, email: true });
  const [apple, setApple] = useState(false);

  useEffect(() => {
    fetchProviders().then(setProviders);
    appleAvailable().then(setApple);
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof AppError && e.code === 'cancelled') return;
      setError(errorMessage(e));
    }
  };

  const sendCode = () =>
    run(async () => {
      const value = email.trim().toLowerCase();
      if (!EMAIL.test(value)) throw new AppError('email_invalid');
      await sendEmailCode(value);
      router.push({ pathname: '/verify', params: { email: value } });
    });

  const passwordLogin = () =>
    run(async () => {
      const value = email.trim().toLowerCase();
      if (!EMAIL.test(value)) throw new AppError('email_invalid');
      await signInWithPassword(value, password);
    });

  const appleReady = providers.apple && apple;
  const googleReady = providers.google;

  return (
    <Screen tone="dark" scroll testID="sign-in" overlay={<CropMarks />}>
      <View style={{ alignItems: 'center', paddingTop: 36, paddingBottom: 36 }}>
        <Reveal delay={300} duration={700}>
          <Label>Application de rencontre</Label>
        </Reveal>
        <Rule style={{ alignSelf: 'stretch', marginTop: 14, marginBottom: 10, marginHorizontal: 12 }} weight={1.5} />
        <Wordmark size={70} delay={320} />
        <View style={{ alignItems: 'center', marginTop: 22 }}>
          <Reveal delay={820}>
            <Body size={22} style={{ fontFamily: fonts.sansLight, lineHeight: 26 }}>
              pour les gens
            </Body>
          </Reveal>
          <Reveal delay={910}>
            <View>
              <Title size={54} style={{ lineHeight: 60 }}>
                <Em>vraiment</Em>
              </Title>
              <Underline delay={1200} />
            </View>
          </Reveal>
          <Reveal delay={1000}>
            <Body size={22} style={{ fontFamily: fonts.sansLight, lineHeight: 26 }}>
              intelligents.
            </Body>
          </Reveal>
        </View>
      </View>

      <View style={{ gap: 18 }}>
        <Field
          testID="email"
          label="Adresse email"
          value={email}
          onChangeText={setEmail}
          placeholder="vous@exemple.fr"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType={mode === 'otp' ? 'send' : 'next'}
          onSubmitEditing={mode === 'otp' ? sendCode : undefined}
        />
        {mode === 'password' ? (
          <Field
            testID="password"
            label="Mot de passe (comptes de test)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={passwordLogin}
          />
        ) : null}
        {error ? <Notice testID="auth-error" title="Erreur" message={error} /> : null}
        {mode === 'otp' ? (
          <Button testID="send-code" label="Recevoir un code" trailing="→" onPress={sendCode} />
        ) : (
          <Button testID="submit-password" label="Se connecter" trailing="→" onPress={passwordLogin} />
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 }}>
          <Rule weight={1} style={{ flex: 1, opacity: 0.4 }} />
          <Label style={{ opacity: 0.6 }}>ou</Label>
          <Rule weight={1} style={{ flex: 1, opacity: 0.4 }} />
        </View>

        {appleReady ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={0}
            style={{ height: 56 }}
            onPress={() => run(signInWithApple)}
          />
        ) : (
          <Button
            testID="apple"
            label="Continuer avec Apple"
            variant="outline"
            disabled
            trailing={Platform.OS === 'ios' ? 'Non configuré' : 'iOS uniquement'}
          />
        )}
        <Button
          testID="google"
          label="Continuer avec Google"
          variant="outline"
          disabled={!googleReady}
          trailing={googleReady ? '→' : 'Non configuré'}
          onPress={() => run(signInWithGoogle)}
        />

        {PASSWORD_LOGIN ? (
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <TextLink
              testID="toggle-password"
              label={mode === 'otp' ? 'Comptes de test : mot de passe' : 'Recevoir un code par email'}
              onPress={() => {
                setError(null);
                setMode(mode === 'otp' ? 'password' : 'otp');
              }}
            />
          </View>
        ) : null}

        <Label size={9} style={{ textAlign: 'center', opacity: 0.5, marginTop: 18, lineHeight: 15 }}>
          Réservé aux majeurs. En continuant, vous acceptez d’être jugé·e sur vos diplômes.
        </Label>
      </View>
    </Screen>
  );
}
