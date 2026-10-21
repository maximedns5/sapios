import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View, useWindowDimensions } from 'react-native';

import { errorMessage } from '@/lib/errors';
import { signedPhotoUrls } from '@/lib/media';
import { addPhoto, loadPhotos, MAX_PHOTOS, MIN_PHOTOS, POSITION_BASE, removePhoto, reorderPhotos } from '@/lib/profile';
import { space } from '@/lib/theme';
import type { Photo } from '@/lib/types';
import { Notice } from './Notice';
import { useOverlay } from './Overlay';
import { Label, Mono } from './Text';
import { useTone } from './Tone';

function SmallButton({ label, onPress, testID, accessibilityLabel }: { label: string; onPress: () => void; testID?: string; accessibilityLabel: string }) {
  const { fg, bg } = useTone();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} hitSlop={4}>
      {({ pressed }) => (
        <View style={{ width: 28, height: 28, backgroundColor: pressed ? bg : fg, borderWidth: 1, borderColor: fg, alignItems: 'center', justifyContent: 'center' }}>
          <Mono size={13} color={pressed ? fg : bg}>
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
  const { width } = useWindowDimensions();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const column = Math.min(width, 560) - space.gutter * 2;
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

  const add = async () => {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 5], quality: 1 });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    try {
      const nextPosition = photos.length ? Math.max(...photos.map((p) => p.position)) + 1 : POSITION_BASE;
      const photo = await addPhoto(userId, result.assets[0], nextPosition);
      await sync([...photos, photo]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
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

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} testID="photo-grid">
        {slots.map((photo, i) => {
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
              {({ pressed }) => (
                <View
                  style={{
                    width: slot,
                    height: h,
                    borderWidth: 1.5,
                    borderStyle: active || busy ? 'solid' : 'dashed',
                    borderColor: fg,
                    backgroundColor: pressed || busy ? fg : bg,
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
                      <Mono size={26} color={pressed ? bg : fg}>
                        +
                      </Mono>
                      {active ? (
                        <Label size={9} color={pressed ? bg : fg}>
                          Ajouter
                        </Label>
                      ) : null}
                    </>
                  )}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Label>
          {photos.length} / {MAX_PHOTOS}
        </Label>
        <Label style={{ opacity: 0.6 }}>JPEG · 1600 px max</Label>
      </View>
      {error ? <Notice testID="photo-error" title="Erreur" message={error} /> : null}
    </View>
  );
}
