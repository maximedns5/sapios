import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { AppError } from './errors';
import { supabase } from './supabase';

export const MAX_DIPLOMA_BYTES = 15 * 1024 * 1024;

export type LocalFile = { uri: string; mime: string; name?: string | null; size?: number | null; width?: number; height?: number };

/**
 * Convertit toute image (HEIC compris) en JPEG redimensionné. L'API d'extraction ne lit pas le HEIC
 * et les photos de profil n'ont pas besoin de plus de 1600 px.
 */
export async function toJpeg(uri: string, maxSide: number, quality = 0.82, dims?: { width?: number; height?: number }): Promise<LocalFile> {
  try {
    let width = dims?.width ?? 0;
    let height = dims?.height ?? 0;
    if (!width || !height) {
      const probe = await ImageManipulator.manipulate(uri).renderAsync();
      width = probe.width;
      height = probe.height;
    }
    const ctx = ImageManipulator.manipulate(uri);
    if (Math.max(width, height) > maxSide) ctx.resize(width >= height ? { width: maxSide } : { height: maxSide });
    const image = await ctx.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: quality });
    return { uri: saved.uri, mime: 'image/jpeg', width: saved.width, height: saved.height };
  } catch {
    throw new AppError('file_unreadable');
  }
}

/** Octets d'un fichier local (natif) ou d'une URL blob:/data: (web). */
export async function readBytes(uri: string): Promise<ArrayBuffer> {
  try {
    if (Platform.OS === 'web' || /^(blob:|data:|https?:)/.test(uri)) {
      const res = await fetch(uri);
      return await res.arrayBuffer();
    }
    const bytes = await new File(uri).bytes();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } catch {
    throw new AppError('file_unreadable');
  }
}

export function uuid(): string {
  return Crypto.randomUUID();
}

/** Upload dans un bucket privé, sous {uid}/{uuid}.{ext}. Retourne le chemin d'objet. */
export async function uploadToBucket(bucket: 'photos' | 'diplomas', userId: string, file: LocalFile, ext: string): Promise<{ path: string; size: number }> {
  const bytes = await readBytes(file.uri);
  if (bucket === 'diplomas' && bytes.byteLength > MAX_DIPLOMA_BYTES) throw new AppError('too_large');
  const path = `${userId}/${uuid()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, { contentType: file.mime, upsert: false });
  if (error) {
    const status = Number((error as { statusCode?: string | number }).statusCode ?? 0);
    if (status === 413 || /size/i.test(error.message)) throw new AppError('too_large');
    if (/fetch|network/i.test(error.message)) throw new AppError('network');
    throw new AppError('upload_failed', error.message);
  }
  return { path, size: bytes.byteLength };
}

// URL signées courtes pour les photos : mises en cache jusqu'à peu avant leur expiration.
const SIGNED_TTL = 300;
const signedCache = new Map<string, { url: string; expires: number }>();

export async function signedPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const result: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of paths) {
    const hit = signedCache.get(p);
    if (hit && hit.expires > now) result[p] = hit.url;
    else missing.push(p);
  }
  if (missing.length) {
    const { data, error } = await supabase.storage.from('photos').createSignedUrls(missing, SIGNED_TTL);
    if (!error && data) {
      for (const row of data) {
        if (row.signedUrl && row.path) {
          result[row.path] = row.signedUrl;
          signedCache.set(row.path, { url: row.signedUrl, expires: now + (SIGNED_TTL - 60) * 1000 });
        }
      }
    }
    // Chaîne vide : fichier absent ou non autorisé (le composant affiche alors un monogramme).
    for (const p of missing) if (!(p in result)) result[p] = '';
  }
  return result;
}

export function forgetSignedUrl(path: string) {
  signedCache.delete(path);
}
