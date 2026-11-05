// Lecteur XML minimal et déterministe (Europass, DOCX) : éléments, attributs, texte, CDATA, entités.
// Pas de DTD ni d'entités externes : rien n'est jamais chargé depuis le fichier, aucune expansion.

export interface XmlNode {
  /** Nom qualifié tel qu'écrit (`w:p`, `hr:FormattedDateTime`). */
  name: string;
  /** Nom sans préfixe d'espace de noms (`p`, `FormattedDateTime`). */
  local: string;
  attrs: Record<string, string>;
  children: XmlChild[];
}
export type XmlChild = XmlNode | string;

const NAMED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x")) return safeCodePoint(parseInt(body.slice(2), 16)) ?? whole;
    if (body.startsWith("#")) return safeCodePoint(parseInt(body.slice(1), 10)) ?? whole;
    return NAMED[body] ?? whole;
  });
}

function safeCodePoint(n: number): string | null {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return null;
  return String.fromCodePoint(n);
}

function localOf(name: string): string {
  const i = name.indexOf(":");
  return i >= 0 ? name.slice(i + 1) : name;
}

/** Analyse un document XML. Lève une erreur `invalid_xml` si la structure est cassée. */
export function parseXml(src: string): XmlNode {
  const root: XmlNode = { name: "#document", local: "#document", attrs: {}, children: [] };
  const stack: XmlNode[] = [root];
  let i = 0;
  const n = src.length;
  const top = () => stack[stack.length - 1] as XmlNode;

  while (i < n) {
    const lt = src.indexOf("<", i);
    if (lt < 0) {
      pushText(top(), src.slice(i));
      break;
    }
    if (lt > i) pushText(top(), src.slice(i, lt));
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      if (end < 0) throw new Error("invalid_xml");
      i = end + 3;
    } else if (src.startsWith("<![CDATA[", lt)) {
      const end = src.indexOf("]]>", lt + 9);
      if (end < 0) throw new Error("invalid_xml");
      top().children.push(src.slice(lt + 9, end));
      i = end + 3;
    } else if (src.startsWith("<?", lt)) {
      const end = src.indexOf("?>", lt + 2);
      if (end < 0) throw new Error("invalid_xml");
      i = end + 2;
    } else if (src.startsWith("<!", lt)) {
      // DOCTYPE : ignoré, sous-ensemble interne compris (jamais interprété).
      let depth = 0;
      let j = lt + 2;
      for (; j < n; j++) {
        const c = src[j];
        if (c === "[") depth++;
        else if (c === "]") depth--;
        else if (c === ">" && depth <= 0) break;
      }
      i = j + 1;
    } else if (src[lt + 1] === "/") {
      const end = src.indexOf(">", lt + 2);
      if (end < 0) throw new Error("invalid_xml");
      const name = src.slice(lt + 2, end).trim();
      const node = stack.pop();
      if (!node || node === root || node.name !== name) throw new Error("invalid_xml");
      i = end + 1;
    } else {
      // Balise ouvrante : nom, attributs entre guillemets, fin `>` ou `/>`.
      let j = lt + 1;
      while (j < n && !/[\s/>]/.test(src[j] as string)) j++;
      const name = src.slice(lt + 1, j);
      if (!name) throw new Error("invalid_xml");
      const attrs: Record<string, string> = {};
      let selfClosing = false;
      while (j < n) {
        while (j < n && /\s/.test(src[j] as string)) j++;
        const c = src[j];
        if (c === ">") {
          j++;
          break;
        }
        if (c === "/" && src[j + 1] === ">") {
          selfClosing = true;
          j += 2;
          break;
        }
        const eq = src.indexOf("=", j);
        if (eq < 0) throw new Error("invalid_xml");
        const key = src.slice(j, eq).trim();
        let k = eq + 1;
        while (k < n && /\s/.test(src[k] as string)) k++;
        const quote = src[k];
        if (quote !== '"' && quote !== "'") throw new Error("invalid_xml");
        const close = src.indexOf(quote, k + 1);
        if (close < 0) throw new Error("invalid_xml");
        attrs[key] = decodeEntities(src.slice(k + 1, close));
        j = close + 1;
      }
      const node: XmlNode = { name, local: localOf(name), attrs, children: [] };
      top().children.push(node);
      if (!selfClosing) stack.push(node);
      i = j;
    }
  }
  if (stack.length !== 1) throw new Error("invalid_xml");
  return root;
}

function pushText(node: XmlNode, raw: string) {
  if (!raw) return;
  node.children.push(decodeEntities(raw));
}

export function elements(node: XmlNode): XmlNode[] {
  return node.children.filter((c): c is XmlNode => typeof c !== "string");
}

/** Enfants directs portant ce nom local. */
export function childrenNamed(node: XmlNode, local: string): XmlNode[] {
  return elements(node).filter((c) => c.local === local);
}

export function child(node: XmlNode | null | undefined, local: string): XmlNode | null {
  if (!node) return null;
  return elements(node).find((c) => c.local === local) ?? null;
}

/** Descendants portant ce nom local, dans l'ordre du document. */
export function descendants(node: XmlNode, local: string): XmlNode[] {
  const out: XmlNode[] = [];
  const walk = (n: XmlNode) => {
    for (const c of elements(n)) {
      if (c.local === local) out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}

export function firstDescendant(node: XmlNode | null | undefined, local: string): XmlNode | null {
  if (!node) return null;
  for (const c of elements(node)) {
    if (c.local === local) return c;
    const deep = firstDescendant(c, local);
    if (deep) return deep;
  }
  return null;
}

/** Texte de l'élément et de ses descendants, espaces normalisés. */
export function textOf(node: XmlNode | null | undefined): string {
  if (!node) return "";
  const parts: string[] = [];
  const walk = (n: XmlNode) => {
    for (const c of n.children) {
      if (typeof c === "string") parts.push(c);
      else walk(c);
    }
  };
  walk(node);
  return parts.join("").replace(/\s+/g, " ").trim();
}

/** Retire les balises HTML d'un texte riche (champs Europass) et décode les entités. */
export function stripHtml(s: string): string {
  return decodeEntities(
    s
      .replace(/<\s*(br|\/p|\/li|\/div)\b[^>]*>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n• ")
      .replace(/<[^>]+>/g, ""),
  );
}
