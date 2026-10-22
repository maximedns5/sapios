import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/Button';
import { CrossIcon, DotsIcon } from '@/components/Icons';
import { Rise, Spinner } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { ProfileBody } from '@/components/ProfileBody';
import { Header } from '@/components/Screen';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { cachedCandidate } from '@/lib/candidates';
import { errorMessage } from '@/lib/errors';
import { noteOwnMatch } from '@/lib/inbox';
import { blockUser, openReport, unmatchUser } from '@/lib/safety';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { Candidate } from '@/lib/types';

/**
 * Fiche d'un membre : photos d'abord, bio, et sécurité dans le menu « … » (signaler, se dé-matcher,
 * bloquer). Depuis « Likes », cœur et croix pour répondre. `from=self` : aperçu de son propre profil.
 */
export default function ProfileView() {
  const { userId, from, matchId } = useLocalSearchParams<{ userId: string; from?: string; matchId?: string }>();
  const { userId: me } = useApp();
  const overlay = useOverlay();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Candidate | null>(() => cachedCandidate(userId) ?? null);
  const [missing, setMissing] = useState(false);
  const self = from === 'self' || userId === me;

  useEffect(() => {
    if (profile) return;
    (async () => {
      const { data } = await supabase.from('profiles').select('id, display_name, bio, city').eq('id', userId).maybeSingle();
      if (!data) {
        setMissing(true);
        return;
      }
      const { data: photos } = await supabase.from('profile_photos').select('storage_path').eq('user_id', userId).order('position');
      setProfile({
        ...(data as { id: string; display_name: string; bio: string | null; city: string | null }),
        age: null,
        distance_km: null,
        photo_paths: (photos ?? []).map((p: { storage_path: string }) => p.storage_path),
      });
    })();
  }, [profile, userId]);

  const name = profile?.display_name ?? 'ce membre';
  const back = () => (router.canGoBack() ? router.back() : router.replace('/feed'));
  const after = matchId ? '/messages' : from === 'likers' ? '/likes' : '/feed';
  const answering = from === 'likers' && !!profile;

  const swipe = async (direction: 'like' | 'pass') => {
    if (!profile) return;
    try {
      const res = await api.swipe(profile.id, direction);
      if (res.matched && res.match_id) {
        noteOwnMatch(res.match_id);
        router.replace({ pathname: '/match/[matchId]', params: { matchId: res.match_id, name: profile.display_name, photo: profile.photo_paths?.[0] ?? '' } });
      } else {
        overlay.toast(direction === 'like' ? `Like envoyé à ${profile.display_name}` : 'Profil passé.', direction === 'like' ? { icon: 'heart' } : undefined);
        back();
      }
    } catch (e) {
      overlay.toast(errorMessage(e));
    }
  };

  const menu = () => {
    if (!profile) return;
    overlay.sheet(name, [
      { label: 'Signaler', testID: 'profile-report', onPress: () => openReport(profile.id, profile.display_name, matchId) },
      ...(matchId ? [{ label: 'Se dé-matcher', testID: 'profile-unmatch', onPress: () => unmatchUser(overlay, matchId, name) }] : []),
      { label: 'Bloquer', testID: 'profile-block', destructive: true, onPress: () => blockUser(overlay, profile.id, name, after) },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="profile-view">
      <Header
        onBack={back}
        title={self ? 'Aperçu de mon profil' : undefined}
        right={
          profile && !self ? (
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
      ) : !profile ? (
        <View style={{ paddingTop: 60, alignItems: 'center' }}>
          <Spinner />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + (answering ? 110 : 40) }}>
          <Rise>
            <ProfileBody candidate={profile} like={answering ? { onLike: () => swipe('like') } : undefined} />
          </Rise>
        </ScrollView>
      )}
      {answering ? (
        <View style={{ position: 'absolute', left: 20, bottom: insets.bottom + 24 }}>
          <IconButton testID="profile-pass" label="Passer" variant="floating" size={60} onPress={() => swipe('pass')}>
            <CrossIcon size={24} stroke={2.4} color={colors.text} />
          </IconButton>
        </View>
      ) : null}
    </View>
  );
}
