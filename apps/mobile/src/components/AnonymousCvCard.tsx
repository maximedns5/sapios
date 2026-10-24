import { EXPERIENCE_BAND_LABELS, formatCandidateNumber, formatSalaryRange, levelLabel, STUDY_FIELD_LABELS, type AnonymousCv } from '@sapios/shared';
import { View } from 'react-native';

import { formatMonth, monthsLabel, remoteLabel } from '@/lib/format';
import { alpha, colors, radius } from '@/lib/theme';
import { LockIcon, VerifiedBadge } from './Icons';
import { Body, Small } from './Text';

/** Badge diplôme vu par le recruteur : niveau, domaine, établissement seulement si le candidat l'affiche. */
export function diplomaLine(cv: AnonymousCv): string | null {
  if (!cv.diploma) return null;
  const field = cv.diploma.study_field ? STUDY_FIELD_LABELS[cv.diploma.study_field] : null;
  return [levelLabel(cv.diploma.level), field, cv.diploma.institution].filter(Boolean).join(' · ');
}

/**
 * Le CV tel que le voit un recruteur avant le match : numéro, poste, diplôme vérifié, expériences en durée,
 * compétences, langues, prétentions. Jamais nom, photo, âge, genre ni adresse.
 */
export function AnonymousCvCard({ cv, compact, testID }: { cv: AnonymousCv; compact?: boolean; testID?: string }) {
  const diploma = diplomaLine(cv);
  const langs = cv.languages.map((l) => `${l.language} ${l.level.toUpperCase()}`).join(' · ');
  return (
    <View testID={testID} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, padding: 16, gap: 12, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <LockIcon size={20} color={colors.muted} />
        </View>
        <View style={{ flex: 1 }}>
          <Body weight="bold" size={16}>
            Candidat·e {formatCandidateNumber(cv.number)}
          </Body>
          <Small size={13.5}>
            {cv.target_role} · {EXPERIENCE_BAND_LABELS[cv.experience_band]}
          </Small>
        </View>
      </View>
      {diploma ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <VerifiedBadge size={16} />
          <Small size={13.5} weight="bold" color={colors.accent} style={{ flex: 1 }}>
            Diplôme vérifié · {diploma}
          </Small>
        </View>
      ) : null}
      {!compact && cv.experiences.length ? (
        <View style={{ gap: 6 }}>
          {cv.experiences.map((e, i) => (
            <Body key={`${e.title}-${i}`} size={14.5} style={{ lineHeight: 20 }}>
              <Body size={14.5} weight="bold">
                {e.title}
              </Body>
              {` · ${e.employer ?? 'Employeur masqué'} · ${monthsLabel(e.months)}${e.current ? ', en cours' : ''}`}
            </Body>
          ))}
        </View>
      ) : null}
      {cv.skills.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {cv.skills.slice(0, compact ? 5 : 10).map((s) => (
            <View key={s} style={{ borderRadius: radius.pill, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Small size={13} weight="bold" color={colors.text}>
                {s}
              </Small>
            </View>
          ))}
        </View>
      ) : null}
      <Small size={13.5}>
        {[langs || null, formatSalaryRange(cv.salary_min_k, cv.salary_max_k, ''), `dès ${formatMonth(cv.available_from)}`].filter(Boolean).join(' · ')}
      </Small>
      {!compact ? (
        <Small size={13.5}>
          Cherche à {cv.search_city} ({cv.search_radius_km} km) · {cv.remote_days_min ? remoteLabel(cv.remote_days_min).toLowerCase() : 'télétravail indifférent'}
          {cv.work_authorization ? ' · autorisé·e à travailler en France' : ''}
        </Small>
      ) : null}
      {!compact && cv.looking_for ? (
        <View style={{ borderLeftWidth: 3, borderColor: colors.accent, paddingLeft: 12 }}>
          <Small size={12.5} weight="bold" color={colors.muted}>
            Ce que je cherche
          </Small>
          <Body size={15} weight="semibold" style={{ lineHeight: 21 }}>
            « {cv.looking_for} »
          </Body>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: alpha(colors.accent, 0.06), borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
        <LockIcon size={15} color={colors.accent} />
        <Small size={13} color={colors.secondary} style={{ flex: 1 }}>
          Nom, prénom, âge, genre et adresse masqués jusqu’au match.
        </Small>
      </View>
    </View>
  );
}
