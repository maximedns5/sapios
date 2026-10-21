import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';

import { AppError, errorCode, errorMessage } from '@/lib/errors';
import { useLayout } from '@/lib/layout';
import { signedPhotoUrls } from '@/lib/media';
import { addPhoto, loadPhotos, MAX_PHOTOS, MIN_PHOTOS, POSITION_BASE, removePhoto, reorderPhotos } from '@/lib/profile';
import { space } from '@/lib/theme';
import type { Photo } from '@/lib/types';
import { isImage, pickWebFiles, readWebImage, type WebFile } from '@/lib/webFiles';
import { DropTarget } from './DropTarget';
import { Notice } from './Notice';
import { useOverlay } from './Overlay';
import { Label, Mono } from './Text';
import { useTone } from './Tone';

function SmallButton({ label, onPress, testID, accessibilityLabel }: { label: string; onPress: () => void; testID?: string; accessibilityLabel: string }) {
  const { fg, bg } = useTone();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} hitSlop={4}>
      {({ pressed, hovered }) => (
        <View style={{ width: 28, height: 28, backgroundColor: pressed || hovered ? bg : fg, borderWidth: 1, borderColor: fg, alignItems: 'center', justifyContent: 'center' }}>
          <Mono size={13} color={pressed || hovered ? fg : bg}>
            {label}
          </Mono>
        </View>
      )}
    </Pressable>
  );
}

