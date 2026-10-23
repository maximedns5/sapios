import { useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';

import { Button } from '@/components/Button';
import { Field, FieldError } from '@/components/Field';
import { LockIcon } from '@/components/Icons';
import { MaskUp, PopIn, Rise } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { Body, Eyebrow, Label, Title } from '@/components/Text';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { AppError, errorCode, errorMessage } from '@/lib/errors';
import { ageFrom } from '@/lib/profile';
import { alpha, colors } from '@/lib/theme';

function parseDate(d: string, m: string, y: string): Date | null {
  const day = Number(d);
  const month = Number(m);
  const year = Number(y);
  if (!day || !month || y.length !== 4) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (year < 1900 || date > new Date()) return null;
  return date;
}

/** Étape 1 : nom légal et date de naissance, enregistrés une seule fois (comparaison avec le diplôme). */
export default function Identity() {
  const { refresh, signOut } = useApp();
  const { confirm } = useOverlay();
  const [name, setName] = useState('');
  const [d, setD] = useState('');
  const [m, setM] = useState('');
  const [y, setY] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [underage, setUnderage] = useState(false);
  const mRef = useRef<TextInputInstance>(null);
  const yRef = useRef<TextInputInstance>(null);

  const submit = async () => {
    setError(null);
    setNameError(null);
    setDateError(null);
    try {
      const legal = name.trim().replace(/\s+/g, ' ');
      if (legal.length < 3 || !legal.includes(' ')) throw new AppError('legal_name_invalid');
      const date = parseDate(d, m, y);
      if (!date) throw new AppError('birthdate_invalid');
      if (ageFrom(new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())) < 18) throw new AppError('underage');
      const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      const ok = await confirm({
        label: 'Non modifiable',
        title: 'Dernière vérification.',
        message: `${legal}, né·e le ${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}. Ces informations ne pourront plus être modifiées.`,
        confirm: 'Je confirme',
        cancel: 'Corriger',
      });
      if (!ok) return;
      await api.setIdentity(legal, iso);
      await refresh();
    } catch (e) {
      const code = errorCode(e);
      if (code === 'underage') setUnderage(true);
      else if (code === 'legal_name_invalid') setNameError('Indiquez vos prénom et nom, comme sur votre diplôme.');
      else if (code === 'birthdate_invalid') setDateError('Date de naissance invalide.');
      else setError(errorMessage(e));
    }
  };

  if (underage) {
    return (
      <Screen footer={<Button label="Se déconnecter" variant="secondary" onPress={() => signOut()} />}>
        <View style={{ flex: 1, justifyContent: 'center', gap: 14 }} testID="underage">
          <Eyebrow>Accès refusé</Eyebrow>
          <MaskUp>
            <Title size={34}>Revenez plus tard.</Title>
          </MaskUp>
          <Rise delay={200}>
            <Body secondary>Sapios est réservé aux personnes majeures. L’intelligence n’attend pas le nombre des années, nous si.</Body>
          </Rise>
        </View>
      </Screen>
    );
  }

  const digits = (v: string, n: number) => v.replace(/\D/g, '').slice(0, n);

  return (
    <Screen scroll header={<StepHeader step={2} />} footer={<Button testID="identity-submit" label="Continuer" onPress={submit} />}>
      <View style={{ gap: 22, paddingTop: 20 }}>
        <View style={{ gap: 10 }}>
          <Rise>
            <Eyebrow>Bienvenue chez Sapios</Eyebrow>
          </Rise>
          <MaskUp delay={80}>
            <Title size={34}>Qui êtes-vous ?</Title>
          </MaskUp>
          <Rise delay={200}>
            <Body muted>Votre nom légal sert uniquement à le comparer à celui de votre diplôme. Il n’est jamais affiché.</Body>
          </Rise>
        </View>
        <Rise delay={300} style={{ gap: 18 }}>
          <Field
            testID="legal-name"
            label="Nom légal complet"
            value={name}
            onChangeText={(v) => {
              setName(v);
              setNameError(null);
            }}
            error={nameError}
            placeholder="Prénom Nom, comme sur le diplôme"
            autoComplete="name"
            textContentType="name"
            autoCapitalize="words"
          />
          <View style={{ gap: 8 }}>
            <Label nativeID="birth-label">Date de naissance</Label>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field
                  testID="birth-day"
                  accessibilityLabel="Jour de naissance"
                  value={d}
                  onChangeText={(v) => {
                    const n = digits(v, 2);
                    setD(n);
                    setDateError(null);
                    if (n.length === 2) mRef.current?.focus();
                  }}
                  placeholder="JJ"
                  keyboardType="number-pad"
                  maxLength={2}
                  style={{ textAlign: 'center' }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  ref={mRef}
                  testID="birth-month"
                  accessibilityLabel="Mois de naissance"
                  value={m}
                  onChangeText={(v) => {
                    const n = digits(v, 2);
                    setM(n);
                    setDateError(null);
                    if (n.length === 2) yRef.current?.focus();
                  }}
                  placeholder="MM"
                  keyboardType="number-pad"
                  maxLength={2}
                  style={{ textAlign: 'center' }}
                />
              </View>
              <View style={{ flex: 1.5 }}>
                <Field
                  ref={yRef}
                  testID="birth-year"
                  accessibilityLabel="Année de naissance"
                  value={y}
                  onChangeText={(v) => {
                    setY(digits(v, 4));
                    setDateError(null);
                  }}
                  placeholder="AAAA"
                  keyboardType="number-pad"
                  maxLength={4}
                  style={{ textAlign: 'center' }}
                  onSubmitEditing={submit}
                />
              </View>
            </View>
            {dateError ? <FieldError message={dateError} /> : null}
          </View>
        </Rise>
        <Rise delay={400}>
          <View style={{ flexDirection: 'row', gap: 12, backgroundColor: alpha(colors.accent, 0.07), borderRadius: 20, padding: 16 }}>
            <PopIn delay={700}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                <LockIcon size={18} color={colors.accent} stroke={2} />
              </View>
            </PopIn>
            <View style={{ flex: 1, gap: 2 }}>
              <Body weight="bold" size={15}>
                Enregistré une seule fois
              </Body>
              <Body size={14.5} secondary style={{ lineHeight: 21 }}>
                Vérifiez bien : ces deux informations ne pourront plus être modifiées.
              </Body>
            </View>
          </View>
        </Rise>
        {error ? <Notice testID="identity-error" kind="error" message={error} /> : null}
      </View>
    </Screen>
  );
}
