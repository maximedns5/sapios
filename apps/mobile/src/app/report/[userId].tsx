import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Controls';
import { Field } from '@/components/Field';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { Rule, Screen, TopBar } from '@/components/Screen';
import { Body, Em, Label, Title } from '@/components/Text';
import { api } from '@/lib/api';
import { dropCandidate } from '@/lib/candidates';
import { errorMessage } from '@/lib/errors';
import { goToTab } from '@/lib/nav';
import { INK, PAPER } from '@/lib/theme';

const REASONS: [string, string][] = [
  ['fake_profile', 'Faux profil ou usurpation'],
  ['fake_diploma', 'Diplôme douteux'],
  ['inappropriate_content', 'Photos ou propos inappropriés'],
  ['harassment', 'Harcèlement ou menaces'],
  ['minor', 'Personne mineure'],
  ['scam', 'Arnaque ou spam'],
  ['other', 'Autre'],
];

/** Signalement : motif obligatoire, détails facultatifs, blocage proposé dans la foulée. */
export default function Report() {
  const { userId, name = 'ce membre', matchId } = useLocalSearchParams<{ userId: string; name?: string; matchId?: string }>();
  const { toast } = useOverlay();
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!reason) return;
    setError(null);
    try {
      await api.report(userId, reason, details.trim());
      if (alsoBlock) {
        await api.block(userId);
        dropCandidate(userId);
      }
      toast(alsoBlock ? 'Signalement envoyé. Personne bloquée.' : 'Signalement envoyé. Merci.');
      if (alsoBlock) goToTab(matchId ? '/messages' : '/feed');
      else router.back();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen
      scroll
      testID="report"
      header={<TopBar left={{ label: 'Annuler', onPress: () => router.back() }} right="Signalement" />}
      footer={<Button testID="report-submit" label="Envoyer le signalement" disabled={!reason} onPress={submit} />}
    >
      <View style={{ gap: 20, paddingTop: 4 }}>
        <Title size={40}>
          Signaler <Em>{name}.</Em>
        </Title>
        <Body>La modération examine chaque signalement. La personne n’est pas prévenue.</Body>
        <View>
          <Label style={{ marginBottom: 10 }}>Motif</Label>
          <Rule />
          {REASONS.map(([code, label]) => {
            const active = reason === code;
            return (
              <View key={code}>
                <Pressable testID={`reason-${code}`} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => setReason(code)}>
                  {({ pressed }) => (
                    <View style={{ paddingVertical: 13, paddingHorizontal: 10, backgroundColor: active || pressed ? INK : PAPER, flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Body color={active || pressed ? PAPER : INK}>{label}</Body>
                      <Label color={active || pressed ? PAPER : INK}>{active ? '●' : '○'}</Label>
                    </View>
                  )}
                </Pressable>
                <Rule weight={1} />
              </View>
            );
          })}
        </View>
        <Field testID="report-details" label="Détails (facultatif)" value={details} onChangeText={setDetails} multiline maxLength={2000} counter placeholder="Ce qui s’est passé, en quelques mots." />
        <Checkbox testID="report-block" checked={alsoBlock} onChange={setAlsoBlock} label={`Bloquer aussi ${name}`} />
        {error ? <Notice title="Erreur" message={error} /> : null}
      </View>
    </Screen>
  );
}
