import { useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';

import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Controls';
import { Field } from '@/components/Field';
import { LockIcon } from '@/components/Icons';
import { MaskUp, PopIn, Rise } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { Body, Eyebrow, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';
import { emploi } from '@/lib/emploi';
import { errorMessage } from '@/lib/errors';
import { alpha, colors } from '@/lib/theme';

const clean = (v: string) => v.trim().replace(/\s+/g, ' ');

/**
 * Étape 2 : prénom et nom. Ils servent à vérifier le diplôme et ne sont transmis à une entreprise qu'au
 * match. Pas de date de naissance : l'âge n'a pas sa place dans un recrutement.
 */
export default function Identity() {
  const { refresh } = useApp();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [adult, setAdult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRef = useRef<TextInputInstance>(null);
  const ok = clean(first).length >= 1 && clean(last).length >= 1 && adult;

  const submit = async () => {
    if (!ok) return;
    setError(null);
    try {
      await emploi.setIdentity(clean(first).slice(0, 40), clean(last).slice(0, 80));
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen scroll header={<StepHeader step={2} />} footer={<Button testID="identity-submit" label="Continuer" disabled={!ok} onPress={submit} />}>
      <View style={{ gap: 22, paddingTop: 20 }}>
        <View style={{ gap: 10 }}>
          <Rise>
            <Eyebrow>Bienvenue chez Sapios</Eyebrow>
          </Rise>
          <MaskUp delay={80}>
            <Title size={34}>Comment vous appelez-vous ?</Title>
          </MaskUp>
          <Rise delay={200}>
            <Body muted>Votre nom sert à vérifier votre diplôme. Les entreprises ne le découvrent qu’au match, jamais avant.</Body>
          </Rise>
        </View>
        <Rise delay={300} style={{ gap: 18 }}>
          <Field
            testID="first-name"
            label="Prénom"
            value={first}
            onChangeText={setFirst}
            autoComplete="given-name"
            textContentType="givenName"
            autoCapitalize="words"
            maxLength={40}
            returnKeyType="next"
            onSubmitEditing={() => lastRef.current?.focus()}
          />
          <Field
            ref={lastRef}
            testID="last-name"
            label="Nom"
            hint="Comme sur votre diplôme."
            value={last}
            onChangeText={setLast}
            autoComplete="family-name"
            textContentType="familyName"
            autoCapitalize="words"
            maxLength={80}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <Checkbox testID="adult" checked={adult} onChange={setAdult} label="J’ai 18 ans ou plus." />
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
                Caché jusqu’au match
              </Body>
              <Body size={14.5} secondary style={{ lineHeight: 21 }}>
                Avant, un recruteur voit « Candidat·e n° 0427 » : votre parcours, jamais votre nom, votre âge ni votre genre.
              </Body>
            </View>
          </View>
        </Rise>
        {error ? <Notice testID="identity-error" kind="error" message={error} /> : null}
      </View>
    </Screen>
  );
}
