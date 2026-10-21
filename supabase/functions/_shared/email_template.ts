// Gabarit des emails transactionnels, à la charte (brief §8) : noir #0B0B0B, blanc cassé #F4F3EF, rien d'autre.
// Mise en page en tableaux et styles en ligne, seule forme que lisent tous les clients mail.

const INK = "#0B0B0B";
const PAPER = "#F4F3EF";
const SERIF = "Didot,'Bodoni 72','Bodoni Moda',Georgia,serif";
const SANS = "Helvetica,Arial,sans-serif";
const MONO = "Menlo,Consolas,monospace";

export interface EmailContent {
  /** Étiquette en capitales au-dessus du titre, ex. « Sapios · Verdict ». */
  label: string;
  subject: string;
  title: string;
  /** Paragraphes séparés par une ligne vide ; un simple retour à la ligne est conservé. */
  body: string;
  cta?: { label: string; url: string };
  footer: string;
  /** Titre en inversion noir/blanc (verdicts). */
  inverted?: boolean;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Remplace les caractères de contrôle par des espaces (sauf les retours à la ligne si `keepNewlines`). */
export function cleanText(value: string, keepNewlines = false): string {
  let out = "";
  for (const ch of value.replace(/\r\n?/g, "\n")) {
    const code = ch.charCodeAt(0);
    out += (keepNewlines && ch === "\n") || (code >= 0x20 && code !== 0x7f) ? ch : " ";
  }
  return keepNewlines ? out.trim() : out.replace(/\s+/g, " ").trim();
}

function paragraphs(body: string): string[] {
  return cleanText(body, true).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

export function renderHtml(c: EmailContent): string {
  const title = escapeHtml(cleanText(c.title));
  const titleStyle = c.inverted
    ? `background:${INK};color:${PAPER};padding:20px 24px;`
    : `color:${INK};padding:0;`;
  const body = paragraphs(c.body)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const cta = c.cta
    ? `<tr><td style="padding:12px 0 32px"><a href="${escapeHtml(c.cta.url)}" style="background:${INK};color:${PAPER};display:inline-block;font-family:${MONO};font-size:13px;letter-spacing:.2em;text-transform:uppercase;text-decoration:none;padding:14px 22px">${
      escapeHtml(cleanText(c.cta.label))
    }</a></td></tr>`
    : `<tr><td style="padding:0 0 18px"></td></tr>`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(cleanText(c.subject))}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="background:${PAPER}">
<tr><td align="center" style="padding:40px 24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td style="font-family:${MONO};font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:${INK};padding:0 0 24px">${
    escapeHtml(cleanText(c.label))
  }</td></tr>
<tr><td style="padding:0 0 20px"><h1 style="font-family:${SERIF};font-weight:400;font-size:30px;line-height:1.2;margin:0;${titleStyle}">${title}</h1></td></tr>
<tr><td style="font-family:${SANS};font-size:16px;line-height:1.55;color:${INK}">${body}</td></tr>
${cta}
<tr><td style="border-top:1px solid ${INK};padding:16px 0 0;font-family:${SANS};font-size:12px;line-height:1.5;color:${INK}">${
    escapeHtml(cleanText(c.footer))
  }</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function renderText(c: EmailContent): string {
  const lines = [
    cleanText(c.label).toUpperCase(),
    "",
    cleanText(c.title),
    "",
    paragraphs(c.body).join("\n\n"),
  ];
  if (c.cta) lines.push("", `${cleanText(c.cta.label)} : ${c.cta.url}`);
  lines.push("", "--", cleanText(c.footer));
  return lines.join("\n") + "\n";
}
