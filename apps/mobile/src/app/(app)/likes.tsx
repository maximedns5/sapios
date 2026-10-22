import { parseLikedItem } from '@sapios/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/Button';
import { CrossIcon, HeartIcon } from '@/components/Icons';
import { haptic, MaskUp, PopIn, Rise, Spinner } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { Avatar, Photo, useSignedUrls } from '@/components/Photo';
import { Body, Small, Title } from '@/components/Text';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { describe, rememberCandidates } from '@/lib/candidates';
import { useCopy } from '@/lib/copy';
import { errorMessage } from '@/lib/errors';
import { noteOwnMatch } from '@/lib/inbox';
import { promptText } from '@/lib/intellect';
import { goToTab } from '@/lib/nav';
import { colors, radius, shadow, space } from '@/lib/theme';
import type { Liker } from '@/lib/types';

const people = (n: number) => `${n} personne${n > 1 ? 's' : ''} vous ${n > 1 ? 'ont' : 'a'} liké`;

/**
 * Likes reçus. Paliers qui voient leurs likers (get_likers) : ce qui a été aimé chez moi, le mot joint,
 * et un cœur ou une croix pour répondre. Les autres voient le nombre seul (get_likes_count), jamais qui.
 */
export default function Likes() {
  const { state } = useApp();
  const { t } = useCopy();
  const overlay = useOverlay();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Liker[] | null>(null);
  const [count, setCount] = useState<number | null>(state?.likes_received ?? null);
  const [error, setError] = useState<string | null>(null);
  const urls = useSignedUrls(
    (rows ?? []).flatMap((r) => [r.photo_paths?.[0], r.liked_photo_path]).filter((p): p is string => !!p),
  );
  const sees = !!state?.sees_likers;

  useFocusEffect(
    useCallback(() => {
      if (!sees) {
        api.likesCount().then(setCount).catch(() => {});
        return;
      }
      api
        .likers()
        .then((list) => {
          rememberCandidates(list);
          setRows(list);
          setError(null);
        })
        .catch((e) => setError(errorMessage(e)));
    }, [sees]),
  );

  const answer = async (c: Liker, direction: 'like' | 'pass') => {
    if (direction === 'like') haptic.light();
    setRows((list) => (list ?? []).filter((r) => r.id !== c.id));
    try {
      const res = await api.swipe(c.id, direction);
      if (res.matched && res.match_id) {
        noteOwnMatch(res.match_id);
        router.push({ pathname: '/match/[matchId]', params: { matchId: res.match_id, name: c.display_name, photo: c.photo_paths?.[0] ?? '' } });
      }
    } catch (e) {
      setRows((list) => [c, ...(list ?? [])]);
      overlay.toast(errorMessage(e));
    }
  };

  const total = rows?.length ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="likes">
      <FlatList
        data={sees ? rows ?? [] : []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: space.xl, gap: 12 }}
        ListHeaderComponent={
          <View style={{ gap: 2, paddingHorizontal: 4, paddingTop: 16, paddingBottom: 6 }}>
            <MaskUp>
              <Title size={30}>Likes</Title>
            </MaskUp>
            {sees && rows ? (
              <Body muted size={15}>
                {total ? people(total) : 'Personne pour l’instant'}
              </Body>
            ) : null}
            {!sees && count != null ? (
              <Body muted size={15}>
                {count ? people(count) : 'Personne pour l’instant'}
              </Body>
            ) : null}
            {sees && rows === null && !error ? (
              <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                <Spinner />
              </View>
            ) : null}
            {error ? <Notice kind="error" message={error} style={{ marginTop: 10 }} /> : null}
            {!sees ? <Teaser count={count ?? 0} text={t('likes.teaser')} /> : null}
            {sees && rows?.length === 0 ? (
              <Rise delay={150} style={{ marginTop: 16, backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, gap: 6 }}>
                <Body weight="bold">L’excellence intimide.</Body>
                <Body secondary size={15}>
                  Les likes reçus s’afficheront ici. Un profil complet aide : trois réponses, quelques livres.
                </Body>
              </Rise>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => {
          const path = item.photo_paths?.[0];
          const liked = parseLikedItem(item.liked_item);
          const what = liked.kind === 'answer' ? 'a aimé votre réponse' : liked.kind === 'photo' ? 'a aimé votre photo' : 'vous a liké';
          const where = describe(item);
          return (
            <Rise delay={80 + index * 90}>
              <View testID={`liker-${item.id}`} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, padding: 16, gap: 12 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.display_name} ${what}. Ouvrir son profil`}
                  onPress={() => router.push({ pathname: '/profile/[userId]', params: { userId: item.id, from: 'likers' } })}
                >
                  {({ pressed }) => (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 }}>
                      <Avatar path={path} url={path ? urls[path] : ''} name={item.display_name} size={52} />
                      <View style={{ flex: 1 }}>
                        <Body weight="bold" numberOfLines={1}>
                          {item.display_name}
                          {item.age != null ? `, ${item.age}` : ''}
                        </Body>
                        <Small numberOfLines={1}>{where ? `${what} · ${where}` : what}</Small>
                      </View>
                      {liked.kind === 'photo' && item.liked_photo_path ? (
                        <Photo path={item.liked_photo_path} url={urls[item.liked_photo_path]} name="Vous" initialSize={20} accessibilityLabel="Votre photo aimée" style={{ width: 56, height: 72, borderRadius: 12 }} />
                      ) : null}
                    </View>
                  )}
                </Pressable>
                {liked.kind === 'answer' && item.liked_text ? (
                  <View style={{ backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, gap: 4 }}>
                    {item.liked_prompt_key ? (
                      <Small size={12.5} weight="semibold">
                        {promptText(t, item.liked_prompt_key)}
                      </Small>
                    ) : null}
                    <Body weight="bold" size={15}>
                      {item.liked_text}
                    </Body>
                  </View>
                ) : null}
                {item.comment ? (
                  <View style={{ alignSelf: 'flex-start', maxWidth: '88%', backgroundColor: colors.accent, borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 10 }}>
                    <Body size={15} color="#FFFFFF" style={{ lineHeight: 21 }}>
                      {item.comment}
                    </Body>
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                  <IconButton label={`Passer ${item.display_name}`} variant="floating" size={48} onPress={() => answer(item, 'pass')} testID={`liker-pass-${item.id}`}>
                    <CrossIcon size={20} color={colors.text} stroke={2.4} />
                  </IconButton>
                  <IconButton label={`Liker ${item.display_name} en retour`} variant="accent" size={48} onPress={() => answer(item, 'like')} testID={`liker-like-${item.id}`}>
                    <HeartIcon size={20} color="#FFFFFF" filled />
                  </IconButton>
                </View>
              </View>
            </Rise>
          );
        }}
      />
    </View>
  );
}

/** Silhouette de carte floutée : aucune donnée réelle derrière, seulement l'idée d'une liste. */
function Ghost({ i }: { i: number }) {
  return (
    <View
      style={[
        { borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, padding: 16, gap: 12, opacity: 0.75 },
        Platform.OS === 'web' ? ({ filter: 'blur(6px)' } as object) : null,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: ['#D8D2C8', '#CFD8D2', '#D3CCD8'][i % 3] }} />
        <View style={{ gap: 6 }}>
          <View style={{ width: 110, height: 14, borderRadius: 7, backgroundColor: colors.line }} />
          <View style={{ width: 160, height: 10, borderRadius: 5, backgroundColor: colors.surface }} />
        </View>
      </View>
      <View style={{ height: 44, borderRadius: 16, backgroundColor: colors.surface }} />
    </View>
  );
}

/** Palier sans accès aux likers : le nombre de likes reçus, jamais qui, et quoi faire. */
function Teaser({ count, text }: { count: number; text: string }) {
  return (
    <View style={{ marginTop: 12 }} testID="likes-teaser">
      <View style={{ gap: 12 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[0, 1, 2].map((i) => (
          <Ghost key={i} i={i} />
        ))}
      </View>
      <PopIn delay={150} overshoot={1.04} style={{ position: 'absolute', top: 70, left: 8, right: 8 }}>
        <View style={{ borderRadius: 28, padding: 24, alignItems: 'center', gap: 10, backgroundColor: colors.bg, boxShadow: shadow.card }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
            <HeartIcon size={26} color="#FFFFFF" filled />
          </View>
          <Body weight="extrabold" size={20} align="center" testID="likes-count">
            {count ? people(count) : 'Pas encore de like'}
          </Body>
          <Body secondary size={15} align="center">
            {count ? text : 'Un profil complet aide : trois réponses, quelques livres, une phrase sur votre thèse.'}
          </Body>
          {count ? (
            <Button label="Aller à la découverte" onPress={() => goToTab('/feed')} style={{ alignSelf: 'stretch', marginTop: 6 }} />
          ) : (
            <Button label="Compléter mon profil" onPress={() => goToTab('/account')} style={{ alignSelf: 'stretch', marginTop: 6 }} />
          )}
          <Small align="center">Voir qui vous a liké est réservé à l’accès illimité.</Small>
        </View>
      </PopIn>
    </View>
  );
}
