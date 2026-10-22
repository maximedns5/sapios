import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { signedPhotoUrls } from '@/lib/media';
import { colors, fonts } from '@/lib/theme';
import { Body } from './Text';

export function useSignedUrls(paths: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.join('|');
  useEffect(() => {
    let alive = true;
    if (!paths.length) return;
    signedPhotoUrls(paths).then((map) => alive && setUrls(map));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}

/** Photo privée (URL signée courte). En attendant ou à défaut : fond chaud et initiale. */
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

/** Avatar rond (listes, en-têtes de conversation). `ring` : anneau d'accent (nouveau match). */
export function Avatar({ path, url, name, size = 52, ring }: { path?: string | null; url?: string; name: string; size?: number; ring?: boolean }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, padding: ring ? 3 : 0, backgroundColor: ring ? colors.accent : 'transparent' }}>
      <View style={{ flex: 1, borderRadius: size / 2, overflow: 'hidden', borderWidth: ring ? 2 : 0, borderColor: '#FFFFFF' }}>
        <Photo path={path} url={url} name={name} initialSize={size * 0.4} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
