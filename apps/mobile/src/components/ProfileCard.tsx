import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { describe } from '@/lib/candidates';
import { alpha, INK, PAPER } from '@/lib/theme';
import type { Candidate } from '@/lib/types';
import { Photo, useSignedUrls } from './Photo';
import { Body, Label, Title } from './Text';
import { useTone } from './Tone';

/** Carte de profil : photos (tap gauche/droite), prénom et âge en Didone, ville et distance en mono. */
export function ProfileCard({ candidate, onOpen, bioLines = 3 }: { candidate: Candidate; onOpen?: () => void; bioLines?: number }) {
  const { fg, bg } = useTone();
  const paths = candidate.photo_paths ?? [];
  const urls = useSignedUrls(paths);
  const [index, setIndex] = useState(0);
  const current = paths[index];

  return (
    <View style={{ flex: 1, backgroundColor: bg, borderWidth: 1.5, borderColor: fg, padding: 6 }} testID="profile-card">
      <View style={{ flex: 1, borderWidth: 1, borderColor: fg }}>
        <Photo path={current} url={current ? urls[current] : ''} name={candidate.display_name} style={{ flex: 1 }} />
        {paths.length > 1 ? (
          <View style={{ position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', gap: 4 }}>
            {paths.map((p, i) => (
              <View key={p} style={{ flex: 1, height: 2, backgroundColor: i === index ? PAPER : alpha(PAPER, 0.35) }} />
            ))}
          </View>
        ) : null}
        {paths.length > 1 ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' }}>
            <Pressable accessibilityLabel="Photo précédente" style={{ flex: 1 }} onPress={() => setIndex((i) => Math.max(0, i - 1))} />
            <Pressable accessibilityLabel="Photo suivante" style={{ flex: 1 }} onPress={() => setIndex((i) => Math.min(paths.length - 1, i + 1))} />
          </View>
        ) : null}
        <View style={{ position: 'absolute', bottom: 0, left: 0, backgroundColor: INK, paddingHorizontal: 8, paddingVertical: 4 }}>
          <Label size={9} color={PAPER}>
            {String(index + 1).padStart(2, '0')} / {String(Math.max(paths.length, 1)).padStart(2, '0')}
          </Label>
        </View>
      </View>
      <Pressable onPress={onOpen} disabled={!onOpen} accessibilityRole={onOpen ? 'button' : undefined} accessibilityLabel={`Profil de ${candidate.display_name}`}>
        <View style={{ paddingHorizontal: 10, paddingTop: 12, paddingBottom: 8, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <Title testID="card-name" size={34} numberOfLines={1} style={{ flexShrink: 1 }}>
              {candidate.display_name}
              {candidate.age != null ? <Title size={34} style={{ fontFamily: 'BodoniModa_400Regular_Italic' }}>, {candidate.age}</Title> : null}
            </Title>
            {onOpen ? <Label style={{ opacity: 0.6 }}>Profil →</Label> : null}
          </View>
          {describe(candidate) ? <Label>{describe(candidate)}</Label> : null}
          {candidate.bio ? (
            <Body size={14} numberOfLines={bioLines} style={{ lineHeight: 20, marginTop: 4 }}>
              {candidate.bio}
            </Body>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}
