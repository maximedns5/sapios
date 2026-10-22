import {
  DEFAULT_PROMPTS,
  levelLabel,
  MAX_ANSWERS,
  promptCopyKey,
  studyFieldLabel,
  type AffinityReason,
  type StudyField,
  type ThesisVisibility,
} from '@sapios/shared';

import { AppError, fromPostgrest } from './errors';
import { supabase } from './supabase';

/** Limite affichée d'une réponse (la base en accepte 250) : une phrase, deux si elles sont bonnes. */
export const ANSWER_UI_MAX = 200;

/** Texte d'une question : app_copy (`prompt.<key>`), sinon le catalogue livré, sinon la clé. */
export function promptText(t: (key: string) => string, key: string | null | undefined): string {
  if (!key) return '';
  const copyKey = promptCopyKey(key);
  const remote = t(copyKey);
  if (remote && remote !== copyKey) return remote;
  return (DEFAULT_PROMPTS as Record<string, string>)[key] ?? key;
}

export type MyAnswer = { id: string; position: number; prompt_key: string; answer: string; moderation_status: string };
export type MyBook = { id: string; position: number; title: string; author: string | null; moderation_status: string };
export type MyThesis = { line: string; visibility: ThesisVisibility; moderation_status: string };
export type MyIntellect = {
  answers: MyAnswer[];
  books: MyBook[];
  thesis: MyThesis | null;
  studyField: StudyField | null;
  showInstitution: boolean;
  showQuizBadge: boolean;
};

/** Catalogue actif, dans l'ordre du back-office. */
export async function loadPromptKeys(): Promise<string[]> {
  const { data, error } = await supabase.from('profile_prompts').select('key, position').eq('active', true).order('position');
  if (error) throw fromPostgrest(error);
  return ((data ?? []) as { key: string }[]).map((r) => r.key);
}

export async function loadMyIntellect(userId: string): Promise<MyIntellect> {
  const [answers, books, thesis, profile] = await Promise.all([
    supabase.from('profile_answers').select('id, position, prompt_key, answer, moderation_status').eq('user_id', userId).order('position'),
    supabase.from('profile_books').select('id, position, title, author, moderation_status').eq('user_id', userId).order('position'),
    supabase.from('profile_theses').select('line, visibility, moderation_status').eq('user_id', userId).maybeSingle(),
    supabase.from('profiles').select('study_field, show_institution, show_quiz_badge').eq('id', userId).single(),
  ]);
  for (const r of [answers, books, thesis, profile]) if (r.error) throw fromPostgrest(r.error);
  const p = profile.data as { study_field: StudyField | null; show_institution: boolean; show_quiz_badge: boolean };
  return {
    answers: (answers.data ?? []) as MyAnswer[],
    books: (books.data ?? []) as MyBook[],
    thesis: (thesis.data as MyThesis | null) ?? null,
    studyField: p.study_field,
    showInstitution: p.show_institution,
    showQuizBadge: p.show_quiz_badge,
  };
}

/** Réponse à une position (0 à 2) : création ou remplacement (question et texte). */
export async function saveAnswer(position: number, promptKey: string, answer: string) {
  const { error } = await supabase
    .from('profile_answers')
    .upsert({ position, prompt_key: promptKey, answer: answer.trim() }, { onConflict: 'user_id,position' });
  if (error) {
    if (error.code === '23505') throw new AppError('prompt_taken');
    throw fromPostgrest(error);
  }
}

export async function deleteAnswer(userId: string, position: number) {
  const { error } = await supabase.from('profile_answers').delete().eq('user_id', userId).eq('position', position);
  if (error) throw fromPostgrest(error);
}

/** Première position libre pour une nouvelle réponse, ou null si les trois sont prises. */
export function freeAnswerPosition(answers: Pick<MyAnswer, 'position'>[]): number | null {
  for (let i = 0; i < MAX_ANSWERS; i++) if (!answers.some((a) => a.position === i)) return i;
  return null;
}

export async function addBook(books: MyBook[], title: string, author: string): Promise<void> {
  const used = new Set(books.map((b) => b.position));
  const position = [0, 1, 2, 3, 4].find((i) => !used.has(i));
  if (position == null) throw new AppError('books_limit');
  const { error } = await supabase.from('profile_books').insert({ position, title: title.trim(), author: author.trim() || null });
  if (error) throw fromPostgrest(error);
}

export async function removeBook(userId: string, id: string) {
  const { error } = await supabase.from('profile_books').delete().eq('user_id', userId).eq('id', id);
  if (error) throw fromPostgrest(error);
}

