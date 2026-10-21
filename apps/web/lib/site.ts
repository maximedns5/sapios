// Coordonnées de l'éditeur : adresses à confirmer avant la mise en ligne (variables d'environnement).
export const SITE = {
  name: "Sapios",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contact@sapios.app",
  privacyEmail: process.env.NEXT_PUBLIC_PRIVACY_EMAIL || "confidentialite@sapios.app",
  privacyUpdatedAt: "21 octobre 2026",
} as const;
