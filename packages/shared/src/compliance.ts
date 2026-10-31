// Conformité : avis d'inactivité, pages légales, durées de conservation (docs/CONTRACT.md).

/** Avis d'inactivité (`member_notices.kind = 'inactivity_warning'`), lu au retour du membre. */
export interface InactivityNotice {
  id: string;
  kind: "inactivity_warning";
  payload: {
    /** Date de suppression annoncée (AAAA-MM-JJ). */
    delete_after: string;
  };
  created_at: string;
}

/** Pages légales du site public, liées depuis l'app. */
export const LEGAL_PATHS = {
  terms: "/cgu",
  legalNotice: "/mentions-legales",
  privacy: "/confidentialite",
  contact: "/contact",
} as const;

/** Réglages de conservation (app_settings, en jours) et leurs bornes dans `admin_update_settings`. */
export const RETENTION_SETTINGS = {
  inactive_warning_days: { default: 730, min: 180, max: 3650 },
  inactive_grace_days: { default: 30, min: 7, max: 180 },
  report_retention_days: { default: 365, min: 30, max: 1825 },
  audit_retention_days: { default: 1825, min: 365, max: 3650 },
  notice_retention_days: { default: 365, min: 30, max: 1825 },
} as const;
export type RetentionSetting = keyof typeof RETENTION_SETTINGS;
