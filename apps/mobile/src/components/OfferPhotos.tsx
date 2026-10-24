import { OFFER_PHOTO_KIND_LABELS, type OfferPhoto } from '@sapios/shared';
import { useState } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '@/lib/theme';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons';
import { Photo, useSignedUrls } from './Photo';
import { Small } from './Text';

/**
 * Photos d'une offre (lieu de travail réel, manager, équipe…), une à la fois : toucher la moitié droite ou
 * gauche avance ou recule, comme une pile de photos. Libellé du type de photo et compteur en surimpression.
 */
export function OfferPhotos({ photos, company, height = 260, style, rounded = 0 }: { photos: OfferPhoto[]; company: string; height?: number; style?: StyleProp<ViewStyle>; rounded?: number }) {
  const sorted = [...photos].sort((a, b) => a.position - b.position);
  const urls = useSignedUrls(sorted.map((p) => p.storage_path));
  const [index, setIndex] = useState(0);
  const count = sorted.length;
  const current = sorted[Math.min(index, Math.max(0, count - 1))];
  const label = current ? OFFER_PHOTO_KIND_LABELS[current.kind] : 'Lieu de travail';
  const go = (step: number) => setIndex((i) => (count ? (i + step + count) % count : 0));

  return (
    <View style={[{ height, borderTopLeftRadius: rounded, borderTopRightRadius: rounded, overflow: 'hidden', backgroundColor: colors.photo }, style]}>
      <Photo
        path={current?.storage_path ?? null}
        url={current ? urls[current.storage_path] : ''}
        name={company}
        initialSize={56}
        accessibilityLabel={`${label}, ${company}${count > 1 ? `, photo ${index + 1} sur ${count}` : ''}`}
        style={{ flex: 1 }}
      />
      {count > 1 ? (
        <>
          <View pointerEvents="none" style={{ position: 'absolute', top: 10, left: 12, right: 12, flexDirection: 'row', gap: 4 }}>
            {sorted.map((p, i) => (
              <View key={p.id} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i === index ? '#FFFFFF' : 'rgba(255,255,255,0.45)' }} />
            ))}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Photo précédente" onPress={() => go(-1)} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '35%', justifyContent: 'center', paddingLeft: 8 }}>
            {({ hovered }) => (hovered ? <ChevronLeftIcon size={26} color="#FFFFFF" /> : null)}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Photo suivante" onPress={() => go(1)} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '35%', justifyContent: 'center', alignItems: 'flex-end', paddingRight: 8 }}>
            {({ hovered }) => (hovered ? <ChevronRightIcon size={26} color="#FFFFFF" /> : null)}
          </Pressable>
        </>
      ) : null}
      <View pointerEvents="none" style={{ position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', gap: 6 }}>
        <View style={{ backgroundColor: 'rgba(26,25,24,0.62)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Small size={13} weight="bold" color="#FFFFFF">
            {label}
          </Small>
        </View>
        {count > 1 ? (
          <View style={{ backgroundColor: 'rgba(26,25,24,0.62)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Small size={13} weight="bold" color="#FFFFFF">
              {index + 1} / {count}
            </Small>
          </View>
        ) : null}
      </View>
    </View>
  );
}
