// Comparaison souple nom légal / nom extrait : accents, casse, ordre, initiales.
export type NameMatch = "match" | "partial" | "mismatch" | "unknown";

export function nameTokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function tokenMatches(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 1) return b.startsWith(a);
  if (b.length === 1) return a.startsWith(b);
  return false;
}

export function compareNames(legal: string | null | undefined, extracted: string | null | undefined): NameMatch {
  if (!legal || !extracted) return "unknown";
  const a = nameTokens(legal);
  const b = nameTokens(extracted);
  if (!a.length || !b.length) return "unknown";
  const same = a.length === b.length && [...a].sort().join(" ") === [...b].sort().join(" ");
  if (same) return "match";
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const pool = [...long];
  const allFound = short.every((t) => {
    const i = pool.findIndex((p) => tokenMatches(t, p));
    if (i === -1) return false;
    pool.splice(i, 1);
    return true;
  });
  return allFound ? "partial" : "mismatch";
}

export const NAME_MATCH_LABELS: Record<NameMatch, string> = {
  match: "Concordant",
  partial: "Concordance partielle (initiales, nom composé…)",
  mismatch: "Divergent",
  unknown: "Comparaison impossible",
};
