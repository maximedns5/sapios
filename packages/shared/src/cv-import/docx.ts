// DOCX : `word/document.xml` (déjà dézippé par le client) → lignes, avec style de paragraphe, gras,
// taille et puces. Tableaux lus rangée par rangée ; zones de texte lues après leur paragraphe d'ancrage.

import { isDateOnlyLine } from "./dates";
import type { CvLine } from "./types";
import { elements, parseXml, type XmlNode } from "./xml";

interface Para {
  text: string;
  style?: string;
  bold: boolean;
  size?: number;
  bullet: boolean;
}

function attr(node: XmlNode | null | undefined, local: string): string | undefined {
  if (!node) return undefined;
  for (const [k, v] of Object.entries(node.attrs)) if (k === local || k.endsWith(`:${local}`)) return v;
  return undefined;
}

function childLocal(node: XmlNode | null | undefined, local: string): XmlNode | null {
  if (!node) return null;
  return elements(node).find((c) => c.local === local) ?? null;
}

/** Paragraphe : texte des runs (sans les zones de texte imbriquées, renvoyées à part). */
function readParagraph(p: XmlNode, nested: XmlNode[]): Para {
  const pPr = childLocal(p, "pPr");
  const style = attr(childLocal(pPr, "pStyle"), "val");
  const bullet = !!childLocal(pPr, "numPr") || /list|liste|puce|bullet/i.test(style ?? "");
  let text = "";
  let boldChars = 0;
  let chars = 0;
  let size: number | undefined;
  const walk = (n: XmlNode, inRunBold: boolean, inRunSize: number | undefined) => {
    for (const c of elements(n)) {
      if (c.local === "txbxContent") {
        nested.push(c);
        continue;
      }
      if (c.local === "r") {
        const rPr = childLocal(c, "rPr");
        const b = childLocal(rPr, "b");
        const bold = !!b && attr(b, "val") !== "0" && attr(b, "val") !== "false";
        const sz = attr(childLocal(rPr, "sz"), "val");
        walk(c, bold, sz ? Number(sz) / 2 : inRunSize);
        continue;
      }
      if (c.local === "t") {
        const t = c.children.filter((x): x is string => typeof x === "string").join("");
        text += t;
        chars += t.length;
        if (inRunBold) boldChars += t.length;
        if (inRunSize && (!size || inRunSize > size)) size = inRunSize;
        continue;
      }
      if (c.local === "tab") {
        text += " | ";
        continue;
      }
      if (c.local === "br" || c.local === "cr") {
        text += "\n";
        continue;
      }
      if (c.local === "pPr" || c.local === "rPr" || c.local === "instrText" || c.local === "delText") continue;
      walk(c, inRunBold, inRunSize);
    }
  };
  walk(p, false, undefined);
  return { text, style, bold: chars > 0 && boldChars >= chars * 0.6, size, bullet };
}

function toLines(para: Para): CvLine[] {
  return para.text
    .split("\n")
    .map((t) => t.replace(/(\s*\|\s*)+/g, " | ").replace(/^\s*\|\s*|\s*\|\s*$/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((text) => ({ text, style: para.style, bold: para.bold, size: para.size, bullet: para.bullet }));
}

function walkBlock(node: XmlNode, out: CvLine[]) {
  for (const c of elements(node)) {
    if (c.local === "p") {
      const nested: XmlNode[] = [];
      out.push(...toLines(readParagraph(c, nested)));
      for (const box of nested) walkBlock(box, out);
    } else if (c.local === "tbl") {
      for (const tr of elements(c).filter((e) => e.local === "tr")) {
        const cells = elements(tr)
          .filter((e) => e.local === "tc")
          .map((tc) => {
            const lines: CvLine[] = [];
            walkBlock(tc, lines);
            return lines;
          });
        // Rangée « dates | poste » : la date rejoint la première ligne de la cellule suivante.
        const first = cells[0];
        const second = cells[1];
        if (cells.length >= 2 && first && second && first.length === 1 && second.length > 0 && isDateOnlyLine((first[0] as CvLine).text)) {
          const head = second[0] as CvLine;
          second[0] = { ...head, text: `${head.text} | ${(first[0] as CvLine).text}` };
          cells.shift();
        }
        for (const cell of cells) out.push(...cell);
      }
    } else if (c.local === "sectPr" || c.local === "bookmarkStart" || c.local === "bookmarkEnd") {
      continue;
    } else {
      walkBlock(c, out);
    }
  }
}

/** `word/document.xml` → lignes dans l'ordre du document. */
export function docxToLines(documentXml: string): CvLine[] {
  const root = parseXml(documentXml);
  const body = (function find(n: XmlNode): XmlNode | null {
    for (const c of elements(n)) {
      if (c.local === "body") return c;
      const deep = find(c);
      if (deep) return deep;
    }
    return null;
  })(root);
  const out: CvLine[] = [];
  if (body) walkBlock(body, out);
  return out;
}
