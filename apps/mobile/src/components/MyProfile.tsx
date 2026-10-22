import { levelLabel } from '@sapios/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { useApp } from '@/lib/app-state';
import { profileCompletion } from '@/lib/completion';
import { useLayout } from '@/lib/layout';
import { signedPhotoUrls } from '@/lib/media';
import { loadOwnProfile, loadPhotos, MAX_PHOTOS } from '@/lib/profile';
import { colors, radius, space } from '@/lib/theme';
import type { OwnProfile, Photo as PhotoRow } from '@/lib/types';
import { Button, IconButton } from './Button';
import { EditIcon, EyeIcon, GearIcon, PlusIcon, VerifiedBadge } from './Icons';
import { MaskUp, Rise, useCountUp } from './motion';
import { Photo } from './Photo';
import { Body, Heading, Small, Title } from './Text';

const RING = 116;
const STROKE = 6;
const CIRC = 2 * Math.PI * (RING / 2 - STROKE / 2);

/** Anneau de complétion autour de la photo principale, rempli en s'animant. */
function CompletionRing({ value, photo, name }: { value: number; photo?: { path: string; url?: string }; name: string }) {
  const pct = useCountUp(Math.round(value * 100), { delay: 250, duration: 1000 });
  return (
    <View style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={RING} height={RING} style={{ position: 'absolute' }}>
        <Circle cx={RING / 2} cy={RING / 2} r={RING / 2 - STROKE / 2} stroke={colors.line} strokeWidth={STROKE} fill="none" />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={RING / 2 - STROKE / 2}
          stroke={colors.accent}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${CIRC}`}
          strokeDashoffset={CIRC * (1 - pct / 100)}
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
      <View style={{ width: RING - 24, height: RING - 24, borderRadius: (RING - 24) / 2, overflow: 'hidden' }}>
        <Photo path={photo?.path} url={photo?.url} name={name} initialSize={36} style={{ flex: 1 }} accessibilityLabel="Votre photo principale" />
      </View>
      <View accessibilityRole="text" accessibilityLabel={`Profil complété à ${pct} %`} style={{ position: 'absolute', bottom: -6, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 2, borderWidth: 2, borderColor: '#FFFFFF' }}>
        <Body size={12.5} weight="extrabold" color="#FFFFFF" style={{ lineHeight: 17 }}>
          {pct} %
        </Body>
      </View>
    </View>
  );
}

/**
 * Onglet « Profil » : son propre profil, tel qu'il se construit (photos, bio, repères), avec l'anneau
 * de complétion. Réglages du compte derrière la roue crantée. Les réponses aux questions et la
 * bibliothèque (profil intellectuel) viendront s'ajouter ici.
 */
export function MyProfile() {
  const { state, userId } = useApp();
  const insets = useSafeAreaInsets();
  const { columnWidth } = useLayout();
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      loadOwnProfile(userId).then(setProfile).catch(() => {});
      loadPhotos(userId)
        .then(async (list) => {
          setPhotos(list);
          setUrls(await signedPhotoUrls(list.map((p) => p.storage_path)));
        })
        .catch(() => {});
    }, [userId]),
  );

  if (!state) return null;
  const name = profile?.display_name ?? 'Vous';
  const completion = profileCompletion({ photos: photos.length, bio: profile?.bio });
  const tile = (columnWidth - space.gutter * 2 - 20) / 3;
  const main = photos[0];
  const meta = [state.level ? `${levelLabel(state.level)} validé` : null, profile?.city || null].filter(Boolean).join(' · ');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="account">
      <View style={{ height: 64, paddingLeft: space.gutter, paddingRight: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <MaskUp>
          <Title size={30}>Mon profil</Title>
        </MaskUp>
        <IconButton label="Compte et réglages" onPress={() => router.push('/settings')} testID="open-settings">
          <GearIcon size={20} />
        </IconButton>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.xl, gap: 26 }}>
        <Rise style={{ flexDirection: 'row', alignItems: 'center', gap: 18, paddingTop: 6 }}>
          <CompletionRing value={completion.value} photo={main ? { path: main.storage_path, url: urls[main.storage_path] } : undefined} name={name} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Body weight="extrabold" size={22} numberOfLines={1} style={{ flexShrink: 1 }}>
                {name}
              </Body>
              {state.level ? <VerifiedBadge size={20} /> : null}
            </View>
            {meta ? <Small size={14}>{meta}</Small> : null}
            <Body weight="semibold" size={14} color={colors.accent} style={{ marginTop: 4 }}>
              {completion.next ?? 'Profil complet. Bravo.'}
            </Body>
          </View>
        </Rise>

        <Rise delay={100} style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Heading size={18}>Mes photos</Heading>
            <Small weight="bold">
              {photos.length} / {MAX_PHOTOS}
            </Small>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {Array.from({ length: MAX_PHOTOS }, (_, i) => photos[i] ?? null).map((p, i) =>
              p ? (
                <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Photo ${i + 1}${i === 0 ? ', principale' : ''}. Gérer mes photos`} onPress={() => router.push('/settings/photos')}>
                  <Photo path={p.storage_path} url={urls[p.storage_path]} name={name} initialSize={28} style={{ width: tile, height: tile * (4 / 3), borderRadius: 16 }} />
                </Pressable>
              ) : (
                <Pressable key={`add-${i}`} accessibilityRole="button" accessibilityLabel="Ajouter une photo" onPress={() => router.push('/settings/photos')}>
                  <View style={{ width: tile, height: tile * (4 / 3), borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.disabled, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                      <PlusIcon size={16} stroke={2.6} color="#FFFFFF" />
                    </View>
                  </View>
                </Pressable>
              ),
            )}
          </View>
        </Rise>

        <Rise delay={180} style={{ gap: 12 }}>
          <Heading size={18}>En quelques mots</Heading>
          <Pressable accessibilityRole="button" accessibilityLabel={profile?.bio ? 'Modifier ma bio' : 'Écrire ma bio'} onPress={() => router.push('/settings/profile')}>
            {({ pressed }) =>
              profile?.bio ? (
                <View style={{ backgroundColor: pressed ? colors.line : colors.surface, borderRadius: radius.card, padding: 20, flexDirection: 'row', gap: 12 }}>
                  <Body weight="bold" size={18} style={{ flex: 1, lineHeight: 25 }}>
                    {profile.bio}
                  </Body>
                  <EditIcon size={18} color={colors.muted} />
                </View>
              ) : (
                <View style={{ borderRadius: radius.card, padding: 18, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.disabled, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <PlusIcon size={18} stroke={2.6} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Body weight="bold">Écrire ma bio</Body>
                    <Small>Une phrase suffit. Elle s’affiche sous votre première photo.</Small>
                  </View>
                </View>
              )
            }
          </Pressable>
        </Rise>

        <Rise delay={260} style={{ gap: 12 }}>
          <Heading size={18}>Mes repères</Heading>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, paddingHorizontal: 18, paddingVertical: 4 }}>
            {[
              ['Ville', profile?.city || '—'],
              ['Âge recherché', profile ? `${profile.age_min} – ${profile.age_max} ans` : '—'],
            ].map(([k, v], i) => (
              <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
                <Small size={14.5} weight="semibold">
                  {k}
                </Small>
                <Body size={15} weight="bold">
                  {v}
                </Body>
              </View>
            ))}
          </View>
          <Button label="Modifier mon profil" variant="secondary" icon={<EditIcon size={18} />} onPress={() => router.push('/settings/profile')} />
          {userId ? (
            <Button label="Voir mon profil comme les autres" variant="ghost" icon={<EyeIcon size={18} color={colors.muted} />} onPress={() => router.push({ pathname: '/profile/[userId]', params: { userId, from: 'self' } })} />
          ) : null}
        </Rise>
      </ScrollView>
    </View>
  );
}
