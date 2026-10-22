import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View, type TextInputInstance } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';

import { Button, TextLink } from '@/components/Button';
import { FieldError } from '@/components/Field';
import { CheckIcon } from '@/components/Icons';
import { MaskUp, PopIn, Rise } from '@/components/motion';
import { Header, Screen } from '@/components/Screen';
import { Body, Label, Small, Strong, Title } from '@/components/Text';
import { Wordmark } from '@/components/Wordmark';
import { sendEmailCode, verifyEmailCode } from '@/lib/auth';
import { AppError, errorMessage } from '@/lib/errors';
import { alpha, colors, ease, fonts } from '@/lib/theme';

/** Enveloppe : la lettre (cochée) sort de la poche une fois l'envoi fait. */
function Envelope() {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) p.value = withDelay(450, withTiming(1, { duration: 800, easing: ease.out }));
  }, [p, reduced]);
  const letter = useAnimatedStyle(() => ({ transform: [{ translateY: 10 - p.value * 52 }] }));
  return (
    <PopIn duration={550}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 132, height: 132 }}>
        <Svg width={132} height={132} style={{ position: 'absolute' }}>
          <Path d="M0 48 L66 4 L132 48 Z" fill={alpha(colors.accent, 0.28)} />
          <Rect x={0} y={48} width={132} height={84} rx={12} fill={alpha(colors.accent, 0.45)} />
        </Svg>
        <Animated.View
          style={[{ position: 'absolute', left: 14, right: 14, bottom: 10, height: 86, borderRadius: 10, backgroundColor: '#FFFFFF', padding: 12, gap: 7, boxShadow: '0px 6px 18px rgba(26,25,24,0.16)' }, letter]}
        >
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
            <CheckIcon size={12} stroke={3.4} color="#FFFFFF" />
          </View>
          <View style={{ height: 6, width: '80%', borderRadius: 3, backgroundColor: colors.line }} />
          <View style={{ height: 6, width: '55%', borderRadius: 3, backgroundColor: colors.line }} />
        </Animated.View>
        <Svg width={132} height={132} style={{ position: 'absolute' }}>
          <Path d="M0 70 L66 104 L132 70 L132 120 Q132 132 120 132 L12 132 Q0 132 0 120 Z" fill={colors.accent} />
        </Svg>
      </View>
    </PopIn>
  );
}

function Digit({ ch, active }: { ch: string; active: boolean }) {
  return (
    <View
      style={{
        flex: 1,
        height: 60,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: ch ? '#FFFFFF' : colors.surface,
        borderWidth: 2,
        borderColor: active ? colors.accent : ch ? colors.disabled : colors.surface,
      }}
    >
      {ch ? (
        <PopIn duration={250} overshoot={1.15}>
          <Body size={24} weight="extrabold">
            {ch}
          </Body>
        </PopIn>
      ) : null}
    </View>
  );
}

/** Lien envoyé : ouvrir l'email sur cet appareil, ou saisir le code à six chiffres qu'il contient. */
export default function Verify() {
  const { email = '' } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(60);
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInputInstance>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
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
      scroll
      testID="verify"
      header={<Header onBack={() => router.back()} backLabel="Modifier l’adresse" center={<Wordmark size={26} />} />}
      footer={<Button testID="verify-code" label="Entrer" onPress={submit} disabled={code.trim().length < 6} />}
    >
      <View style={{ alignItems: 'center', gap: 14, paddingTop: 16 }}>
        <Envelope />
        <MaskUp delay={300}>
          <Title size={30} align="center">
            Vérifiez vos emails
          </Title>
        </MaskUp>
        <Rise delay={450}>
          <Body secondary align="center" size={15.5}>
            Un lien de connexion vient de partir à <Strong color={colors.text}>{email}</Strong>. Ouvrez-le sur cet appareil, ou saisissez le code reçu.
          </Body>
        </Rise>
      </View>
      <Rise delay={600} style={{ gap: 10, marginTop: 24 }}>
        <Label nativeID="otp-label">Code à 6 chiffres</Label>
        <Pressable onPress={() => input.current?.focus()} accessible={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {Array.from({ length: 6 }, (_, i) => (
              <Digit key={i} ch={code[i] ?? ''} active={focused && i === Math.min(code.length, 5)} />
            ))}
          </View>
          <TextInput
            ref={input}
            testID="otp"
            value={code}
            onChangeText={(v) => {
              setCode(v.replace(/\D/g, '').slice(0, 6));
              setError(null);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            autoFocus
            accessibilityLabel="Code à 6 chiffres"
            onSubmitEditing={submit}
            caretHidden
            style={[
              { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, fontSize: 16, color: 'transparent', fontFamily: fonts.regular },
              Platform.OS === 'web' ? ({ outlineStyle: 'none', cursor: 'text' } as object) : null,
            ]}
          />
        </Pressable>
        {error ? <FieldError message={error} testID="otp-error" /> : <Small>Lien et code valables une heure.</Small>}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 6 }}>
          {cooldown > 0 ? (
            <Small style={{ minHeight: 44, textAlignVertical: 'center', paddingTop: 12 }}>Renvoyer dans {cooldown} s</Small>
          ) : (
            <TextLink label="Renvoyer l’email" color={colors.muted} size={14.5} onPress={resend} />
          )}
          <TextLink label="Modifier l’adresse" color={colors.muted} size={14.5} onPress={() => router.back()} />
        </View>
      </Rise>
    </Screen>
  );
}
