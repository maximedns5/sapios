// Sapios Emploi côté Edge Functions : formes et règles reprises de packages/shared/src/emploi.ts.
// Ce fichier-là importe ses voisins sans extension (« ./tiers »), ce que Deno ne résout pas : on recopie
// ici le strict nécessaire, et emploi_test.ts vérifie que les listes restent identiques à la source.

/** Événements de notification de l'emploi (EMPLOI_NOTIFY_EVENTS), plus le verdict d'un compte emploi. */
export const EMPLOI_NOTIFY_EVENTS = [
  "application_interested",
  "application_rejected",
  "application_closed",
  "interview_proposed",
  "invitation_received",
  "interview_accepted",
  "company_decided",
  "offer_decided",
  "deadline_reminder",
  "message",
] as const;
export type EmploiNotifyEvent = (typeof EMPLOI_NOTIFY_EVENTS)[number];

/** CompanyLookup (contrat §5, company-lookup). */
export interface CompanyLookup {
  siren: string;
  legal_name: string;
  naf_code: string | null;
  naf_label: string | null;
  headcount_band: string | null;
  address: string | null;
  city: string | null;
  postcode: string | null;
  created_on: string | null;
  active: boolean;
  diffusion: "O" | "P";
}

/** GeoResult (contrat §5, geocode). */
export interface GeoResult {
  label: string;
  city: string;
  postcode: string | null;
  lat: number;
  lng: number;
}

/** Clé de Luhn d'un SIREN (isValidSiren). */
export function isValidSiren(siren: string): boolean {
  if (!/^\d{9}$/.test(siren)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = Number(siren[8 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export const COMPANY_LOOKUP_LIMIT = 10;
export const GEOCODE_LIMIT = 30;
export const RATE_WINDOW_SECONDS = 60;
