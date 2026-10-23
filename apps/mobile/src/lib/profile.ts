import type { Database } from '@sapios/shared';

import { fromPostgrest } from './errors';
import { forgetSignedUrl, toJpeg, uploadToBucket } from './media';
import { supabase } from './supabase';
import type { Gender, OwnProfile, Photo } from './types';

export const GENDER_LABEL: Record<Gender, string> = { woman: 'Femme', man: 'Homme', nonbinary: 'Non-binaire' };
export const SEEKING_LABEL: Record<Gender, string> = { woman: 'Des femmes', man: 'Des hommes', nonbinary: 'Des personnes non-binaires' };

export const MIN_PHOTOS = 2;
export const MAX_PHOTOS = 6;
/** Première position des photos (0 = photo principale). */
export const POSITION_BASE = 0;

export async function loadOwnProfile(userId: string): Promise<OwnProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, gender, seeking_genders, age_min, age_max, bio, city, status')
    .eq('id', userId)
    .single();
  if (error) throw fromPostgrest(error);
  return data as OwnProfile;
}

/** Colonnes modifiables par le client (droit update accordé à authenticated). */
export type ProfilePatch = Pick<
  Database['public']['Tables']['profiles']['Update'],
  'display_name' | 'gender' | 'seeking_genders' | 'age_min' | 'age_max' | 'bio' | 'city'
>;

export async function saveOwnProfile(userId: string, patch: ProfilePatch) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw fromPostgrest(error);
}

type OwnIdentity = { legal_name: string | null; birthdate: string | null };

/** Identité du membre connecté, chiffrée en base et déchiffrée par le serveur pour lui seul. */
async function loadOwnIdentity(): Promise<OwnIdentity | null> {
  const { data, error } = await supabase.rpc('get_my_identity');
  if (error) return null;
  return (data as OwnIdentity | null) ?? null;
}

export async function loadLegalName(_userId: string): Promise<string | null> {
  return (await loadOwnIdentity())?.legal_name ?? null;
}

/** Âge du membre connecté (date de naissance lisible par lui seul), ou null. */
export async function loadOwnAge(_userId: string): Promise<number | null> {
  const birthdate = (await loadOwnIdentity())?.birthdate;
  if (!birthdate) return null;
  const [y, m, d] = birthdate.split('-').map(Number);
  return ageFrom(new Date(y, m - 1, d));
}

/** Tranche d'âge proposée d'après son propre âge (de −5 à +7 ans, bornée à 18–99). */
export function suggestedAgeRange(age: number): [number, number] {
  return [Math.max(18, age - 5), Math.min(99, age + 7)];
}

export const AGE_MIN = 18;
export const AGE_MAX = 99;

/** Libellés « Vous êtes… » (onboarding). */
export const GENDER_SENTENCE: Record<Gender, string> = { woman: 'Une femme', man: 'Un homme', nonbinary: 'Une personne non-binaire' };

export async function loadPhotos(userId: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from('profile_photos')
    .select('id, storage_path, position, moderation_status')
    .eq('user_id', userId)
    .order('position', { ascending: true });
  if (error) throw fromPostgrest(error);
  return (data ?? []) as Photo[];
}

export async function addPhoto(userId: string, asset: { uri: string; width?: number; height?: number }, position: number): Promise<Photo> {
  const jpeg = await toJpeg(asset.uri, 1600, 0.82, asset);
  const { path } = await uploadToBucket('photos', userId, jpeg, 'jpg');
  const { data, error } = await supabase
    .from('profile_photos')
    .insert({ user_id: userId, storage_path: path, position })
    .select('id, storage_path, position, moderation_status')
    .single();
  if (error) {
    await supabase.storage.from('photos').remove([path]);
    throw fromPostgrest(error);
  }
  return data as Photo;
}

export async function removePhoto(photo: Photo) {
  const { error } = await supabase.from('profile_photos').delete().eq('id', photo.id);
  if (error) throw fromPostgrest(error);
  // Fichier supprimé par l'API Storage (jamais par un delete SQL sur storage.objects).
  await supabase.storage.from('photos').remove([photo.storage_path]);
  forgetSignedUrl(photo.storage_path);
}

/** Réécrit les positions dans l'ordre donné (positions 0 à 9, sans contrainte d'unicité). */
export async function reorderPhotos(ordered: Photo[]) {
  for (const [i, p] of ordered.entries()) {
    if (p.position === POSITION_BASE + i) continue;
    const { error } = await supabase.from('profile_photos').update({ position: POSITION_BASE + i }).eq('id', p.id);
    if (error) throw fromPostgrest(error);
  }
}

export function ageFrom(birthdate: Date, now = new Date()): number {
  let age = now.getFullYear() - birthdate.getFullYear();
  const m = now.getMonth() - birthdate.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birthdate.getDate())) age--;
  return age;
}
