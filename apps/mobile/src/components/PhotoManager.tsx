import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { AppError, errorCode, errorMessage } from '@/lib/errors';
import { useLayout } from '@/lib/layout';
import { signedPhotoUrls } from '@/lib/media';
import { addPhoto, loadPhotos, MAX_PHOTOS, MIN_PHOTOS, POSITION_BASE, removePhoto, reorderPhotos } from '@/lib/profile';
import type { Photo } from '@/lib/types';
import { isImage, pickWebFiles, readWebImage, type WebFile } from '@/lib/webFiles';
import { colors, radius, shadow } from '@/lib/theme';
import { DropTarget } from './DropTarget';
import { ChevronLeftIcon, ChevronRightIcon, CrossIcon, PlusIcon } from './Icons';
import { PopIn, Spinner } from './motion';
import { Notice } from './Notice';
import { useOverlay } from './Overlay';
import { Body, Small } from './Text';

/** Petit bouton rond blanc posé sur une vignette (zone tactile de 44 px). */
function TileButton({ children, onPress, testID, accessibilityLabel }: { children: React.ReactNode; onPress: () => void; testID?: string; accessibilityLabel: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} hitSlop={8}>
      {({ pressed }) => (
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', boxShadow: shadow.soft, transform: [{ scale: pressed ? 0.9 : 1 }] }}>
          {children}
        </View>
      )}
    </Pressable>
  );
}

/** Gestion des photos (2 à 6) : ajout, conversion JPEG, réordonnancement, suppression. */
export function PhotoManager({ userId, keepMinimum, onChange }: { userId: string; keepMinimum: boolean; onChange?: (count: number) => void }) {
  const { confirm } = useOverlay();
  const { columnWidth, wide } = useLayout();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slot = (columnWidth - 40 - 20) / 3;

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

  if (loading) return <View style={{ paddingVertical: 40, alignItems: 'center' }}><Spinner /></View>;

  const slots = Array.from({ length: MAX_PHOTOS }, (_, i) => photos[i] ?? null);
  const firstEmpty = photos.length;

  const renderSlot = (photo: Photo | null, i: number) => {
    const h = slot * (4 / 3);
    if (photo) {
      const url = urls[photo.storage_path];
      return (
        <PopIn key={photo.id} duration={450} overshoot={1.08}>
          <View testID={`photo-${i}`} accessibilityLabel={i === 0 ? 'Photo principale' : `Photo ${i + 1}`} style={{ width: slot, height: h, borderRadius: radius.tile, overflow: 'hidden', backgroundColor: colors.photo }}>
            {url ? <Image source={{ uri: url, cacheKey: photo.storage_path }} style={{ flex: 1 }} contentFit="cover" transition={200} /> : null}
            {i === 0 ? (
              <View style={{ position: 'absolute', left: 8, top: 10, backgroundColor: '#FFFFFF', borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
                <Body size={11.5} weight="bold" style={{ lineHeight: 16 }}>
                  Principale
                </Body>
              </View>
            ) : null}
            <View style={{ position: 'absolute', top: 6, right: 6 }}>
              <TileButton accessibilityLabel={`Supprimer la photo ${i + 1}`} onPress={() => remove(photo)} testID={`photo-remove-${i}`}>
                <CrossIcon size={14} stroke={2.6} color={colors.text} />
              </TileButton>
            </View>
            {photos.length > 1 ? (
              <View style={{ position: 'absolute', bottom: 6, right: 6, flexDirection: 'row', gap: 6 }}>
                {i > 0 ? (
                  <TileButton accessibilityLabel={`Avancer la photo ${i + 1}`} onPress={() => move(i, -1)} testID={`photo-left-${i}`}>
                    <ChevronLeftIcon size={14} stroke={2.6} color={colors.text} />
                  </TileButton>
                ) : null}
                {i < photos.length - 1 ? (
                  <TileButton accessibilityLabel={`Reculer la photo ${i + 1}`} onPress={() => move(i, 1)} testID={`photo-right-${i}`}>
                    <ChevronRightIcon size={14} stroke={2.6} color={colors.text} />
                  </TileButton>
                ) : null}
              </View>
            ) : null}
          </View>
        </PopIn>
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
              borderRadius: radius.tile,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: hovered && active ? colors.accent : colors.disabled,
              backgroundColor: colors.surfaceSoft,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: active || busy ? 1 : 0.5,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            }}
          >
            {busy ? (
              <Spinner />
            ) : (
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: active ? colors.accent : colors.disabled, alignItems: 'center', justifyContent: 'center' }}>
                <PlusIcon size={18} stroke={2.6} color="#FFFFFF" />
              </View>
            )}
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={{ gap: 12 }}>
      <DropTarget disabled={uploading || photos.length >= MAX_PHOTOS} onFiles={fromFiles}>
        {(over) => (
          <View
            testID="photo-grid"
            accessibilityLabel="Vos photos"
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, outlineStyle: over ? 'dashed' : 'none', outlineWidth: 2, outlineColor: colors.accent, outlineOffset: 6, borderRadius: radius.tile } as object}
          >
            {slots.map(renderSlot)}
          </View>
        )}
      </DropTarget>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <Small style={{ flex: 1 }}>{wide ? 'La première est celle qu’on voit d’abord. Glisser-déposer accepté.' : 'La première est celle qu’on voit d’abord.'}</Small>
        <Body weight="bold" size={14}>
          {photos.length} / {MAX_PHOTOS}
        </Body>
      </View>
      {error ? <Notice testID="photo-error" kind="error" message={error} /> : null}
    </View>
  );
}
