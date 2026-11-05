// Import de CV, côté navigateur : le fichier est lu ici et seulement ici (jamais envoyé, jamais stocké).
// PDF par pdf.js (chargé à la demande depuis /pdfjs/), DOCX dézippé par fflate, XML Europass tel quel.
// La lecture elle-même (règles, dictionnaires) vit dans @sapios/shared/cv-import, chargé à la demande.

import type { CvImportResult, CvLine, PdfPage } from '@sapios/shared/cv-import';

import { AppError } from './errors';

export const CV_MAX_BYTES = 5 * 1024 * 1024;
export const CV_ACCEPT =
  '.pdf,.docx,.xml,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/xml,text/xml';
const MAX_PAGES = 8;
const MAX_XML_BYTES = 20 * 1024 * 1024;

type Kind = 'pdf' | 'docx' | 'xml';

export function cvKind(file: { name: string; type: string }): Kind | null {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')) return 'docx';
  if (/[/+]xml$/.test(file.type) || name.endsWith('.xml')) return 'xml';
  return null;
}

/** Date du jour à Paris (AAAA-MM-JJ) : la seule horloge, lue ici et passée au lecteur. */
export function parisToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// --- pdf.js ---------------------------------------------------------------------------------------

/** Sous-ensemble de l'API pdf.js utilisé ici (chargé hors bundle, donc typé à la main). */
type PdfjsLib = {
  getDocument(src: Record<string, unknown>): { promise: Promise<PdfDoc>; destroy(): Promise<void> };
  OPS: Record<string, number>;
};
type PdfAttachment = { filename?: string; rawFilename?: string; content?: Uint8Array | null };
type PdfDoc = {
  numPages: number;
  getPage(n: number): Promise<PdfPageProxy>;
  /** pdf.js 6 : une Map dont le contenu se demande à part ; versions antérieures : un objet avec le contenu. */
  getAttachments(): Promise<Map<string, PdfAttachment> | Record<string, PdfAttachment> | null>;
  getAttachmentContent?(id: string): Promise<Uint8Array | null>;
};
type PdfPageProxy = {
  getViewport(o: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: PdfjsTextItem[]; styles: Record<string, { fontFamily?: string }> }>;
  getOperatorList(): Promise<{ fnArray: number[] }>;
  cleanup(): void;
};
type PdfjsTextItem = { str?: string; transform?: number[]; width?: number; fontName?: string };

let pdfjsPromise: Promise<PdfjsLib> | null = null;

/** Charge /pdfjs/loader.mjs (même origine, autorisé par la CSP) une seule fois. */
function loadPdfjs(): Promise<PdfjsLib> {
  const g = globalThis as unknown as { __sapiosPdfjs?: PdfjsLib };
  if (g.__sapiosPdfjs) return Promise.resolve(g.__sapiosPdfjs);
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = new Promise<PdfjsLib>((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = new URL('/pdfjs/loader.mjs', window.location.origin).href;
    const done = () => (g.__sapiosPdfjs ? resolve(g.__sapiosPdfjs) : reject(new AppError('cv_unreadable')));
    window.addEventListener('sapios:pdfjs', done, { once: true });
    script.onerror = () => {
      pdfjsPromise = null;
      reject(new AppError('cv_unreadable', 'pdfjs_load_failed'));
    };
    document.head.appendChild(script);
  });
  return pdfjsPromise;
}

const BOLD_FONT = /bold|black|heavy|semibold|demi|medium/i;

