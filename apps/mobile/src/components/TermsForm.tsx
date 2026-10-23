import { useState } from 'react';
import { View } from 'react-native';

import { api } from '@/lib/api';
import { useCopy } from '@/lib/copy';
import { errorMessage } from '@/lib/errors';
import { alpha, colors, radius } from '@/lib/theme';
import type { TermsState } from '@sapios/shared';
import { Button } from './Button';
import { Checkbox } from './Controls';
import { CheckIcon } from './Icons';
import { LegalLinks } from './LegalLinks';
import { MaskUp, Rise } from './motion';
import { Notice } from './Notice';
import { Body, Eyebrow, Small, Title } from './Text';

const POINTS = ['terms.point.access', 'terms.point.data', 'terms.point.conduct'] as const;

/**
 * Acceptation des CGU (CGU art. 1.2) : trois points essentiels, liens vers les textes complets, case
 * jamais pré-cochée. `update` : la version a changé depuis la dernière acceptation (art. 14.1), avec la
 * suppression du compte comme alternative.
 */
export function TermsForm({
  terms,
  mode,
  onDone,
  onDelete,
}: {
  terms: TermsState;
  mode: 'first' | 'update';
  onDone: () => Promise<unknown> | void;
  onDelete?: () => void;
}) {
  const { t } = useCopy();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = mode === 'update';

  const accept = async () => {
    setError(null);
    try {
      await api.acceptTerms(terms.current_version);
      await onDone();
    } catch (e) {
      setError(errorMessage(e));
      // Version changée entre-temps : l'état relu affichera le bon texte.
      await onDone();
    }
  };

  return (
    <View style={{ gap: 20 }} testID={update ? 'terms-update' : 'terms-first'}>
      <View style={{ gap: 10 }}>
        <Rise>
          <Eyebrow>{update ? 'Mise à jour des conditions' : 'Conditions d’utilisation'}</Eyebrow>
        </Rise>
        <MaskUp delay={80}>
          <Title size={34}>{t(update ? 'terms.update.title' : 'terms.title')}</Title>
        </MaskUp>
      </View>
      <Rise delay={200}>
        <Body secondary>{t(update ? 'terms.update.lead' : 'terms.lead')}</Body>
      </Rise>
      <Rise delay={280} style={{ backgroundColor: colors.surface, borderRadius: radius.card, paddingHorizontal: 18, paddingVertical: 6 }}>
        {POINTS.map((key, i) => (
          <View key={key} style={{ flexDirection: 'row', gap: 12, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: alpha(colors.accent, 0.12), alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              <CheckIcon size={14} color={colors.accent} />
            </View>
            <Body size={15} style={{ flex: 1, lineHeight: 21 }}>
              {t(key)}
            </Body>
          </View>
        ))}
      </Rise>
      <Rise delay={340}>
        <LegalLinks only={['terms', 'privacy', 'legalNotice']} color={colors.accent} />
      </Rise>
      <Rise delay={400}>
        <Checkbox testID="terms-check" checked={checked} onChange={setChecked} label={t('terms.checkbox')} />
      </Rise>
      {error ? <Notice kind="error" message={error} /> : null}
      <View style={{ gap: 4 }}>
        <Button testID="terms-accept" label={t(update ? 'terms.update.cta' : 'terms.cta')} disabled={!checked} onPress={accept} />
        {update && onDelete ? <Button testID="terms-delete" label={t('terms.update.delete')} variant="ghost" onPress={onDelete} /> : null}
      </View>
      <Small size={13} align="center">
        Version des conditions : {terms.current_version}
      </Small>
    </View>
  );
}
