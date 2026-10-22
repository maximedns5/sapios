import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Button, IconButton } from '@/components/Button';
import { EndOfSelection, FeedSkeleton, LoadError } from '@/components/FeedStates';
import { CrossIcon, DotsIcon, VerifiedBadge } from '@/components/Icons';
import { haptic, MaskUp, Rise } from '@/components/motion';
import { useOverlay } from '@/components/Overlay';
import { ProfileBody } from '@/components/ProfileBody';
import { Body, Small, Title } from '@/components/Text';
import { Wordmark } from '@/components/Wordmark';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { describe, onCandidateDropped, rememberCandidates } from '@/lib/candidates';
import { useCopy } from '@/lib/copy';
import { AppError, errorCode, errorMessage } from '@/lib/errors';
import { noteOwnMatch } from '@/lib/inbox';
import { blockUser, openReport } from '@/lib/safety';
import { colors, ease, radius, space } from '@/lib/theme';
import type { Candidate } from '@/lib/types';
import { useKeyboardShortcuts } from '@/lib/web';

type Direction = 'like' | 'pass';
type LoadFailure = { network: boolean; message: string };

/**
 * Découverte, à la Hinge : un profil complet à la fois, photos d'abord. Le cœur sur une photo aime le
 * profil, la croix flottante le passe ; la carte s'en va du côté choisi, la suivante monte.
 */
