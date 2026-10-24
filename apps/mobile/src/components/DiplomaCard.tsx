import { levelLabel, STUDY_FIELD_LABELS } from '@sapios/shared';
import { router } from 'expo-router';
import { View } from 'react-native';

import { useApp } from '@/lib/app-state';
import { useCopy } from '@/lib/copy';
import { formatShortDate } from '@/lib/format';
import { isInReview } from '@/lib/types';
import { alpha, colors, radius } from '@/lib/theme';
import { CapIcon, VerifiedBadge } from './Icons';
import { LiveDot } from './ApplicationBits';
import { Body, Small } from './Text';

/**
 * Badge diplôme : vérifié (niveau, domaine, établissement), en relecture, ou à ajouter. Facultatif : il informe
 * le recruteur, il n'ouvre ni ne ferme aucune porte.
 */
export function DiplomaCard() {
  const { state } = useApp();
  const { t } = useCopy();
  if (!state) return null;
  const sub = state.latest_submission;
  const inReview = isInReview(sub?.status);
  const d = state.diploma;
  const refused = !d && !inReview && (sub?.status === 'rejected' || sub?.status === 'needs_more');
  const canSend = !inReview && state.submissions_left > 0 && (d?.level ?? 0) < 8;

  return (
    <View testID="diploma-card" style={{ backgroundColor: inReview || !d ? alpha(colors.accent, 0.06) : colors.surface, borderRadius: radius.card, padding: 18, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          {d ? <VerifiedBadge size={26} /> : <CapIcon size={22} color={colors.accent} stroke={1.9} />}
        </View>
        <View style={{ flex: 1 }}>
          <Body weight="bold" size={16}>
            {d ? `Diplôme vérifié · ${levelLabel(d.level)}` : inReview ? 'Diplôme en relecture' : 'Badge diplôme vérifié'}
          </Body>
          <Small>
            {d
              ? [d.study_field ? STUDY_FIELD_LABELS[d.study_field] : null, d.institution].filter(Boolean).join(' · ') || `Vérifié le ${formatShortDate(d.verified_at)}`
              : inReview && sub
                ? `Envoyé le ${formatShortDate(sub.created_at)}. ${t('review.delay')}`
                : 'Facultatif. Il rassure les recruteurs, sans jamais vous fermer une offre.'}
          </Small>
        </View>
        {inReview ? <LiveDot /> : null}
      </View>
      {refused && sub?.rejection_reason ? <Small color={colors.danger}>Document non retenu : {sub.rejection_reason}</Small> : null}
      {canSend && !d ? (
        <Body weight="bold" size={14.5} color={colors.accent} onPress={() => router.push('/diploma')} accessibilityRole="link" testID="diploma-add">
          {refused ? 'Envoyer un autre document →' : 'Faire vérifier mon diplôme →'}
        </Body>
      ) : canSend && d ? (
        <Body weight="bold" size={14.5} color={colors.accent} onPress={() => router.push('/diploma')} accessibilityRole="link" testID="diploma-higher">
          Faire vérifier un diplôme supérieur →
        </Body>
      ) : null}
    </View>
  );
}
