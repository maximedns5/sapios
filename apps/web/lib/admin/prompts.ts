import { DEFAULT_PROMPTS, promptCopyKey } from "@sapios/shared";
import type { CopyRow } from "./types";
import { createClient } from "@/lib/supabase/client";

/** Textes des questions : `app_copy` (`prompt.<clé>`), repli sur le catalogue par défaut. */
export type PromptTexts = Record<string, string>;

export async function loadPromptTexts(): Promise<PromptTexts> {
  const { data, error } = await createClient()
    .from("app_copy")
    .select("key, locale, text")
    .eq("locale", "fr")
    .like("key", "prompt.%");
  if (error) throw error;
  const texts: PromptTexts = {};
  for (const row of (data ?? []) as CopyRow[]) texts[row.key.slice("prompt.".length)] = row.text;
  return texts;
}

export function promptText(key: string | null | undefined, texts: PromptTexts): string {
  if (!key) return "Question inconnue";
  return texts[key] ?? (DEFAULT_PROMPTS as Record<string, string>)[key] ?? key;
}

export { promptCopyKey };
