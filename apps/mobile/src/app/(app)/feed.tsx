import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { HeartIcon, CrossIcon } from '@/components/Icons';
import { tapFeedback } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { RevealLines } from '@/components/Reveal';
import { NextCard, SwipeCard, type Direction, type SwipeCardHandle } from '@/components/SwipeDeck';
import { Body, Em, Label, Title } from '@/components/Text';
import { ToneProvider, useTone } from '@/components/Tone';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { onCandidateDropped, rememberCandidates } from '@/lib/candidates';
import { useCopy } from '@/lib/copy';
import { AppError, errorCode, errorMessage } from '@/lib/errors';
import { PAPER, space } from '@/lib/theme';
import type { Candidate } from '@/lib/types';

function ActionButton({ kind, onPress, disabled }: { kind: Direction; onPress: () => void; disabled?: boolean }) {
  const { fg, bg } = useTone();
  const solid = kind === 'like';
  return (
    <Pressable
      testID={kind === 'like' ? 'like' : 'pass'}
      accessibilityRole="button"
      accessibilityLabel={kind === 'like' ? 'J’aime' : 'Passer'}
      disabled={disabled}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={{ flex: 1 }}
    >
      {({ pressed }) => {
        const filled = solid ? !pressed : pressed;
        const ink = filled ? bg : fg;
        return (
          <View
            style={{
              height: 58,
              borderWidth: 1.5,
              borderColor: fg,
              backgroundColor: filled ? fg : bg,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              opacity: disabled ? 0.35 : 1,
            }}
          >
            {kind === 'like' ? <HeartIcon color={ink} size={20} filled={!filled} /> : <CrossIcon color={ink} size={18} />}
            <Label color={ink} size={12}>
              {kind === 'like' ? 'J’aime' : 'Passer'}
            </Label>
          </View>
        );
      }}
    </Pressable>
  );
}

