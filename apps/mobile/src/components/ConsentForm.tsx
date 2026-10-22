import { useState } from 'react';
import { View } from 'react-native';

import { api } from '@/lib/api';
import { useCopy } from '@/lib/copy';
import { CONSENT_VERSION } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { colors, radius } from '@/lib/theme';
import { Button } from './Button';
import { Checkbox } from './Controls';
import { MaskUp, Rise } from './motion';
import { Notice } from './Notice';
import { Body, Eyebrow, Small, Title } from './Text';

const FACTS: [string, string][] = [
  ['Donnée', 'Les genres que vous recherchez'],
  ['Finalité', 'Vous proposer des profils compatibles'],
  ['Visibilité', 'Personne. Jamais affichée.'],
  ['Retrait', 'À tout moment, depuis votre compte'],
];

/** Consentement explicite, séparé et révocable à la donnée sensible (art. 9 RGPD). Case jamais pré-cochée. */
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
    <View style={{ gap: 20 }}>
      <View style={{ gap: 10 }}>
        <Rise>
          <Eyebrow>Donnée sensible, article 9 du RGPD</Eyebrow>
        </Rise>
        <MaskUp delay={80}>
          <Title size={34}>Une question délicate.</Title>
        </MaskUp>
      </View>
      <Rise delay={200}>
        <Body secondary testID="consent-text">
          {t('onboarding.consent')}
        </Body>
      </Rise>
      <Rise delay={280} style={{ backgroundColor: colors.surface, borderRadius: radius.card, paddingHorizontal: 18, paddingVertical: 6 }}>
        {FACTS.map(([k, v], i) => (
          <View key={k} style={{ flexDirection: 'row', paddingVertical: 12, gap: 12, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
            <Small weight="semibold" size={14} style={{ width: 84 }}>
              {k}
            </Small>
            <Body size={15} weight="semibold" style={{ flex: 1, lineHeight: 21 }}>
              {v}
            </Body>
          </View>
        ))}
      </Rise>
      <Rise delay={360}>
        <Checkbox
          testID="consent-check"
          checked={checked}
          onChange={setChecked}
          label="J’accepte explicitement que Sapios traite les genres que je recherche, qui peuvent révéler mon orientation sexuelle, dans le seul but de me proposer des profils."
        />
      </Rise>
      {error ? <Notice kind="error" message={error} /> : null}
      <View style={{ gap: 4 }}>
        <Button testID="consent-grant" label="Je consens" disabled={!checked} onPress={grant} />
        <Button testID="consent-refuse" label="Je refuse" variant="ghost" onPress={onRefuse} />
      </View>
      <Small size={13} align="center">
        Version du texte : {CONSENT_VERSION}
      </Small>
    </View>
  );
}
