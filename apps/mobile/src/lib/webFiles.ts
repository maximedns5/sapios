import { AppError } from './errors';

/** Fichier choisi dans le navigateur : URL blob: lisible par fetch, ImageManipulator et expo-image. */
export type WebFile = { uri: string; mime: string; name: string; size: number; width?: number; height?: number };

const HEIC_NAME = /\.(heic|heif)$/i;
const HEIC_TYPE = /^image\/hei[cf]/i;

export function isHeic(file: { name?: string | null; type?: string | null }): boolean {
  return HEIC_TYPE.test(file.type ?? '') || HEIC_NAME.test(file.name ?? '');
}

export function isPdf(file: { name?: string | null; type?: string | null }): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '');
}

export function isImage(file: { name?: string | null; type?: string | null }): boolean {
  return /^image\//.test(file.type ?? '') || isHeic(file) || /\.(jpe?g|png|webp)$/i.test(file.name ?? '');
}

/** Sélecteur de fichiers du navigateur ; liste vide si la personne annule. */
export function pickWebFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    // Safari iOS n'ouvre le sélecteur que si le champ est dans le document.
    document.body.appendChild(input);
    const done = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => done(Array.from(input.files ?? [])), { once: true });
    input.addEventListener('cancel', () => done([]), { once: true });
    input.click();
  });
}

/**
 * Vérifie qu'une image se décode dans ce navigateur. Le HEIC des iPhone ne se lit que dans Safari :
 * ailleurs, message explicite plutôt qu'un échec muet à la conversion JPEG.
 */
export async function readWebImage(file: File): Promise<WebFile> {
  const uri = URL.createObjectURL(file);
  try {
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('decode'));
      img.src = uri;
    });
    return { uri, mime: file.type || (isHeic(file) ? 'image/heic' : 'image/jpeg'), name: file.name, size: file.size, width, height };
  } catch {
    URL.revokeObjectURL(uri);
    throw new AppError(isHeic(file) ? 'heic_unsupported' : 'file_unreadable');
  }
}

export function webPdf(file: File): WebFile {
  return { uri: URL.createObjectURL(file), mime: 'application/pdf', name: file.name, size: file.size };
}
