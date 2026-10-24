// Adresse de l'app candidats (Expo web) : lien depuis l'espace recruteur pour un compte candidat.
export const CANDIDATE_APP_URL: string | null = process.env.NEXT_PUBLIC_APP_URL || null;

/** Bucket privé des photos d'offres (contrat §4). Chemin : `{company_id}/{uuid}.{ext}`. */
export const OFFER_PHOTOS_BUCKET = "offer-photos";
export const OFFER_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const OFFER_PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Connexion par mot de passe : comptes de test seulement (local, staging). Jamais en production. */
export const RECRUITER_PASSWORD_LOGIN = process.env.NEXT_PUBLIC_RECRUITER_PASSWORD_LOGIN === "true";
