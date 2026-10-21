import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { Photo, useSignedUrls } from '@/components/Photo';
import { Reveal } from '@/components/Reveal';
import { Rule, TopBar } from '@/components/Screen';
import { Body, Em, Label, Title } from '@/components/Text';
import { ToneProvider } from '@/components/Tone';
import { api } from '@/lib/api';
import { cachedCandidate, describe } from '@/lib/candidates';
import { errorCode, errorMessage } from '@/lib/errors';
import { noteOwnMatch } from '@/lib/inbox';
import { useLayout } from '@/lib/layout';
import { blockUser, openReport, unmatchUser } from '@/lib/safety';
import { supabase } from '@/lib/supabase';
import { alpha, INK, PAPER, space } from '@/lib/theme';
import type { Candidate } from '@/lib/types';

/** Fiche d'un membre : photos, bio, et actions de sécurité (signaler, bloquer, se dé-matcher). */
export default function ProfileView() {
  const { userId, from, matchId } = useLocalSearchParams<{ userId: string; from?: string; matchId?: string }>();
  const overlay = useOverlay();
  const insets = useSafeAreaInsets();
  const { width, height, wide } = useLayout();
  const [profile, setProfile] = useState<Candidate | null>(() => cachedCandidate(userId) ?? null);
  const [missing, setMissing] = useState(false);
  const [index, setIndex] = useState(0);
  const paths = profile?.photo_paths ?? [];
  const urls = useSignedUrls(paths);
  // Grand écran : photo à gauche (hauteur bornée par la fenêtre), texte et actions à droite.
  const photoW = wide ? Math.min(440, (height - 140) / 1.2) : Math.min(width, 560) - space.gutter * 2 - 13;

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


  const swipe = async (direction: 'like' | 'pass') => {
    if (!profile) return;
    try {
      const res = await api.swipe(profile.id, direction);
      if (res.matched && res.match_id) {
        noteOwnMatch(res.match_id);
        router.replace({ pathname: '/match/[matchId]', params: { matchId: res.match_id, name: profile.display_name, photo: profile.photo_paths?.[0] ?? '' } });
      } else {
        overlay.toast(direction === 'like' ? 'Like envoyé.' : 'Profil passé.');
        back();
      }
    } catch (e) {
      overlay.toast(errorCode(e) === 'quota_exceeded' ? errorMessage(e) : errorMessage(e));
    }
  };

  const likerActions =
    profile && from === 'likers' ? (
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button testID="profile-pass" label="Passer" variant="outline" onPress={() => swipe('pass')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button testID="profile-like" label="J’aime" onPress={() => swipe('like')} />
        </View>
      </View>
    ) : null;

  return (
    <ToneProvider tone="light">
      <View style={{ flex: 1, backgroundColor: PAPER, paddingTop: insets.top + (wide ? 24 : 0) }} testID="profile-view">
        <View style={{ flex: 1, width: '100%', maxWidth: wide ? 1040 : 560, alignSelf: 'center' }}>
          <TopBar left={{ label: '← Retour', onPress: back }} right={matchId ? 'Match' : from === 'likers' ? 'Vous a liké' : 'Profil'} />
          {missing ? (
            <View style={{ padding: space.gutter }}>
              <Notice title="Indisponible" message="Ce profil n’est plus visible." />
            </View>
          ) : !profile ? (
            <ActivityIndicator color={INK} style={{ marginTop: 40 }} />
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + (wide ? 48 : 120) }}>
              <View style={wide ? { flexDirection: 'row', alignItems: 'flex-start', gap: 48, paddingHorizontal: space.gutter } : undefined}>
                <View style={{ marginHorizontal: wide ? 0 : space.gutter, borderWidth: 1.5, borderColor: INK, padding: 5 }}>
                  <View>
                    <Photo
                      path={paths[index]}
                      url={paths[index] ? urls[paths[index]] : ''}
                      name={profile.display_name}
                      style={{ width: photoW, height: photoW * 1.2 }}
                    />
                    {paths.length > 1 ? (
                      <>
                        <View style={{ position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', gap: 4 }}>
                          {paths.map((p, i) => (
                            <View key={p} style={{ flex: 1, height: 2, backgroundColor: i === index ? PAPER : alpha(PAPER, 0.35) }} />
                          ))}
                        </View>
                        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row' }}>
                          <Pressable accessibilityLabel="Photo précédente" style={{ flex: 1 }} onPress={() => setIndex((i) => Math.max(0, i - 1))} />
                          <Pressable accessibilityLabel="Photo suivante" style={{ flex: 1 }} onPress={() => setIndex((i) => Math.min(paths.length - 1, i + 1))} />
                        </View>
                      </>
                    ) : null}
                  </View>
                </View>
                <View style={{ paddingHorizontal: wide ? 0 : space.gutter, paddingTop: wide ? 8 : 18, gap: 8, flex: wide ? 1 : undefined }}>
                  <Reveal>
                    <Title size={46}>
                      {profile.display_name}
                      {profile.age != null ? <Em>, {profile.age}</Em> : null}
                    </Title>
                  </Reveal>
                  {describe(profile) ? <Label>{describe(profile)}</Label> : null}
                  {profile.bio ? <Body style={{ marginTop: 8 }}>{profile.bio}</Body> : null}
                  {wide && likerActions ? <View style={{ marginTop: 24 }}>{likerActions}</View> : null}

                  <View style={{ marginTop: 28 }}>
                    <Label style={{ opacity: 0.6, marginBottom: 10 }}>Sécurité</Label>
                    <Rule />
                    <SafetyRow testID="profile-report" label="Signaler" hint="Motif et détails, traité par la modération" onPress={() => openReport(profile.id, profile.display_name, matchId)} />
                    {matchId ? <SafetyRow testID="profile-unmatch" label="Se dé-matcher" hint="La conversation disparaît" onPress={() => unmatchUser(overlay, matchId, name)} /> : null}
                    <SafetyRow testID="profile-block" label="Bloquer" hint="Vous ne vous verrez plus" onPress={() => blockUser(overlay, profile.id, name, after)} />
                  </View>
                </View>
              </View>
            </ScrollView>
          )}
          {likerActions && !wide ? (
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.gutter, paddingTop: 12, paddingBottom: insets.bottom + 12, backgroundColor: PAPER, borderTopWidth: 1.5, borderColor: INK }}>
              {likerActions}
            </View>
          ) : null}
        </View>
      </View>
    </ToneProvider>
  );
}

function SafetyRow({ label, hint, onPress, testID }: { label: string; hint: string; onPress: () => void; testID?: string }) {
  return (
    <>
      <Pressable testID={testID} accessibilityRole="button" onPress={onPress}>
        {({ pressed, hovered }) => (
          <View style={{ paddingVertical: 14, paddingHorizontal: pressed || hovered ? 10 : 0, backgroundColor: pressed || hovered ? INK : PAPER, gap: 2 }}>
            <Title size={22} color={pressed || hovered ? PAPER : INK}>
              {label}
            </Title>
            <Label size={9.5} color={pressed || hovered ? PAPER : INK} style={{ opacity: 0.7 }}>
              {hint}
            </Label>
          </View>
        )}
      </Pressable>
      <Rule weight={1} />
    </>
  );
}