export default function Feed() {
  const { state, refresh } = useApp();
  const { t } = useCopy();
  const overlay = useOverlay();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const reduced = useReducedMotion();
  const [queue, setQueue] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [likesLeft, setLikesLeft] = useState<number | null>(state?.likes_left_today ?? null);
  const seenIds = useRef(new Set<string>());
  const fetching = useRef(false);
  const busy = useRef(false);
  const unlimited = state?.daily_like_quota == null;
  const paused = state?.profile_status === 'paused';
  const out = useSharedValue(0);
  const side = useSharedValue(1);

  useEffect(() => {
    setLikesLeft(state?.likes_left_today ?? null);
  }, [state?.likes_left_today]);

  const load = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const rows = await api.feed(20);
      rememberCandidates(rows);
      setFailure(null);
      setQueue((q) => {
        const known = new Set(q.map((c) => c.id));
        return [...q, ...rows.filter((r) => !known.has(r.id) && !seenIds.current.has(r.id))];
      });
    } catch (e) {
      setFailure({ network: errorCode(e) === 'network', message: errorMessage(e) });
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(
    () =>
      onCandidateDropped((id) => {
        seenIds.current.add(id);
        setQueue((q) => q.filter((c) => c.id !== id));
      }),
    [],
  );

  // Fin de pause (ou accès retrouvé) : la file chargée pendant la pause était vide, on la recharge.
  const canSee = !!state?.can_browse && !paused;
  useEffect(() => {
    if (!canSee) return;
    setLoading(true);
    load();
  }, [canSee, load]);

  const current = queue[0];
  // Nouvelle carte affichée : l'animation de sortie repart de zéro (après le rendu, sans clignotement).
  useEffect(() => {
    out.value = 0;
    busy.current = false;
  }, [current?.id, out]);
  const locked = !unlimited && (likesLeft ?? 0) <= 0;

  const showQuota = useCallback(() => overlay.toast(errorMessage(new AppError('quota_exceeded'))), [overlay]);

  const commit = useCallback(
    async (card: Candidate, direction: Direction) => {
      seenIds.current.add(card.id);
      setQueue((q) => q.filter((c) => c.id !== card.id));
      if (queue.length <= 4) load();
      try {
        const res = await api.swipe(card.id, direction);
        if (direction === 'like' && !unlimited) setLikesLeft((n) => Math.max(0, (n ?? 1) - 1));
        if (res.matched && res.match_id) {
          noteOwnMatch(res.match_id);
          router.push({ pathname: '/match/[matchId]', params: { matchId: res.match_id, name: card.display_name, photo: card.photo_paths?.[0] ?? '' } });
        } else if (direction === 'like') {
          overlay.toast(`Like envoyé à ${card.display_name}`, { icon: 'heart' });
        }
      } catch (e) {
        const code = errorCode(e);
        if (code === 'quota_exceeded') {
          seenIds.current.delete(card.id);
          setQueue((q) => [card, ...q]);
          setLikesLeft(0);
          showQuota();
        } else if (code === 'not_eligible') {
          refresh();
        } else if (code !== 'target_unavailable') {
          overlay.toast(errorMessage(e));
        }
      }
    },
    [load, overlay, queue.length, refresh, showQuota, unlimited],
  );

  const decide = useCallback(
    (direction: Direction) => {
      const card = queue[0];
      if (!card || busy.current) return;
      if (direction === 'like' && locked) {
        showQuota();
        return;
      }
      busy.current = true;
      if (direction === 'pass') haptic.selection();
      side.value = direction === 'like' ? 1 : -1;
      if (reduced) {
        commit(card, direction);
        return;
      }
      out.value = withTiming(1, { duration: 280, easing: ease.in }, (done) => {
        if (done) scheduleOnRN(commit, card, direction);
      });
    },
    [commit, locked, out, queue, reduced, showQuota, side],
  );

  const leaving = useAnimatedStyle(() => ({
    opacity: 1 - out.value,
    transform: [{ translateX: side.value * out.value * 120 }, { rotate: `${side.value * out.value * 4}deg` }, { scale: 1 - out.value * 0.04 }],
  }));

  // Clavier : ← passer, → aimer (onglet affiché, aucune saisie en cours).
  const shortcuts = useMemo(() => ({ ArrowLeft: () => decide('pass'), ArrowRight: () => decide('like') }), [decide]);
  useKeyboardShortcuts(shortcuts, isFocused && !!current && !paused && !loading);

  const more = (c: Candidate) =>
    overlay.sheet(c.display_name, [
      { label: 'Voir la fiche', testID: 'feed-open', onPress: () => router.push({ pathname: '/profile/[userId]', params: { userId: c.id, from: 'feed' } }) },
      { label: 'Signaler', testID: 'feed-report', onPress: () => openReport(c.id, c.display_name) },
      { label: 'Bloquer', testID: 'feed-block', destructive: true, onPress: () => blockUser(overlay, c.id, c.display_name, '/feed') },
    ]);

  const meta = current ? [current.age != null ? `${current.age} ans` : null, describe(current) || null].filter(Boolean).join(' · ') : '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="feed">
      <View style={{ height: 56, paddingLeft: space.gutter, paddingRight: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Wordmark size={30} />
        <View testID="likes-left" accessibilityLiveRegion="polite" style={{ backgroundColor: locked ? colors.line : colors.surface, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 }}>
          <Small weight="bold" size={13} color={locked ? colors.muted : colors.text}>
            {unlimited ? 'Likes illimités' : `${likesLeft ?? 0} like${(likesLeft ?? 0) > 1 ? 's' : ''} aujourd’hui`}
          </Small>
        </View>
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
          <FeedSkeleton />
        </View>
      ) : paused ? (
        <PausedState />
      ) : current ? (
        <>
          <Animated.View style={[{ flex: 1 }, leaving]}>
            <ScrollView key={current.id} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 110 }}>
              <Rise duration={500} distance={28}>
                <ProfileBody
                  candidate={current}
                  like={{ onLike: () => decide('like'), locked, onLocked: showQuota }}
                  header={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Title testID="card-name" size={30} numberOfLines={1} style={{ flexShrink: 1 }}>
                            {current.display_name}
                          </Title>
                          <VerifiedBadge />
                        </View>
                        {meta ? <Body muted size={15}>{meta}</Body> : null}
                      </View>
                      <IconButton label={`Plus d’options pour ${current.display_name}`} onPress={() => more(current)} testID="feed-more">
                        <DotsIcon size={20} />
                      </IconButton>
                    </View>
                  }
                />
              </Rise>
            </ScrollView>
          </Animated.View>
          <View style={{ position: 'absolute', left: 20, bottom: 20 }}>
            <IconButton testID="pass" label="Passer" accessibilityHint="Raccourci clavier : flèche gauche" variant="floating" size={60} onPress={() => decide('pass')}>
              <CrossIcon size={24} stroke={2.4} color={colors.text} />
            </IconButton>
          </View>
        </>
      ) : failure ? (
        <View style={{ paddingHorizontal: space.gutter }}>
          <LoadError
            network={failure.network}
            message={failure.message}
            onRetry={() => {
              setFailure(null);
              return load();
            }}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.xl }}>
          <EndOfSelection
            text={t('feed.empty')}
            seesLikers={!!state?.sees_likers}
            onRefresh={() => {
              setLoading(true);
              load();
            }}
          />
        </ScrollView>
      )}
    </View>
  );
}

function PausedState() {
  const { refresh } = useApp();
  const { toast } = useOverlay();
  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: 12, paddingHorizontal: space.gutter }} testID="feed-paused">
      <MaskUp>
        <Title size={30}>Vous faites une pause.</Title>
      </MaskUp>
      <Rise delay={150}>
        <Body secondary>Votre profil n’apparaît plus dans la découverte et vous ne voyez personne. Vos conversations restent ouvertes.</Body>
      </Rise>
      <Rise delay={250}>
        <Button
          label="Reprendre"
          onPress={async () => {
            try {
              await api.setPaused(false);
              await refresh();
            } catch (e) {
              toast(errorMessage(e));
            }
          }}
        />
      </Rise>
    </View>
  );
}
