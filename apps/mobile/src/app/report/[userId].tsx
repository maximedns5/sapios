import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Checkbox, OptionCard } from '@/components/Controls';
import { Field } from '@/components/Field';
import { CrossIcon } from '@/components/Icons';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { Header, Screen } from '@/components/Screen';
import { Body, Heading, Title } from '@/components/Text';
import { IconButton } from '@/components/Button';
import { api } from '@/lib/api';
import { dropCandidate } from '@/lib/candidates';
import { errorMessage } from '@/lib/errors';
import { goToTab } from '@/lib/nav';

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
      header={
        <Header
          right={
            <IconButton label="Annuler le signalement" onPress={() => router.back()}>
              <CrossIcon size={20} />
            </IconButton>
          }
        />
      }
      footer={<Button testID="report-submit" label="Envoyer le signalement" disabled={!reason} onPress={submit} />}
    >
      <View style={{ gap: 20, paddingTop: 4 }}>
        <View style={{ gap: 8 }}>
          <Title size={30}>Signaler {name}</Title>
          <Body muted>La modération examine chaque signalement. La personne n’est pas prévenue.</Body>
        </View>
        <View style={{ gap: 10 }} role="radiogroup" accessibilityLabel="Motif">
          <Heading size={16}>Motif</Heading>
          {REASONS.map(([code, label]) => (
            <OptionCard key={code} testID={`reason-${code}`} label={label} active={reason === code} onPress={() => setReason(code)} />
          ))}
        </View>
        <Field testID="report-details" label="Détails (facultatif)" value={details} onChangeText={setDetails} multiline maxLength={2000} counter placeholder="Ce qui s’est passé, en quelques mots." />
        <Checkbox testID="report-block" checked={alsoBlock} onChange={setAlsoBlock} label={`Bloquer aussi ${name}`} />
        {error ? <Notice kind="error" message={error} /> : null}
      </View>
    </Screen>
  );
}