/** Gestion des photos (2 à 6) : ajout, conversion JPEG, réordonnancement, suppression. */
export function PhotoManager({ userId, keepMinimum, onChange }: { userId: string; keepMinimum: boolean; onChange?: (count: number) => void }) {
  const { fg, bg } = useTone();
  const { confirm } = useOverlay();
  const { width, wide, column: maxColumn } = useLayout();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const column = Math.min(width, maxColumn) - space.gutter * 2;
  const slot = (column - 16) / 3;

  const sync = useCallback(
    async (list: Photo[]) => {
      setPhotos(list);
      onChange?.(list.length);
      const map = await signedPhotoUrls(list.map((p) => p.storage_path));
      setUrls((u) => ({ ...u, ...map }));
    },
    [onChange],
  );

  useEffect(() => {
    loadPhotos(userId)
      .then(sync)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [userId, sync]);

  const upload = async (assets: { uri: string; width?: number; height?: number }[]) => {
    setUploading(true);
    let list = photos;
    try {
      for (const asset of assets.slice(0, MAX_PHOTOS - list.length)) {
        const nextPosition = list.length ? Math.max(...list.map((p) => p.position)) + 1 : POSITION_BASE;
        const photo = await addPhoto(userId, asset, nextPosition);
        list = [...list, photo];
        await sync(list);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  // Navigateur : sélection multiple ou glisser-déposer ; images décodées avant l'envoi (HEIC hors Safari refusé).
  const fromFiles = async (files: File[]) => {
    setError(null);
    const images: WebFile[] = [];
    for (const file of files) {
      if (!isImage(file)) {
        setError(errorMessage(new AppError('photo_type')));
        continue;
      }
      try {
        images.push(await readWebImage(file));
      } catch (e) {
        setError(errorMessage(errorCode(e) === 'heic_unsupported' ? new AppError('heic_unsupported_photo') : e));
      }
    }
    if (images.length) await upload(images);
  };

  const add = async () => {
    setError(null);
    if (Platform.OS === 'web') {
      const files = await pickWebFiles('image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif', true);
      if (files.length) await fromFiles(files);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 5], quality: 1 });
    if (result.canceled || !result.assets[0]) return;
    await upload([result.assets[0]]);
  };

  const remove = async (photo: Photo) => {
    setError(null);
    if (keepMinimum && photos.length <= MIN_PHOTOS) {
      setError(`Un profil actif garde au moins ${MIN_PHOTOS} photos. Ajoutez-en une avant de supprimer celle-ci.`);
      return;
    }
    if (!(await confirm({ title: 'Supprimer cette photo ?', confirm: 'Supprimer' }))) return;
    try {
      await removePhoto(photo);
      await sync(photos.filter((p) => p.id !== photo.id));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const move = async (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= photos.length) return;
    setError(null);
    const next = [...photos];
    [next[index], next[target]] = [next[target], next[index]];
    const previous = photos;
    setPhotos(next);
    try {
      await reorderPhotos(next);
      await sync(next.map((p, i) => ({ ...p, position: POSITION_BASE + i })));
    } catch (e) {
      setPhotos(previous);
      setError(errorMessage(e));
    }
  };

  if (loading) return <ActivityIndicator color={fg} style={{ marginTop: 40 }} />;

  const slots = Array.from({ length: MAX_PHOTOS }, (_, i) => photos[i] ?? null);
  const firstEmpty = photos.length;

  const renderSlot = (photo: Photo | null, i: number) => {
    const h = slot * 1.25;
    if (photo) {
      const url = urls[photo.storage_path];
      return (
        <View key={photo.id} testID={`photo-${i}`} style={{ width: slot, height: h, borderWidth: 1.5, borderColor: fg, backgroundColor: fg }}>
          {url ? <Image source={{ uri: url, cacheKey: photo.storage_path }} style={{ flex: 1 }} contentFit="cover" transition={200} /> : null}
          <View style={{ position: 'absolute', top: 0, left: 0, backgroundColor: fg, paddingHorizontal: 6, paddingVertical: 3 }}>
            <Label size={9} color={bg}>
              {i === 0 ? 'Principale' : String(i + 1).padStart(2, '0')}
            </Label>
          </View>
          <View style={{ position: 'absolute', bottom: 4, left: 4, right: 4, flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {i > 0 ? <SmallButton label="‹" accessibilityLabel="Avancer la photo" onPress={() => move(i, -1)} testID={`photo-left-${i}`} /> : null}
              {i < photos.length - 1 ? <SmallButton label="›" accessibilityLabel="Reculer la photo" onPress={() => move(i, 1)} testID={`photo-right-${i}`} /> : null}
            </View>
            <SmallButton label="✕" accessibilityLabel="Supprimer la photo" onPress={() => remove(photo)} testID={`photo-remove-${i}`} />
          </View>
        </View>
      );
    }
    const active = i === firstEmpty && !uploading;
    const busy = i === firstEmpty && uploading;
    return (
      <Pressable key={`empty-${i}`} testID={active ? 'photo-add' : undefined} disabled={!active} onPress={add} accessibilityRole="button" accessibilityLabel="Ajouter une photo">
        {({ pressed, hovered }) => (
          <View
            style={{
              width: slot,
              height: h,
              borderWidth: 1.5,
              borderStyle: active || busy ? 'solid' : 'dashed',
              borderColor: fg,
              backgroundColor: pressed || hovered || busy ? fg : bg,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: active || busy ? 1 : 0.35,
              gap: 6,
            }}
          >
            {busy ? (
              <>
                <ActivityIndicator color={bg} />
                <Label size={9} color={bg}>
                  Envoi…
                </Label>
              </>
            ) : (
              <>
                <Mono size={26} color={pressed || hovered ? bg : fg}>
                  +
                </Mono>
                {active ? (
                  <Label size={9} color={pressed || hovered ? bg : fg}>
                    Ajouter
                  </Label>
                ) : null}
              </>
            )}
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={{ gap: 16 }}>
      <DropTarget disabled={uploading || photos.length >= MAX_PHOTOS} onFiles={fromFiles}>
        {(over) => (
          <View
            testID="photo-grid"
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, outlineStyle: over ? 'dashed' : 'none', outlineWidth: 1.5, outlineColor: fg, outlineOffset: 6 } as object}
          >
            {slots.map(renderSlot)}
          </View>
        )}
      </DropTarget>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Label>
          {photos.length} / {MAX_PHOTOS}
        </Label>
        <Label style={{ opacity: 0.6 }}>{wide ? 'Glisser-déposer · JPEG · 1600 px max' : 'JPEG · 1600 px max'}</Label>
      </View>
      {error ? <Notice testID="photo-error" title="Erreur" message={error} /> : null}
    </View>
  );
}
