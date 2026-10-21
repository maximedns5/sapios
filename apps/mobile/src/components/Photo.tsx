import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { signedPhotoUrls } from '@/lib/media';
import { INK, PAPER } from '@/lib/theme';
import { Label, Title } from './Text';

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

/** Photo privée (URL signée courte) ; à défaut, monogramme typographique. */
export function Photo({
  path,
  url,
  name,
  style,
  monogramSize = 120,
  caption = true,
}: {
  path?: string | null;
  url?: string;
  name: string;
  style?: StyleProp<ViewStyle>;
  monogramSize?: number;
  caption?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const showImage = !!url && !failed;
  return (
    <View style={[{ backgroundColor: INK, overflow: 'hidden' }, style]}>
      {showImage ? (
        <Image
          source={{ uri: url, cacheKey: path ?? undefined }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          contentFit="cover"
          transition={250}
          onError={() => setFailed(true)}
          accessibilityLabel={`Photo de ${name}`}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Title size={monogramSize} color={PAPER} style={{ fontFamily: 'BodoniModa_400Regular_Italic', lineHeight: monogramSize * 1.15 }}>
            {name.trim().charAt(0).toUpperCase() || 'S'}
          </Title>
          {caption && monogramSize >= 60 && url === undefined && path ? (
            <Label size={9} color={PAPER} style={{ opacity: 0.6, marginTop: 8 }}>
              Chargement…
            </Label>
          ) : null}
        </View>
      )}
    </View>
  );
}