async function readPdf(data: Uint8Array): Promise<{ pages: PdfPage[]; europassXml: string | null; hasImages: boolean }> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data,
    // pdf.js 6 n'utilise plus eval ; l'option reste posée pour toute version antérieure.
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    enableXfa: false,
    disableAutoFetch: true,
    disableStream: true,
    stopAtErrors: false,
  });
  let doc: PdfDoc;
  try {
    doc = await task.promise;
  } catch (e) {
    await task.destroy().catch(() => {});
    throw new AppError(/password/i.test(String((e as Error)?.name ?? e)) ? 'cv_encrypted' : 'cv_unreadable');
  }
  try {
    const imageOps = new Set(['paintImageXObject', 'paintInlineImageXObject', 'paintImageXObjectRepeat', 'paintInlineImageXObjectGroup'].map((k) => pdfjs.OPS[k]).filter((v): v is number => typeof v === 'number'));
    const pages: PdfPage[] = [];
    let hasImages = false;
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n);
      const { width, height } = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items
        .filter((it): it is Required<Pick<PdfjsTextItem, 'str' | 'transform'>> & PdfjsTextItem => typeof it.str === 'string' && Array.isArray(it.transform))
        .map((it) => {
          const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = it.transform;
          const size = Math.round(Math.hypot(c, d) * 100) / 100 || Math.abs(d) || Math.hypot(a, b);
          const family = (it.fontName && content.styles[it.fontName]?.fontFamily) ?? '';
          return { str: it.str, x: e, y: f, width: it.width ?? 0, size, bold: BOLD_FONT.test(`${it.fontName ?? ''} ${family}`) };
        });
      pages.push({ width, height, items });
      if (!hasImages && imageOps.size) {
        const ops = await page.getOperatorList();
        hasImages = ops.fnArray.some((fn) => imageOps.has(fn));
      }
      page.cleanup();
    }
    let europassXml: string | null = null;
    const attachments = await doc.getAttachments().catch(() => null);
    const entries: [string, PdfAttachment][] = attachments instanceof Map ? Array.from(attachments.entries()) : attachments ? Object.entries(attachments) : [];
    entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    for (const [key, a] of entries) {
      const name = (a?.filename ?? a?.rawFilename ?? key).toLowerCase();
      if (!name.endsWith('.xml')) continue;
      const content = a?.content ?? (doc.getAttachmentContent ? await doc.getAttachmentContent(key).catch(() => null) : null);
      if (!content || content.byteLength > MAX_XML_BYTES) continue;
      const text = new TextDecoder('utf-8').decode(content);
      if (/SkillsPassport|<\s*([\w-]+:)?Candidate\b|europass/i.test(text.slice(0, 4000))) {
        europassXml = text;
        break;
      }
    }
    return { pages, europassXml, hasImages };
  } finally {
    // pdf.js 6 : la destruction passe par la tâche de chargement (document et worker).
    await task.destroy().catch(() => {});
  }
}

// --- DOCX -----------------------------------------------------------------------------------------

async function readDocx(data: Uint8Array): Promise<{ documentXml: string; hasImages: boolean }> {
  const { unzipSync } = await import('fflate');
  let hasImages = false;
  let tooBig = false;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, {
      filter: (f) => {
        if (f.name.startsWith('word/media/')) {
          hasImages = true;
          return false;
        }
        if (f.name !== 'word/document.xml') return false;
        // Archive piégée (« bombe ») : on refuse un document décompressé démesuré.
        if (f.originalSize > MAX_XML_BYTES) {
          tooBig = true;
          return false;
        }
        return true;
      },
    });
  } catch {
    throw new AppError('cv_unreadable');
  }
  const doc = files['word/document.xml'];
  if (tooBig || !doc) throw new AppError('cv_unreadable');
  return { documentXml: new TextDecoder('utf-8').decode(doc), hasImages };
}

// --- Point d'entrée -------------------------------------------------------------------------------

/**
 * Lit un CV choisi dans le navigateur et renvoie le résultat du lecteur déterministe. Aucune requête réseau
 * n'emporte le fichier : seuls pdf.js et le lecteur sont chargés depuis l'origine de l'app.
 */
export async function readCvFile(file: File, referenceDate = parisToday()): Promise<CvImportResult> {
  if (file.size > CV_MAX_BYTES) throw new AppError('cv_too_large');
  const kind = cvKind(file);
  if (!kind) throw new AppError('cv_unsupported');
  const data = new Uint8Array(await file.arrayBuffer());
  const reader = await import('@sapios/shared/cv-import');
  const options = { referenceDate };
  try {
    if (kind === 'xml') {
      const xml = new TextDecoder('utf-8').decode(data);
      if (!reader.looksLikeEuropass(xml)) throw new AppError('cv_unsupported');
      return reader.parseCv({ kind: 'europass', xml }, options);
    }
    if (kind === 'docx') {
      const { documentXml, hasImages } = await readDocx(data);
      const lines: CvLine[] = reader.docxToLines(documentXml);
      return reader.parseCvFile({ lines, hasImages }, options);
    }
    const { pages, europassXml, hasImages } = await readPdf(data);
    const { lines, columns } = reader.layoutPdf(pages);
    return reader.parseCvFile({ lines, europassXml, hasImages, columns }, options);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('cv_unreadable', String(e));
  }
}
