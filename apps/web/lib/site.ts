// Coordonnées de l'éditeur : adresses à confirmer avant la mise en ligne (variables d'environnement).
export const SITE = {
  name: "Sapios",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contact@sapios.app",
  privacyEmail: process.env.NEXT_PUBLIC_PRIVACY_EMAIL || "confidentialite@sapios.app",
  privacyUpdatedAt: "26 octobre 2026",
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
