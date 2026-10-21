import { useState } from 'react';
import { View } from 'react-native';

import { api } from '@/lib/api';
import { useCopy } from '@/lib/copy';
import { CONSENT_VERSION } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { Button } from './Button';
import { Checkbox } from './Controls';
import { Notice } from './Notice';
import { RevealLines } from './Reveal';
import { Rule } from './Screen';
import { Body, Em, Label, Title } from './Text';

const FACTS: [string, string][] = [
  ['Donnée', 'Les genres que vous recherchez'],
  ['Finalité', 'Vous proposer des profils compatibles'],
  ['Visibilité', 'Personne. Jamais affichée.'],
  ['Retrait', 'À tout moment, depuis « Compte »'],
];

/** Consentement explicite, séparé et révocable à la donnée sensible (art. 9 RGPD). */
export function ConsentForm({ onDone, onRefuse }: { onDone: () => Promise<unknown> | void; onRefuse: () => void }) {
  const { t } = useCopy();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grant = async () => {
    setError(null);
    try {
      await api.setConsent(true, CONSENT_VERSION);
      await onDone();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <View style={{ gap: 22 }}>
      <Label>Donnée sensible — article 9 du RGPD</Label>
      <View>
        <RevealLines
          lines={[
            <Title key="a" size={46}>
              Une question
            </Title>,
            <Title key="b" size={46}>
              <Em>délicate.</Em>
            </Title>,
          ]}
        />
      </View>
      <Body testID="consent-text">{t('onboarding.consent')}</Body>
      <View>
        {FACTS.map(([k, v]) => (
          <View key={k}>
            <Rule weight={1} />
            <View style={{ flexDirection: 'row', paddingVertical: 10, gap: 12 }}>
              <Label style={{ width: 92 }}>{k}</Label>
              <Body size={14} style={{ flex: 1, lineHeight: 19 }}>
                {v}
              </Body>
            </View>
          </View>
        ))}
        <Rule weight={1} />
      </View>
      <Checkbox
        testID="consent-check"
        checked={checked}
        onChange={setChecked}
        label="J’accepte explicitement que Sapios traite les genres que je recherche, qui peuvent révéler mon orientation sexuelle, dans le seul but de me proposer des profils."
      />
      {error ? <Notice title="Erreur" message={error} /> : null}
      <View style={{ gap: 10 }}>
        <Button testID="consent-grant" label="Je consens" disabled={!checked} onPress={grant} />
        <Button testID="consent-refuse" label="Je refuse" variant="outline" onPress={onRefuse} />
      </View>
      <Label size={9} style={{ opacity: 0.55 }}>
        Version du texte : {CONSENT_VERSION}
      </Label>
    </View>
  );
}
