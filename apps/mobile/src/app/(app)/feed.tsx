import type { DiscoveryCounts, EventNotice, EventSummary, InactivityNotice, ProfileView } from '@sapios/shared';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Button, IconButton } from '@/components/Button';
import { EventBanner, EventNoticeCard } from '@/components/Events';
import { InactivityNoticeCard } from '@/components/InactivityNoticeCard';
import { EndOfSelection, FeedSkeleton, LoadError } from '@/components/FeedStates';
import { CrossIcon, DotsIcon, SlidersIcon, VerifiedBadge } from '@/components/Icons';
import { haptic, MaskUp, Rise } from '@/components/motion';
import { useOverlay } from '@/components/Overlay';
import { ProfileBody, profileFromCandidate, profileFromView, type LikeTarget } from '@/components/ProfileBody';
import { ReplySheet } from '@/components/ReplySheet';
import { Body, Small, Title } from '@/components/Text';
import { Wordmark } from '@/components/Wordmark';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { describe, onCandidateDropped, onFeedReset, rememberCandidates } from '@/lib/candidates';
import { useCopy } from '@/lib/copy';
import { AppError, errorCode, errorMessage } from '@/lib/errors';
import { dismissedEvents, dismissEvent, nextOpenEvent } from '@/lib/events';
import { noteOwnMatch } from '@/lib/inbox';
import { blockUser, openReport } from '@/lib/safety';
import { colors, ease, radius, space } from '@/lib/theme';
import type { Candidate } from '@/lib/types';
import { useKeyboardShortcuts } from '@/lib/web';

type Direction = 'like' | 'pass';
type LoadFailure = { network: boolean; message: string };
type Like = { target: LikeTarget | null; comment?: string };

/**
 * Découverte, à la Hinge : un profil complet à la fois, photos d'abord. Un cœur sur une photo ou une
 * réponse aime cet élément, « Répondre » y joint un mot ; la croix passe. La carte s'en va du côté
 * choisi, la suivante monte. La fiche complète (get_profile) enrichit la carte dès qu'elle arrive.
 */
/**
 * Bandeau d'événement en tête de la découverte (lot 2) : d'abord un avis (place libérée, annulation),
 * sinon le prochain événement ouvert, masquable. Rien si aucun des deux.
 */
function EventSlot() {
  const { state, userId, refresh } = useApp();
  const [next, setNext] = useState<EventSummary | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!userId || !state?.can_browse) return;
      let active = true;
      Promise.all([api.events(), dismissedEvents(userId)])
        .then(([list, dismissed]) => active && setNext(nextOpenEvent(list, dismissed)))
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [state?.can_browse, userId]),
  );
  const inactivity = (state?.notices ?? []).find((n): n is InactivityNotice => n.kind === 'inactivity_warning');
  if (inactivity)
    return (
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <InactivityNoticeCard notice={inactivity} onAck={() => api.ackNotice(inactivity.id).then(() => refresh()).catch(() => {})} />
      </View>
    );
  const notice = (state?.notices ?? []).find((n): n is EventNotice => n.kind === 'event_promoted' || n.kind === 'event_cancelled');
  if (notice)
    return (
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <EventNoticeCard notice={notice} onAck={() => api.ackNotice(notice.id).then(() => refresh()).catch(() => {})} />
      </View>
    );
  if (!next) return null;
  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
      <EventBanner
        e={next}
        onDismiss={() => {
          if (userId) dismissEvent(userId, next.id);
          setNext(null);
        }}
      />
    </View>
  );
}

