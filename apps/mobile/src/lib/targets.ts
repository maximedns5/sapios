import type { OfferDetail } from '@sapios/shared';

/** Point de l'offre auquel le candidat répond (`note_target` du contrat) et son texte cité. */
export type NoteTarget = { key: string; label: string; quote: string };

const short = (text: string, n = 30) => (text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text);

/** Points auxquels on peut répondre : les missions, les critères, l'équipe et le déroulé du recrutement. */
export function offerTargets(offer: OfferDetail): NoteTarget[] {
  const out: NoteTarget[] = [];
  offer.missions.forEach((m, i) => out.push({ key: `mission:${i}`, label: short(m), quote: m }));
  offer.must_have.forEach((m, i) => out.push({ key: `must:${i}`, label: m, quote: `Indispensable : ${m}` }));
  offer.nice_to_have.forEach((m, i) => out.push({ key: `nice:${i}`, label: m, quote: `Apprécié : ${m}` }));
  if (offer.team_description) out.push({ key: 'team', label: 'L’équipe', quote: offer.team_description });
  out.push({
    key: 'process',
    label: 'Le recrutement',
    quote: `${offer.interviews_count} entretien${offer.interviews_count > 1 ? 's' : ''} · réponse sous ${offer.response_days} jours`,
  });
  return out;
}

export function findTarget(offer: OfferDetail, key: string | null | undefined): NoteTarget | null {
  if (!key) return null;
  return offerTargets(offer).find((t) => t.key === key) ?? null;
}
