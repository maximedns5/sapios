import type { ProfileView as View_ } from '@sapios/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/Button';
import { CrossIcon, DotsIcon } from '@/components/Icons';
import { Rise, Spinner } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { ProfileBody, profileFromCandidate, profileFromView, type LikeTarget } from '@/components/ProfileBody';
import { ReplySheet } from '@/components/ReplySheet';
import { Header } from '@/components/Screen';
import { Small } from '@/components/Text';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { cachedCandidate, dropCandidate } from '@/lib/candidates';
import { AppError, errorCode, errorMessage } from '@/lib/errors';
import { noteOwnMatch } from '@/lib/inbox';
import { blockUser, openReport, unmatchUser } from '@/lib/safety';
import { colors } from '@/lib/theme';

/**
 * Fiche d'un membre (get_profile) : photos d'abord, réponses, bibliothèque, phrase de thèse si elle
 * est visible, et sécurité dans le menu « … ». Tant qu'on n'a ni aimé ni passé ce profil, chaque photo
 * et chaque réponse porte un cœur et « Répondre ». `from=self` : aperçu de son propre profil.
 */
export default function ProfileScreen() {
  const { userId, from, matchId } = useLocalSearchParams<{ userId: string; from?: string; matchId?: string }>();
  const { userId: me, state } = useApp();
  const overlay = useOverlay();
  const insets = useSafeAreaInsets();
  const cached = cachedCandidate(userId);
  const [view, setView] = useState<View_ | null>(null);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [reply, setReply] = useState<LikeTarget | null>(null);
  const self = from === 'self' || userId === me;

  useEffect(() => {
    let alive = true;
    api
      .profile(userId)
      .then((v) => alive && setView(v))
      .catch((e) => {
        if (!alive) return;
        if (errorCode(e) === 'not_found') setMissing(true);
        else setFailed(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const data = view ? profileFromView(view, cached) : cached ? profileFromCandidate(cached) : null;
  const name = data?.display_name ?? 'ce membre';
  const back = () => (router.canGoBack() ? router.back() : router.replace('/feed'));
  const after = matchId ? '/messages' : from === 'likers' ? '/likes' : '/feed';
  // Réponse possible : profil d'un autre, jamais aimé ni passé, pas encore de match, palier avec feed.
  const canAnswer = !self && !!view && !view.match_id && view.my_swipe == null && !!state?.can_browse;
  const locked = state?.daily_like_quota != null && (state?.likes_left_today ?? 0) <= 0;

  const swipe = async (direction: 'like' | 'pass', target?: LikeTarget | null, comment?: string) => {
    if (!data) return;
    try {
      const res = await api.swipe(data.id, direction, target?.item ?? null, comment ?? null);
      dropCandidate(data.id);
      if (res.matched && res.match_id) {
        noteOwnMatch(res.match_id);
        router.replace({ pathname: '/match/[matchId]', params: { matchId: res.match_id, name: data.display_name, photo: data.photos[0]?.path ?? '' } });
      } else {
        overlay.toast(direction === 'like' ? `Like envoyé à ${data.display_name}` : 'Profil passé.', direction === 'like' ? { icon: 'heart' } : undefined);
        back();
      }
    } catch (e) {
      overlay.toast(errorMessage(e));
    }
  };

  const menu = () => {
    if (!data) return;
    overlay.sheet(name, [
      { label: 'Signaler', testID: 'profile-report', onPress: () => openReport(data.id, data.display_name, matchId) },
      ...(matchId ? [{ label: 'Se dé-matcher', testID: 'profile-unmatch', onPress: () => unmatchUser(overlay, matchId, name) }] : []),
      { label: 'Bloquer', testID: 'profile-block', destructive: true, onPress: () => blockUser(overlay, data.id, name, after) },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="profile-view">
      <Header
        onBack={back}
        title={self ? 'Aperçu de mon profil' : undefined}
        right={
          data && !self ? (
            <IconButton label="Signaler, bloquer ou se dé-matcher" onPress={menu} testID="profile-menu">
              <DotsIcon size={20} />
            </IconButton>
          ) : null
        }
      />
      {missing ? (
        <View style={{ padding: 20 }}>
          <Notice title="Indisponible" message="Ce profil n’est plus visible." />
        </View>
      ) : !data ? (
        <View style={{ paddingTop: 60, paddingHorizontal: 20, alignItems: 'center' }}>
          {failed ? <Notice kind="error" message={failed} /> : <Spinner />}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}>
          <Rise>
            <ProfileBody
              data={data}
              onReport={self ? undefined : (target) => openReport(data.id, data.display_name, matchId, target)}
              like={
                canAnswer
                  ? {
                      onLike: (target) => swipe('like', target),
                      onReply: setReply,
                      locked,
                      onLocked: () => overlay.toast(errorMessage(new AppError('quota_exceeded'))),
                    }
                  : undefined
              }
            />
          </Rise>
        </ScrollView>
      )}
      {canAnswer ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.bg }}>
          <IconButton testID="profile-pass" label={`Passer ${name}`} variant="floating" size={56} onPress={() => swipe('pass')}>
            <CrossIcon size={22} stroke={2.4} color={colors.text} />
          </IconButton>
          <Small style={{ flex: 1 }}>Aimez une photo ou une réponse, ou passez.</Small>
        </View>
      ) : null}
      {reply && data ? (
        <ReplySheet
          name={data.display_name}
          target={reply}
          onClose={() => setReply(null)}
          onSend={(comment) => {
            const target = reply;
            setReply(null);
            return swipe('like', target, comment);
          }}
        />
      ) : null}
    </View>
  );
}