/**
 * Échange deux livres. La clé (membre, position) n'est pas différable : avec une place libre on passe
 * par elle (les identifiants suivent les textes) ; bibliothèque pleine, on réécrit les deux lignes.
 */
export async function swapBooks(userId: string, books: MyBook[], a: MyBook, b: MyBook) {
  const used = new Set(books.map((x) => x.position));
  const free = [0, 1, 2, 3, 4].find((i) => !used.has(i));
  const move = async (id: string, position: number) => {
    const { error } = await supabase.from('profile_books').update({ position }).eq('user_id', userId).eq('id', id);
    if (error) throw fromPostgrest(error);
  };
  if (free != null) {
    await move(a.id, free);
    await move(b.id, a.position);
    await move(a.id, b.position);
    return;
  }
  const { error } = await supabase.from('profile_books').delete().eq('user_id', userId).in('id', [a.id, b.id]);
  if (error) throw fromPostgrest(error);
  const { error: insertError } = await supabase.from('profile_books').insert([
    { position: a.position, title: b.title, author: b.author },
    { position: b.position, title: a.title, author: a.author },
  ]);
  if (insertError) throw fromPostgrest(insertError);
}

/** Phrase de thèse ou de mémoire ; une phrase vide la retire. */
export async function saveThesis(userId: string, line: string, visibility: ThesisVisibility) {
  const clean = line.trim();
  if (!clean) {
    const { error } = await supabase.from('profile_theses').delete().eq('user_id', userId);
    if (error) throw fromPostgrest(error);
    return;
  }
  const { error } = await supabase.from('profile_theses').upsert({ line: clean, visibility }, { onConflict: 'user_id' });
  if (error) throw fromPostgrest(error);
}

export async function saveIntellectFlags(userId: string, patch: { study_field?: StudyField | null; show_institution?: boolean; show_quiz_badge?: boolean }) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw fromPostgrest(error);
}

/** Établissement vérifié du membre connecté (lu dans sa ligne d'accès), ou null. */
export async function loadOwnInstitution(userId: string): Promise<{ institution: string | null; field: StudyField | null }> {
  const { data } = await supabase.from('user_access').select('institution, study_field').eq('user_id', userId).maybeSingle();
  const row = data as { institution: string | null; study_field: StudyField | null } | null;
  return { institution: row?.institution ?? null, field: row?.study_field ?? null };
}

/** Étiquette niveau et domaine (« Bac+8 · Philosophie »), parties absentes omises. */
export function levelAndField(level: number | null | undefined, field: StudyField | null | undefined): string {
  return [level ? levelLabel(level) : null, studyFieldLabel(field ?? null)].filter(Boolean).join(' · ');
}

/**
 * « Pourquoi ce profil » : une phrase par raison d'affinité, dans l'ordre du serveur. Le second
 * degré vise le système, jamais la personne.
 */
export function affinitySentences(reasons: AffinityReason[] | null | undefined, t: (key: string) => string): string[] {
  const out: string[] = [];
  for (const r of reasons ?? []) {
    if (r.kind === 'shared_books' && r.count > 0) {
      const title = r.titles?.[0];
      out.push(
        r.count === 1 && title
          ? `Vous avez tous deux lu « ${title} ». Ou prétendu.`
          : `${r.count} livres en commun${title ? `, dont « ${title} »` : ''}.`,
      );
    } else if (r.kind === 'same_field') {
      out.push(`Même domaine : ${studyFieldLabel(r.field) ?? ''}. L’interdisciplinarité attendra.`);
    } else if (r.kind === 'shared_prompts' && r.count > 0) {
      const first = r.prompt_keys?.[0];
      out.push(r.count === 1 && first ? `Vous avez répondu à la même question : « ${promptText(t, first)} ».` : `${r.count} questions en commun.`);
    } else if (r.kind === 'same_institution') {
      out.push(`Même établissement : ${r.institution}.`);
    }
  }
  return out;
}

/** Résumé court d'une raison (pastille de carte) : « 1 livre en commun », « Même domaine ». */
export function affinityChip(reasons: AffinityReason[] | null | undefined): string | null {
  const books = reasons?.find((r) => r.kind === 'shared_books');
  if (books && books.kind === 'shared_books' && books.count > 0) return `${books.count} livre${books.count > 1 ? 's' : ''} en commun`;
  if (reasons?.some((r) => r.kind === 'same_institution')) return 'Même établissement';
  if (reasons?.some((r) => r.kind === 'same_field')) return 'Même domaine';
  const prompts = reasons?.find((r) => r.kind === 'shared_prompts');
  if (prompts && prompts.kind === 'shared_prompts' && prompts.count > 0) return `${prompts.count} question${prompts.count > 1 ? 's' : ''} en commun`;
  return null;
}
