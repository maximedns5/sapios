// Coordonnées de l'éditeur : adresses à confirmer avant la mise en ligne (variables d'environnement).
export const SITE = {
  name: "Sapios",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contact@sapios.app",
  privacyEmail: process.env.NEXT_PUBLIC_PRIVACY_EMAIL || "confidentialite@sapios.app",
  privacyUpdatedAt: "24 octobre 2026",
  /**
   * Pages CGU et mentions légales validées par le juriste : `NEXT_PUBLIC_LEGAL_PAGES_READY=true`.
   * Sinon elles restent consultables par adresse (liens de l'app) avec un bandeau « version
   * provisoire », non indexées et absentes du pied de page.
   */
  legalPagesReady: process.env.NEXT_PUBLIC_LEGAL_PAGES_READY === "true",
} as const;

// Adresse publique du site : NEXT_PUBLIC_SITE_URL une fois le domaine choisi, sinon le domaine de
// production que Vercel expose au build. Sans l'un ni l'autre (CI, local), elle reste inconnue.
const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
export const SITE_URL: string | null =
  process.env.NEXT_PUBLIC_SITE_URL || (vercelHost ? `https://${vercelHost}` : null);

/** « sapios.fr » : l'adresse telle qu'on l'écrit sur une image, sans protocole. */
export const SITE_HOST: string | null = SITE_URL ? new URL(SITE_URL).host.replace(/^www\./, "") : null;

/**
 * Application candidat (export web d'Expo) : NEXT_PUBLIC_APP_URL, par exemple `https://app.sapios.fr`.
 * Sans elle, le bouton « Je cherche un emploi » mène à la section « Comment ça marche » du site.
 */
export const APP_URL: string | null = (() => {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
})();

/** Espace recruteur (même site). */
export const RECRUITER_PATH = "/recruteur";
