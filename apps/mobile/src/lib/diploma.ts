import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { api } from './api';
import { AppError } from './errors';
import { MAX_DIPLOMA_BYTES, readBytes, toJpeg, uploadToBucket, type LocalFile } from './media';

const EXTRACTION_MAX_BYTES = 7 * 1024 * 1024;

export type DiplomaPick = LocalFile & { kind: 'image' | 'pdf'; name: string };

export const CAMERA_AVAILABLE = Platform.OS !== 'web';

function fromImageAsset(asset: ImagePicker.ImagePickerAsset, fallbackName: string): DiplomaPick {
  return {
    kind: 'image',
    uri: asset.uri,
    mime: asset.mimeType ?? 'image/jpeg',
    name: asset.fileName ?? fallbackName,
    size: asset.fileSize ?? null,
    width: asset.width,
    height: asset.height,
  };
}

export async function pickFromCamera(): Promise<DiplomaPick | null> {
  if (!CAMERA_AVAILABLE) throw new AppError('unavailable_on_web');
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new AppError('permission_denied');
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  if (res.canceled || !res.assets[0]) return null;
  return fromImageAsset(res.assets[0], 'photo-diplome.jpg');
}

export async function pickFromLibrary(): Promise<DiplomaPick | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (res.canceled || !res.assets[0]) return null;
  return fromImageAsset(res.assets[0], 'diplome.jpg');
}

export async function pickPdf(): Promise<DiplomaPick | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf'], copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  return { kind: 'pdf', uri: a.uri, mime: 'application/pdf', name: a.name, size: a.size ?? null };
}

export type SubmitStep = 'convert' | 'upload' | 'submit';

/**
 * Prépare et envoie le diplôme : images (HEIC compris) converties en JPEG côté client, contrôle
 * des 15 Mo, dépôt dans diplomas/{uid}/{uuid}.{ext}, puis appel de submit-diploma.
 */
export async function submitDiploma(userId: string, pick: DiplomaPick, onStep: (s: SubmitStep) => void): Promise<string> {
  let file: LocalFile = pick;
  let ext = 'pdf';
  if (pick.kind === 'image') {
    onStep('convert');
    file = await toJpeg(pick.uri, 2400, 0.85, pick);
    // Au-delà de ~7 Mo, l'extraction refuse l'image : on recompresse plus fort.
    if ((await readBytes(file.uri)).byteLength > EXTRACTION_MAX_BYTES) file = await toJpeg(pick.uri, 2000, 0.7, pick);
    ext = 'jpg';
  } else if (pick.size != null && pick.size > MAX_DIPLOMA_BYTES) {
    throw new AppError('too_large');
  }
  onStep('upload');
  const { path } = await uploadToBucket('diplomas', userId, file, ext);
  onStep('submit');
  const res = await api.submitDiploma(path, file.mime);
  return res.submission_id;
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} Ko`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}
