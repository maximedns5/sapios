// Mise en lignes d'un PDF : les morceaux de texte de pdf.js deviennent des lignes dans l'ordre de lecture,
// colonne par colonne quand la page est en deux colonnes (barre latérale LinkedIn, CV à deux colonnes).

import type { CvLine, PdfPage, PdfTextItem } from "./types";

interface Segment {
  x0: number;
  x1: number;
  y: number;
  size: number;
  bold: boolean;
  text: string;
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Regroupe les morceaux d'une même ligne de base en segments ; un grand blanc horizontal coupe le segment. */
function segmentsOf(items: PdfTextItem[]): Segment[] {
  const sorted = items
    .filter((it) => it.str.trim().length > 0 || it.str === " ")
    .map((it) => ({ ...it, x: round(it.x), y: round(it.y), width: round(it.width), size: round(it.size) }))
    .sort((a, b) => b.y - a.y || a.x - b.x || (a.str < b.str ? -1 : a.str > b.str ? 1 : 0));
  const lines: PdfTextItem[][] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    const ref = last?.[0];
    const tol = Math.max(1.5, (ref?.size ?? it.size) * 0.35);
    if (last && ref && Math.abs(ref.y - it.y) <= tol) last.push(it);
    else lines.push([it]);
  }
  const segs: Segment[] = [];
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x || (a.str < b.str ? -1 : 1));
    let cur: Segment | null = null;
    for (const it of line) {
      const gap = cur ? it.x - cur.x1 : 0;
      const charW = Math.max(it.size * 0.5, 2);
      if (cur && gap <= charW * 3) {
        const space = gap > charW * 0.25 && !cur.text.endsWith(" ") && !it.str.startsWith(" ") ? " " : "";
        cur.text += space + it.str;
        cur.x1 = Math.max(cur.x1, it.x + it.width);
        cur.size = Math.max(cur.size, it.size);
        cur.bold = cur.bold && !!it.bold;
      } else {
        if (cur) segs.push(cur);
        cur = { x0: it.x, x1: it.x + it.width, y: it.y, size: it.size, bold: !!it.bold, text: it.str };
      }
    }
    if (cur) segs.push(cur);
  }
  return segs.map((s) => ({ ...s, text: s.text.replace(/\s+/g, " ").trim() })).filter((s) => s.text);
}

/**
 * Cherche une gouttière verticale entre 15 % et 60 % de la largeur : une bande de 12 pt au moins qu'aucun
 * segment ne traverse (à 3 % près). Renvoie son milieu, ou null pour une page en une colonne.
 */
function gutterOf(segs: Segment[], width: number): number | null {
  if (segs.length < 12 || width <= 0) return null;
  const bin = 2;
  const bins = Math.ceil(width / bin);
  const cover = new Array<number>(bins).fill(0);
  for (const s of segs) {
    const a = Math.max(0, Math.floor(s.x0 / bin));
    const b = Math.min(bins - 1, Math.ceil(s.x1 / bin));
    for (let i = a; i <= b; i++) cover[i] = (cover[i] ?? 0) + 1;
  }
  const limit = Math.max(1, Math.floor(segs.length * 0.03));
  let best: { from: number; to: number } | null = null;
  let start = -1;
  const lo = Math.floor((width * 0.15) / bin);
  const hi = Math.ceil((width * 0.6) / bin);
  for (let i = lo; i <= hi + 1; i++) {
    const free = i <= hi && (cover[i] ?? 0) <= limit;
    if (free && start < 0) start = i;
    if (!free && start >= 0) {
      if (!best || i - start > best.to - best.from) best = { from: start, to: i };
      start = -1;
    }
  }
  if (!best || (best.to - best.from) * bin < 12) return null;
  const mid = ((best.from + best.to) / 2) * bin;
  const leftSegs = segs.filter((s) => s.x1 <= mid);
  const rightSegs = segs.filter((s) => s.x0 >= mid);
  // Deux vraies colonnes : du texte des deux côtés, avec des lignes de base indépendantes. Une colonne de dates
  // alignée ligne à ligne sur le texte (tableau « 2021 – 2023 | Poste ») n'est pas une colonne : on lit par rangées.
  if (leftSegs.length < 4 || rightSegs.length < 4) return null;
  const aligned = leftSegs.filter((l) => rightSegs.some((r) => Math.abs(r.y - l.y) <= Math.max(2, l.size * 0.35))).length;
  return aligned / leftSegs.length > 0.6 ? null : mid;
}

/** Fusionne les segments d'une même ligne de base (de gauche à droite), séparés par « | ». */
function rowsOf(group: Segment[]): Segment[] {
  const sorted = [...group].sort((a, b) => b.y - a.y || a.x0 - b.x0);
  const rows: Segment[] = [];
  for (const s of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.y - s.y) <= Math.max(1.5, Math.min(last.size, s.size) * 0.35)) {
      last.text = `${last.text} | ${s.text}`;
      last.x1 = Math.max(last.x1, s.x1);
      last.size = Math.max(last.size, s.size);
      last.bold = last.bold && s.bold;
    } else rows.push({ ...s });
  }
  return rows;
}

export interface LayoutResult {
  lines: CvLine[];
  columns: boolean;
}

/** Pages pdf.js → lignes ordonnées. Déterministe : même entrée, même sortie. */
export function layoutPdf(pages: PdfPage[]): LayoutResult {
  const lines: CvLine[] = [];
  let columns = false;
  pages.forEach((page, p) => {
    const segs = segmentsOf(page.items);
    const gutter = gutterOf(segs, page.width);
    const groups = gutter == null ? [segs] : [segs.filter((s) => s.x0 < gutter), segs.filter((s) => s.x0 >= gutter)];
    if (gutter != null) columns = true;
    groups.forEach((group, g) => {
      rowsOf(group).forEach((s, k) => {
        lines.push({ text: s.text, size: s.size, bold: s.bold, page: p + 1, ...(g > 0 && k === 0 ? { columnBreak: true } : {}) });
      });
    });
  });
  return { lines, columns };
}
