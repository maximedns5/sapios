import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/Button';
import { CrossIcon, HeartIcon, LockIcon } from '@/components/Icons';
import { haptic, MaskUp, PopIn, Rise, Spinner } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { Avatar, useSignedUrls } from '@/components/Photo';
import { Body, Small, Title } from '@/components/Text';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { describe, rememberCandidates } from '@/lib/candidates';
import { errorMessage } from '@/lib/errors';
import { noteOwnMatch } from '@/lib/inbox';
import { goToTab } from '@/lib/nav';
import { colors, radius, shadow, space } from '@/lib/theme';
import type { Candidate } from '@/lib/types';

/**
 * Likes reçus (get_likers, réservé aux paliers qui voient leurs likers). Répondre d'un cœur fait le
 * match ; la croix passe. Les autres paliers voient une explication, sans chiffre inventé.
 */
export default function Likes() {
  const { state } = useApp();
  const overlay = useOverlay();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urls = useSignedUrls((rows ?? []).map((r) => r.photo_paths?.[0]).filter((p): p is string => !!p));
  const sees = !!state?.sees_likers;

  useFocusEffect(
    useCallback(() => {
      if (!sees) return;
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

  const answer = async (c: Candidate, direction: 'like' | 'pass') => {
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

  const count = rows?.length ?? 0;

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
                {count ? `${count} personne${count > 1 ? 's' : ''} vous ${count > 1 ? 'ont' : 'a'} liké` : 'Personne pour l’instant'}
              </Body>
            ) : null}
            {sees && rows === null && !error ? (
              <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                <Spinner />
              </View>
            ) : null}
            {error ? <Notice kind="error" message={error} style={{ marginTop: 10 }} /> : null}
            {!sees ? <Locked /> : null}
            {sees && rows?.length === 0 ? (
              <Rise delay={150} style={{ marginTop: 16, backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, gap: 6 }}>
                <Body weight="bold">L’excellence intimide.</Body>
                <Body secondary size={15}>
                  Les likes reçus s’afficheront ici. Un profil complet aide : une bio, quelques photos de plus.
                </Body>
              </Rise>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => {
          const path = item.photo_paths?.[0];
          const where = describe(item);
          return (
            <Rise delay={80 + index * 90}>
              <Pressable
                testID={`liker-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${item.display_name} vous a liké. Ouvrir son profil`}
                onPress={() => router.push({ pathname: '/profile/[userId]', params: { userId: item.id, from: 'likers' } })}
              >
                {({ pressed }) => (
                  <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pressed ? colors.surfaceSoft : colors.bg }}>
                    <Avatar path={path} url={path ? urls[path] : ''} name={item.display_name} size={56} />
                    <View style={{ flex: 1 }}>
                      <Body weight="bold" numberOfLines={1}>
                        {item.display_name}
                        {item.age != null ? `, ${item.age}` : ''}
                      </Body>
                      <Small numberOfLines={2}>{where ? `vous a liké · ${where}` : 'vous a liké'}</Small>
                    </View>
                    <IconButton label={`Passer ${item.display_name}`} variant="floating" size={48} onPress={() => answer(item, 'pass')} testID={`liker-pass-${item.id}`}>
                      <CrossIcon size={20} color={colors.text} stroke={2.4} />
                    </IconButton>
                    <IconButton label={`Liker ${item.display_name} en retour`} variant="accent" size={48} onPress={() => answer(item, 'like')} testID={`liker-like-${item.id}`}>
                      <HeartIcon size={20} color="#FFFFFF" filled />
                    </IconButton>
                  </View>
                )}
              </Pressable>
            </Rise>
          );
        }}
      />
    </View>
  );
}

/** Palier sans accès aux likers : ce qu'il en est, et ce qu'on peut faire. */
function Locked() {
  return (
    <PopIn delay={150} overshoot={1.04} style={{ marginTop: 18 }}>
      <View style={{ borderRadius: 28, padding: 24, alignItems: 'center', gap: 10, backgroundColor: colors.bg, boxShadow: shadow.card }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
          <LockIcon size={24} color="#FFFFFF" stroke={2.2} />
        </View>
        <Body weight="extrabold" size={20} align="center">
          Qui vous a liké ?
        </Body>
        <Body secondary size={15} align="center">
          Voir les likes reçus est réservé à l’accès illimité. Un like réciproque crée un match : continuez la découverte.
        </Body>
        <Button label="Aller à la découverte" onPress={() => goToTab('/feed')} style={{ alignSelf: 'stretch', marginTop: 6 }} />
      </View>
    </PopIn>
  );
}
