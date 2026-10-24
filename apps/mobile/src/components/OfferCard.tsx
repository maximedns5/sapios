import { CONTRACT_LABELS, formatSalaryRange, type OfferCard as Offer, type RequirementMatch } from '@sapios/shared';
import { View } from 'react-native';

import { placeLabel, remoteLabel } from '@/lib/format';
import { alpha, colors, radius, shadow } from '@/lib/theme';
import { CompanyLine } from './Company';
import { BriefcaseIcon, CheckIcon, HomeIcon, PinIcon } from './Icons';
import { OfferPhotos } from './OfferPhotos';
import { Body, Small, Title } from './Text';

/** Ligne d'information avec pictogramme (lieu, télétravail, contrat). */
export function InfoLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 22, alignItems: 'center' }}>{icon}</View>
      <Body size={15} style={{ flex: 1, lineHeight: 21 }}>
        {text}
      </Body>
    </View>
  );
}

/** « Vous avez déjà » : critères remplis par le CV (coche), puis le premier indispensable manquant. */
export function Matches({ matches, compact }: { matches: RequirementMatch[]; compact?: boolean }) {
  const met = matches.filter((m) => m.met);
  const missing = matches.filter((m) => !m.met && m.kind === 'must');
  if (!matches.length) return null;
  return (
    <View style={{ gap: 8 }} accessibilityLabel={`Vous avez déjà : ${met.map((m) => m.label).join(', ') || 'aucun critère'}.${missing.length ? ` À apprendre : ${missing.map((m) => m.label).join(', ')}.` : ''}`}>
      <Small size={12} weight="bold" color={colors.muted} style={{ letterSpacing: 1 }}>
        VOUS AVEZ DÉJÀ
      </Small>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {met.length ? (
          met.slice(0, compact ? 4 : 10).map((m) => (
            <View key={`${m.kind}:${m.label}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: alpha(colors.accent, 0.08) }}>
              <CheckIcon size={13} stroke={3} color={colors.accent} />
              <Small size={13} weight="bold" color={colors.accent}>
                {m.label}
              </Small>
            </View>
          ))
        ) : (
          <Small size={13.5}>Aucun critère de l’offre dans votre CV pour l’instant.</Small>
        )}
      </View>
      {missing.length ? (
        <Small size={13.5}>
          À apprendre : <Small size={13.5} weight="bold" color={colors.text}>{missing.map((m) => m.label).join(', ')}</Small>
        </Small>
      ) : null}
    </View>
  );
}

/** Contenu de la carte d'une offre (découverte) : photo réelle, intitulé, entreprise, salaire, lieu, contrat. */
export function OfferCardBody({ offer, footer }: { offer: Offer; footer?: React.ReactNode }) {
  const salary = formatSalaryRange(offer.salary_min_k, offer.salary_max_k);
  const contract = `${CONTRACT_LABELS[offer.contract]}${offer.start_label ? ` · ${offer.start_label}` : ''}`;
  return (
    <View testID="offer-card" style={{ backgroundColor: colors.bg, borderRadius: 26, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', boxShadow: shadow.card }}>
      <OfferPhotos photos={offer.photos} company={offer.company.display_name} height={230} />
      <View style={{ padding: 18, gap: 14 }}>
        <View style={{ gap: 10 }}>
          <Title size={25} testID="offer-title">
            {offer.title}
          </Title>
          <CompanyLine name={offer.company.display_name} verified={offer.company.verified} />
        </View>
        <View style={{ alignSelf: 'flex-start', backgroundColor: alpha(colors.accent, 0.08), borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Body weight="extrabold" size={21} color={colors.accent} testID="offer-salary">
            {salary}
          </Body>
        </View>
        <View style={{ gap: 8 }}>
          <InfoLine icon={<PinIcon size={18} color={colors.muted} />} text={placeLabel(offer.city, offer.distance_km)} />
          <InfoLine icon={<HomeIcon size={18} color={colors.muted} />} text={remoteLabel(offer.remote_days)} />
          <InfoLine icon={<BriefcaseIcon size={18} color={colors.muted} />} text={contract} />
        </View>
        <Matches matches={offer.matches} compact />
        {footer}
      </View>
    </View>
  );
}