/** Découverte : une carte à la fois, glisser ou boutons, quota de likes du jour. */
export default function Feed() {
  const { state, refresh } = useApp();
  const { t } = useCopy();
  const { toast } = useOverlay();
  const insets = useSafeAreaInsets();
  const [queue, setQueue] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [likesLeft, setLikesLeft] = useState<number | null>(state?.likes_left_today ?? null);
  const [quotaHit, setQuotaHit] = useState(false);
  const seenIds = useRef(new Set<string>());
  const fetching = useRef(false);
  const top = useRef<SwipeCardHandle>(null);
  const unlimited = state?.daily_like_quota == null;
  const paused = state?.profile_status === 'paused';

  useEffect(() => {
    setLikesLeft(state?.likes_left_today ?? null);
    if ((state?.likes_left_today ?? 1) > 0) setQuotaHit(false);
  }, [state?.likes_left_today]);

  const load = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    setError(null);
    try {
      const rows = await api.feed(20);
      rememberCandidates(rows);
      setQueue((q) => {
        const known = new Set(q.map((c) => c.id));
        return [...q, ...rows.filter((r) => !known.has(r.id) && !seenIds.current.has(r.id))];
      });
    } catch (e) {
      setError(errorMessage(e));
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

  const decide = useCallback(
    async (direction: Direction) => {
      const card = queue[0];
      if (!card) return;
      if (direction === 'like' && !unlimited && (likesLeft ?? 0) <= 0) {
        setQuotaHit(true);
        return;
      }
      seenIds.current.add(card.id);
      setQueue((q) => q.filter((c) => c.id !== card.id));
      if (queue.length <= 4) load();
      try {
        const res = await api.swipe(card.id, direction);
        if (direction === 'like' && !unlimited) setLikesLeft((n) => Math.max(0, (n ?? 1) - 1));
        if (res.matched && res.match_id) {
          router.push({
            pathname: '/match/[matchId]',
            params: { matchId: res.match_id, name: card.display_name, photo: card.photo_paths?.[0] ?? '' },
          });
        }
      } catch (e) {
        const code = errorCode(e);
        if (code === 'quota_exceeded') {
          seenIds.current.delete(card.id);
          setQueue((q) => [card, ...q]);
          setLikesLeft(0);
          setQuotaHit(true);
        } else if (code === 'not_eligible') {
          refresh();
        } else if (code !== 'target_unavailable') {
          toast(errorMessage(e));
        }
      }
    },
    [likesLeft, load, queue, refresh, toast, unlimited],
  );

  const current = queue[0];
  const next = queue[1];
  const locked = !unlimited && (likesLeft ?? 0) <= 0;

  return (
    <ToneProvider tone="light">
      <View style={{ flex: 1, backgroundColor: PAPER, paddingTop: insets.top }} testID="feed">
        <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center', flex: 1 }}>
          <View style={{ height: 52, paddingHorizontal: space.gutter, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Label>Découverte</Label>
            <LikesBadge unlimited={unlimited} left={likesLeft} quota={state?.daily_like_quota ?? null} />
          </View>

          <View style={{ flex: 1, paddingHorizontal: space.gutter, paddingBottom: 12 }}>
            {loading ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color="#0B0B0B" />
              </View>
            ) : paused ? (
              <PausedState />
            ) : current ? (
              <View style={{ flex: 1 }}>
                {next ? <NextCard key={`next-${next.id}`} candidate={next} /> : null}
                <SwipeCard
                  key={current.id}
                  ref={top}
                  candidate={current}
                  likeLocked={locked}
                  onSwiped={decide}
                  onOpen={() => router.push({ pathname: '/profile/[userId]', params: { userId: current.id, from: 'feed' } })}
                />
              </View>
            ) : (
              <EmptyState text={error ?? t('feed.empty')} onRetry={() => { setLoading(true); load(); }} />
            )}
          </View>

          {current && !paused ? (
            <View style={{ paddingHorizontal: space.gutter, paddingBottom: 12, gap: 10 }}>
              {quotaHit || locked ? (
                <Notice testID="quota-notice" title="Quota atteint" message={errorMessage(new AppError('quota_exceeded'))} />
              ) : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <ActionButton kind="pass" onPress={() => top.current?.fling('pass')} />
                <ActionButton
                  kind="like"
                  disabled={locked}
                  onPress={() => (locked ? setQuotaHit(true) : top.current?.fling('like'))}
                />
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </ToneProvider>
  );
}

function LikesBadge({ unlimited, left, quota }: { unlimited: boolean; left: number | null; quota: number | null }) {
  const { fg, bg } = useTone();
  return (
    <View testID="likes-left" style={{ backgroundColor: fg, paddingHorizontal: 8, paddingVertical: 4 }}>
      <Label color={bg} size={10}>
        {unlimited ? 'Likes illimités' : `${left ?? 0} / ${quota ?? 0} likes aujourd’hui`}
      </Label>
    </View>
  );
}

function EmptyState({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: 18 }} testID="feed-empty">
      <Label>Fin de la sélection</Label>
      <RevealLines
        lines={[
          <Title key="a" size={48}>
            Plus personne
          </Title>,
          <Title key="b" size={48}>
            <Em>à la hauteur.</Em>
          </Title>,
        ]}
      />
      <Body>{text}</Body>
      <Button label="Actualiser" variant="outline" onPress={onRetry} />
    </View>
  );
}

function PausedState() {
  const { refresh } = useApp();
  const { toast } = useOverlay();
  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: 18 }} testID="feed-paused">
      <Label>Profil en pause</Label>
      <RevealLines
        lines={[
          <Title key="a" size={48}>
            Vous faites
          </Title>,
          <Title key="b" size={48}>
            <Em>une pause.</Em>
          </Title>,
        ]}
      />
      <Body>Votre profil n’apparaît plus dans la découverte et vous ne voyez personne. Vos conversations restent ouvertes.</Body>
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
    </View>
  );
}
