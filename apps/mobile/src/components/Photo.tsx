import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { signedPhotoUrls, type PhotoBucket } from '@/lib/media';
import { colors, fonts } from '@/lib/theme';
import { Body } from './Text';

/** URL signées (5 min, en cache) des photos privées d'un bucket ; chaîne vide si l'objet est absent ou interdit. */
export function useSignedUrls(paths: string[], bucket: PhotoBucket = 'offer-photos'): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = `${bucket}:${paths.join('|')}`;
  useEffect(() => {
    let alive = true;
    if (!paths.length) return;
    signedPhotoUrls(paths, bucket).then((map) => alive && setUrls(map));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}

/** Photo privée (URL signée courte). En attendant ou à défaut : fond chaud et initiale. Jamais de photo de candidat. */
export function Photo({
  path,
  url,
  name,
  style,
  initialSize = 64,
  accessibilityLabel,
}: {
  path?: string | null;
  url?: string;
  name: string;
  style?: StyleProp<ViewStyle>;
  initialSize?: number;
  accessibilityLabel?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const showImage = !!url && !failed;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? `Photo de ${name}`}
      style={[{ backgroundColor: colors.photo, overflow: 'hidden' }, style]}
    >
      {showImage ? (
        <Image
          source={{ uri: url, cacheKey: path ?? undefined }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          contentFit="cover"
          transition={250}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Body size={initialSize} color="#FFFFFF" style={{ fontFamily: fonts.extrabold, lineHeight: initialSize * 1.2, opacity: 0.9 }}>
            {name.trim().charAt(0).toUpperCase() || 'S'}
          </Body>
        </View>
      )}
    </View>
  );
}
