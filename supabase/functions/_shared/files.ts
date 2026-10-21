import { DIPLOMA_EXTENSIONS, DIPLOMA_MIME_TYPES, type DiplomaMime } from "./shared.ts";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PATH_RE = new RegExp(`^(${UUID})/(${UUID})\\.([a-z0-9]{1,10})$`, "i");

export type PathCheck =
  | { ok: true; path: string; mime: DiplomaMime }
  | { ok: false; error: "invalid_path" | "invalid_type" };

export function isDiplomaMime(value: unknown): value is DiplomaMime {
  return typeof value === "string" && (DIPLOMA_MIME_TYPES as readonly string[]).includes(value);
}

/**
 * Chemin d'objet `{uid}/{uuid}.{ext}` dans le bucket `diplomas`, dans le dossier de l'appelant.
 * Un préfixe `diplomas/` est toléré puis retiré. L'extension doit correspondre au type déclaré.
 */
export function checkDiplomaPath(rawPath: unknown, declaredMime: unknown, uid: string): PathCheck {
  if (typeof rawPath !== "string") return { ok: false, error: "invalid_path" };
  const path = rawPath.trim().replace(/^diplomas\//, "");
  const m = PATH_RE.exec(path);
  // Le premier dossier doit être exactement l'uid (même règle que la politique Storage).
  if (!m || m[1] !== uid) return { ok: false, error: "invalid_path" };
  const extMime = DIPLOMA_EXTENSIONS[m[3].toLowerCase()];
  if (!extMime || !isDiplomaMime(declaredMime) || extMime !== declaredMime) return { ok: false, error: "invalid_type" };
  return { ok: true, path, mime: declaredMime };
}

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** Type réel d'après les premiers octets ; `image/heic` est reconnu pour être refusé explicitement. */
export function sniffMime(bytes: Uint8Array): DiplomaMime | "image/heic" | null {
  // La norme PDF tolère quelques octets avant l'en-tête.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (head.includes("%PDF-")) return "application/pdf";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "image/webp";
  if (startsWith(bytes, ascii("ftyp"), 4)) {
    const brand = new TextDecoder("latin1").decode(bytes.subarray(8, 12));
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand)) return "image/heic";
  }
  return null;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64Length(byteLength: number): number {
  return 4 * Math.ceil(byteLength / 3);
}
