import { useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';

import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { RevealLines } from '@/components/Reveal';
import { Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { Body, Em, Label, Title } from '@/components/Text';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { AppError, errorCode, errorMessage } from '@/lib/errors';
import { ageFrom } from '@/lib/profile';
import { fonts } from '@/lib/theme';

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

export default function Identity() {
  const { refresh, signOut } = useApp();
  const { confirm } = useOverlay();
  const [name, setName] = useState('');
  const [d, setD] = useState('');
  const [m, setM] = useState('');
  const [y, setY] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [underage, setUnderage] = useState(false);
  const mRef = useRef<TextInputInstance>(null);
  const yRef = useRef<TextInputInstance>(null);

  const submit = async () => {
    setError(null);
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
      else if (code === 'legal_name_invalid') setError('Indiquez vos prénom et nom, comme sur votre diplôme.');
      else if (code === 'birthdate_invalid') setError('Date de naissance invalide.');
      else setError(errorMessage(e));
    }
  };

  if (underage) {
    return (
      <Screen tone="dark" footer={<Button label="Se déconnecter" onPress={() => signOut()} />}>
        <View style={{ flex: 1, justifyContent: 'center', gap: 20 }} testID="underage">
          <Label>Accès refusé</Label>
          <RevealLines
            lines={[
              <Title key="a" size={52}>
                Revenez
              </Title>,
              <Title key="b" size={52}>
                <Em>plus tard.</Em>
              </Title>,
            ]}
          />
          <Body style={{ opacity: 0.85 }}>Sapios est réservé aux personnes majeures. L’intelligence n’attend pas le nombre des années, nous si.</Body>
        </View>
      </Screen>
    );
  }

  const dateInput = { fontFamily: fonts.mono, fontSize: 20, textAlign: 'center' as const, letterSpacing: 2 };

  return (
    <Screen scroll header={<StepHeader step={1} />} footer={<Button testID="identity-submit" label="Enregistrer" trailing="→" onPress={submit} />}>
      <View style={{ gap: 26, paddingTop: 12 }}>
        <View>
          <RevealLines
            lines={[
              <Title key="a" size={46}>
                Qui êtes-
              </Title>,
              <Title key="b" size={46}>
                <Em>vous</Em>{'\u00A0'}?
              </Title>,
            ]}
          />
        </View>
        <Body>Votre nom légal sert uniquement à le comparer avec celui inscrit sur votre diplôme. Il n’est jamais affiché.</Body>
        <Field
          testID="legal-name"
          label="Nom légal complet"
          value={name}
          onChangeText={setName}
          placeholder="Prénom Nom, comme sur le diplôme"
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
        />
        <View style={{ gap: 6 }}>
          <Label>Date de naissance</Label>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field testID="birth-day" value={d} onChangeText={(v) => { const n = v.replace(/\D/g, '').slice(0, 2); setD(n); if (n.length === 2) mRef.current?.focus(); }} placeholder="JJ" keyboardType="number-pad" maxLength={2} style={dateInput} />
            </View>
            <View style={{ flex: 1 }}>
              <Field ref={mRef} testID="birth-month" value={m} onChangeText={(v) => { const n = v.replace(/\D/g, '').slice(0, 2); setM(n); if (n.length === 2) yRef.current?.focus(); }} placeholder="MM" keyboardType="number-pad" maxLength={2} style={dateInput} />
            </View>
            <View style={{ flex: 1.6 }}>
              <Field ref={yRef} testID="birth-year" value={y} onChangeText={(v) => setY(v.replace(/\D/g, '').slice(0, 4))} placeholder="AAAA" keyboardType="number-pad" maxLength={4} style={dateInput} />
            </View>
          </View>
        </View>
        <Notice outline title="Non modifiable" message="Ces deux informations sont enregistrées une seule fois. Vérifiez-les : vous ne pourrez plus les changer." />
        {error ? <Notice testID="identity-error" title="Erreur" message={error} /> : null}
      </View>
    </Screen>
  );
}
