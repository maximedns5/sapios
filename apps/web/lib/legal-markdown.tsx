import Link from "next/link";
import type { ReactNode } from "react";

// Rendu minimal du Markdown des pages légales (content/legal/*.md), sans dépendance : titres `##`,
// paragraphes, listes `-` et `1.`, tableaux, **gras**, *italique* et [liens](url). Rien d'autre :
// ces textes sont écrits par l'équipe et relus par un juriste, pas saisis par les membres.

type Block =
  | { kind: "h2"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] };

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

function parse(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push({ kind: "h2", text: line.slice(3).trim() });
      i++;
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) {
        rows.push(cells(lines[i] ?? ""));
        i++;
      }
      const [head = [], , ...body] = rows; // la 2e ligne est le séparateur « --- »
      blocks.push({ kind: "table", head, rows: body });
      continue;
    }
    const bullet = /^- /;
    const numbered = /^\d+\. /;
    if (bullet.test(line) || numbered.test(line)) {
      const re = bullet.test(line) ? bullet : numbered;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(re, ""));
        i++;
      }
      blocks.push({ kind: re === bullet ? "ul" : "ol", items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && (lines[i] ?? "").trim() && !/^(## |\||- |\d+\. )/.test(lines[i] ?? "")) {
      para.push((lines[i] ?? "").trim());
      i++;
    }
    blocks.push({ kind: "p", text: para.join(" ") });
  }
  return blocks;
}

/** Mise en forme en ligne : liens, gras, italique, dans cet ordre de priorité. */
function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}-${n++}`;
    if (m[1] !== undefined && m[2] !== undefined) {
      const href = m[2];
      out.push(
        href.startsWith("/") ? (
          <Link key={k} href={href}>
            {inline(m[1], k)}
          </Link>
        ) : (
          <a key={k} href={href} rel="noopener noreferrer">
            {inline(m[1], k)}
          </a>
        ),
      );
    } else if (m[3] !== undefined) {
      out.push(<strong key={k}>{inline(m[3], k)}</strong>);
    } else if (m[4] !== undefined) {
      out.push(<em key={k}>{inline(m[4], k)}</em>);
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Le texte découpé en sections (une par titre `##`), au format des autres pages légales. */
export function LegalMarkdown({ source }: { source: string }) {
  const blocks = parse(source);
  const sections: Array<{ title: string | null; blocks: Block[] }> = [];
  for (const b of blocks) {
    if (b.kind === "h2") sections.push({ title: b.text, blocks: [] });
    else if (sections.length) sections.at(-1)?.blocks.push(b);
    else sections.push({ title: null, blocks: [b] });
  }
  return (
    <>
      {sections.map((s, si) => {
        const id = s.title ? slug(s.title) : `intro-${si}`;
        return (
          <section key={id} aria-labelledby={s.title ? id : undefined}>
            {s.title ? <h2 id={id}>{inline(s.title, id)}</h2> : null}
            {s.blocks.map((b, bi) => {
              const k = `${id}-${bi}`;
              switch (b.kind) {
                case "p":
                  return <p key={k}>{inline(b.text, k)}</p>;
                case "ul":
                  return (
                    <ul key={k}>
                      {b.items.map((it, ii) => (
                        <li key={`${k}-${ii}`}>{inline(it, `${k}-${ii}`)}</li>
                      ))}
                    </ul>
                  );
                case "ol":
                  return (
                    <ol key={k}>
                      {b.items.map((it, ii) => (
                        <li key={`${k}-${ii}`}>{inline(it, `${k}-${ii}`)}</li>
                      ))}
                    </ol>
                  );
                case "table":
                  return (
                    <table key={k} className="legal-table">
                      <thead>
                        <tr>
                          {b.head.map((h, hi) => (
                            <th key={hi} scope="col">
                              {inline(h, `${k}-h${hi}`)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {b.rows.map((r, ri) => (
                          <tr key={ri}>
                            {r.map((c, ci) => (
                              <td key={ci} data-label={b.head[ci] ?? ""}>
                                {inline(c, `${k}-${ri}-${ci}`)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                default:
                  return null;
              }
            })}
          </section>
        );
      })}
    </>
  );
}