export default function Feed() {
  const { state, refresh } = useApp();
  const { t } = useCopy();
  const overlay = useOverlay();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const reduced = useReducedMotion();
  const [queue, setQueue] = useState<Candidate[]>([]);
  const [views, setViews] = useState<Record<string, ProfileView>>({});
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [counts, setCounts] = useState<DiscoveryCounts | null>(null);
  const [likesLeft, setLikesLeft] = useState<number | null>(state?.likes_left_today ?? null);
  const [reply, setReply] = useState<LikeTarget | null>(null);
  const seenIds = useRef(new Set<string>());
  const asked = useRef(new Set<string>());
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
      if (!rows.length) api.countDiscovery().then(setCounts).catch(() => setCounts(null));
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

  // Critères modifiés : la file chargée ne correspond plus, on repart de zéro.
  useEffect(
    () =>
      onFeedReset(() => {
        setQueue([]);
        setCounts(null);
        setLoading(true);
        load();
      }),
    [load],
  );

  // Fin de pause (ou accès retrouvé) : la file chargée pendant la pause était vide, on la recharge.
  const canSee = !!state?.can_browse && !paused;
  useEffect(() => {
    if (!canSee) return;
    setLoading(true);
    load();
  }, [canSee, load]);

  const current = queue[0];
  const nextId = queue[1]?.id;

  // Fiche complète de la carte affichée et de la suivante : identifiants des photos (likes ciblés),
  // toutes les réponses, livres, thèse visible.
  useEffect(() => {
    for (const id of [current?.id, nextId]) {
      if (!id || asked.current.has(id)) continue;
      asked.current.add(id);
      api
        .profile(id)
        .then((view) => setViews((v) => ({ ...v, [id]: view })))
        .catch(() => asked.current.delete(id));
    }
  }, [current?.id, nextId]);

  // Nouvelle carte affichée : l'animation de sortie repart de zéro (après le rendu, sans clignotement).
  useEffect(() => {
    out.value = 0;
    busy.current = false;
  }, [current?.id, out]);
  const locked = !unlimited && (likesLeft ?? 0) <= 0;

  const showQuota = useCallback(() => overlay.toast(errorMessage(new AppError('quota_exceeded'))), [overlay]);

  const commit = useCallback(
    async (card: Candidate, direction: Direction, like?: Like) => {
      seenIds.current.add(card.id);
      setQueue((q) => q.filter((c) => c.id !== card.id));
      if (queue.length <= 4) load();
      const putBack = () => {
        seenIds.current.delete(card.id);
        setQueue((q) => [card, ...q.filter((c) => c.id !== card.id)]);
      };
      try {
        const res = await api.swipe(card.id, direction, like?.target?.item ?? null, like?.comment ?? null);
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
          putBack();
          setLikesLeft(0);
          showQuota();
        } else if (code === 'invalid_item' || code === 'comment_too_long' || code === 'invalid_input') {
          // L'élément a disparu (photo retirée, réponse modifiée) : la carte revient, fiche relue.
          putBack();
          asked.current.delete(card.id);
          setViews((v) => {
            const next = { ...v };
            delete next[card.id];
            return next;
          });
          overlay.toast(errorMessage(e));
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
    (direction: Direction, like?: Like) => {
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
        commit(card, direction, like);
        return;
      }
      out.value = withTiming(1, { duration: 280, easing: ease.in }, (done) => {
        if (done) scheduleOnRN(commit, card, direction, like);
      });
    },
    [commit, locked, out, queue, reduced, showQuota, side],
  );

  const leaving = useAnimatedStyle(() => ({
    opacity: 1 - out.value,
    transform: [{ translateX: side.value * out.value * 120 }, { rotate: `${side.value * out.value * 4}deg` }, { scale: 1 - out.value * 0.04 }],
  }));

  // Clavier : ← passer, → aimer tout le profil (onglet affiché, aucune saisie ni feuille ouverte).
  const shortcuts = useMemo(() => ({ ArrowLeft: () => decide('pass'), ArrowRight: () => decide('like') }), [decide]);
  useKeyboardShortcuts(shortcuts, isFocused && !!current && !paused && !loading && !reply);

  const more = (c: Candidate) =>
    overlay.sheet(c.display_name, [
      { label: 'Voir la fiche', testID: 'feed-open', onPress: () => router.push({ pathname: '/profile/[userId]', params: { userId: c.id, from: 'feed' } }) },
      { label: 'Signaler', testID: 'feed-report', onPress: () => openReport(c.id, c.display_name) },
      { label: 'Bloquer', testID: 'feed-block', destructive: true, onPress: () => blockUser(overlay, c.id, c.display_name, '/feed') },
    ]);

  const data = current ? (views[current.id] ? profileFromView(views[current.id], current) : profileFromCandidate(current)) : null;
  const meta = data ? [data.age != null ? `${data.age} ans` : null, describe(data) || null].filter(Boolean).join(' · ') : '';
  const tooStrict = !!counts && counts.matching === 0 && counts.total > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="feed">
      <View style={{ height: 56, paddingLeft: space.gutter, paddingRight: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Wordmark size={30} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View testID="likes-left" accessibilityLiveRegion="polite" style={{ backgroundColor: locked ? colors.line : colors.surface, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 }}>
            <Small weight="bold" size={13} color={locked ? colors.muted : colors.text}>
              {unlimited ? 'Likes illimités' : `${likesLeft ?? 0} like${(likesLeft ?? 0) > 1 ? 's' : ''} aujourd’hui`}
            </Small>
          </View>
          <IconButton testID="open-criteria" label="Critères de découverte" onPress={() => router.push('/criteria')}>
            <SlidersIcon size={20} />
          </IconButton>
        </View>
      </View>

      {!paused ? <EventSlot /> : null}

      {loading ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
          <FeedSkeleton />
        </View>
      ) : paused ? (
        <PausedState />
      ) : current && data ? (
        <>
          <Animated.View style={[{ flex: 1 }, leaving]}>
            <ScrollView key={current.id} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 24 }}>
              <Rise duration={500} distance={28}>
                <ProfileBody
                  data={data}
                  onReport={(target) => openReport(current.id, current.display_name, undefined, target)}
                  like={{
                    onLike: (target) => decide('like', { target }),
                    onReply: (target) => setReply(target),
                    locked,
                    onLocked: showQuota,
                  }}
                  header={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Title testID="card-name" size={30} numberOfLines={1} style={{ flexShrink: 1 }}>
                            {data.display_name}
                          </Title>
                          <VerifiedBadge />
                        </View>
                        {meta ? <Body muted size={15}>{meta}</Body> : null}
                      </View>
                      <IconButton label={`Plus d’options pour ${data.display_name}`} onPress={() => more(current)} testID="feed-more">
                        <DotsIcon size={20} />
                      </IconButton>
                    </View>
                  }
                />
              </Rise>
            </ScrollView>
          </Animated.View>
          {/* Barre d'action sous le profil (et non par-dessus) : la croix ne cache jamais un texte. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.bg }}>
            <IconButton testID="pass" label={`Passer ${data.display_name}`} accessibilityHint="Raccourci clavier : flèche gauche" variant="floating" size={56} onPress={() => decide('pass')}>
              <CrossIcon size={22} stroke={2.4} color={colors.text} />
            </IconButton>
            <Small style={{ flex: 1 }}>Aimez une photo ou une réponse, ou passez.</Small>
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
            text={tooStrict ? t('feed.empty_filters') : t('feed.empty')}
            tooStrict={tooStrict}
            seesLikers={!!state?.sees_likers}
            onRefresh={() => {
              setLoading(true);
              load();
            }}
          />
        </ScrollView>
      )}

      {reply && current ? (
        <ReplySheet
          name={current.display_name}
          target={reply}
          onClose={() => setReply(null)}
          onSend={(comment) => {
            const target = reply;
            setReply(null);
            setTimeout(() => decide('like', { target, comment }), 120);
          }}
        />
      ) : null}
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
