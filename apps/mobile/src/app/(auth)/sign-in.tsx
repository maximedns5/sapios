import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { Button, TextLink } from '@/components/Button';
import { Field } from '@/components/Field';
import { CameraIcon, CapIcon, UserIcon } from '@/components/Icons';
import { MaskUp, Rise } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { Header, Screen } from '@/components/Screen';
import { Body, Heading, Small, Title } from '@/components/Text';
import { Wordmark } from '@/components/Wordmark';
import { appleAvailable, fetchProviders, sendEmailCode, signInWithApple, signInWithGoogle, signInWithPassword, type Providers } from '@/lib/auth';
import { useCopy } from '@/lib/copy';
import { PASSWORD_LOGIN, SITE_URL } from '@/lib/env';
import { AppError, errorMessage } from '@/lib/errors';
import { colors, radius } from '@/lib/theme';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function emailProblem(value: string): string | null {
  if (!value) return 'Indiquez votre email.';
  if (!value.includes('@')) return 'Il manque le « @ » de l’adresse.';
  if (!EMAIL.test(value)) return 'Il manque la fin de l’adresse, par exemple « @ens.fr ».';
  return null;
}

function Need({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <Body size={15} weight="semibold" style={{ flex: 1, lineHeight: 20 }}>
        {text}
      </Body>
    </View>
  );
}

/** Connexion : un email, un lien (et son code). Les modes non configurés ne sont pas affichés. */
export default function SignIn() {
  const { t } = useCopy();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'otp' | 'password'>('otp');
  const [fieldError, setFieldError] = useState<string | null>(null);
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
      if (e instanceof AppError && e.code === 'email_invalid') setFieldError(errorMessage(e));
      else setError(errorMessage(e));
    }
  };

  const checkEmail = () => {
    const value = email.trim().toLowerCase();
    const problem = emailProblem(value);
    setFieldError(problem);
    return problem ? null : value;
  };

  const sendLink = () =>
    run(async () => {
      const value = checkEmail();
      if (!value) return;
      await sendEmailCode(value);
      router.push({ pathname: '/verify', params: { email: value } });
    });

  const passwordLogin = () =>
    run(async () => {
      const value = checkEmail();
      if (!value) return;
      await signInWithPassword(value, password);
    });

  const appleReady = providers.apple && apple;
  const googleReady = providers.google;

  return (
    <Screen scroll testID="sign-in" header={<Header center={<Wordmark size={28} />} />}>
      <View style={{ gap: 22, paddingTop: 12, flex: 1 }}>
        <View style={{ gap: 8 }}>
          <MaskUp delay={50}>
            <Title size={44} style={{ letterSpacing: -1.3 }}>
              Entrez.
            </Title>
          </MaskUp>
          <Rise delay={200}>
            <Body size={17} secondary>
              Première épreuve : ouvrir un email.
            </Body>
          </Rise>
        </View>

        <Rise delay={300} style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, gap: 12 }}>
          <Heading size={15}>Il vous faudra</Heading>
          <Need icon={<UserIcon size={18} color={colors.accent} stroke={2} />} text="Votre nom légal et votre date de naissance" />
          <Need icon={<CameraIcon size={18} color={colors.accent} stroke={2} />} text="Deux photos de vous" />
          <Need icon={<CapIcon size={18} color={colors.accent} stroke={2} />} text="Votre diplôme, en photo ou en PDF" />
          <Small size={14}>Cinq minutes d’inscription. {t('review.delay')}</Small>
        </Rise>

        <Rise delay={400} style={{ gap: 14 }}>
          <Field
            testID="email"
            label="Email"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (fieldError) setFieldError(null);
            }}
            error={fieldError}
            placeholder="vous@exemple.fr"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType={mode === 'otp' ? 'send' : 'next'}
            onSubmitEditing={mode === 'otp' ? sendLink : undefined}
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
          {error ? <Notice testID="auth-error" kind="error" message={error} /> : null}
          {mode === 'otp' ? (
            <Button testID="send-code" label="Recevoir mon lien" onPress={sendLink} />
          ) : (
            <Button testID="submit-password" label="Se connecter" onPress={passwordLogin} />
          )}

          {appleReady || googleReady ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
                <Small>ou</Small>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
              </View>
              {appleReady ? (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={28}
                  style={{ height: 56 }}
                  onPress={() => run(signInWithApple)}
                />
              ) : null}
              {googleReady ? <Button testID="google" label="Continuer avec Google" variant="secondary" onPress={() => run(signInWithGoogle)} /> : null}
            </>
          ) : null}

          {PASSWORD_LOGIN ? (
            <View style={{ alignItems: 'center' }}>
              <TextLink
                testID="toggle-password"
                label={mode === 'otp' ? 'Comptes de test : mot de passe' : 'Recevoir un lien par email'}
                color={colors.muted}
                size={14}
                onPress={() => {
                  setError(null);
                  setMode(mode === 'otp' ? 'password' : 'otp');
                }}
              />
            </View>
          ) : null}
        </Rise>

        <View style={{ flex: 1 }} />
        <View style={{ gap: 2 }}>
          <Small size={13}>Réservé aux personnes majeures. En continuant, vous acceptez notre politique de confidentialité.</Small>
          <View style={{ flexDirection: 'row', gap: 18 }}>
            <TextLink label="Confidentialité" accessibilityRole="link" size={13.5} onPress={() => Linking.openURL(`${SITE_URL}/confidentialite`)} />
            <TextLink label="Contact" accessibilityRole="link" size={13.5} onPress={() => Linking.openURL(`${SITE_URL}/contact`)} />
          </View>
        </View>
      </View>
    </Screen>
  );
}
