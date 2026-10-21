import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Notice } from '@/components/Notice';
import { Photo, useSignedUrls } from '@/components/Photo';
import { RevealLines } from '@/components/Reveal';
import { Body, Em, Label, Title } from '@/components/Text';
import { ToneProvider } from '@/components/Tone';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { errorMessage } from '@/lib/errors';
import { formatShort } from '@/lib/format';
import { channelName, supabase } from '@/lib/supabase';
import { alpha, INK, PAPER, space } from '@/lib/theme';
import type { MatchRow } from '@/lib/types';

/** Liste des conversations (get_matches), rafraîchie en temps réel. */
export default function Messages() {
  const { userId } = useApp();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const urls = useSignedUrls((rows ?? []).map((r) => r.photo_path).filter((p): p is string => !!p));

  const load = useCallback(async () => {
    try {
      setRows(await api.matches());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(channelName(`inbox:${userId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, () => load())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, userId]);

  return (
    <ToneProvider tone="light">
      <View style={{ flex: 1, backgroundColor: PAPER, paddingTop: insets.top }} testID="messages">
        <FlatList
          data={rows ?? []}
          keyExtractor={(r) => r.match_id}
          style={{ width: '100%', maxWidth: 560, alignSelf: 'center' }}
          contentContainerStyle={{ paddingBottom: space.xl }}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={INK} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListHeaderComponent={
            <View style={{ gap: 14, paddingTop: 14, paddingBottom: 18, paddingHorizontal: space.gutter }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Label>Messages</Label>
                <Label>{rows ? `${rows.length} match${rows.length > 1 ? 's' : ''}` : ''}</Label>
              </View>
              <View>
                <RevealLines
                  lines={[
                    <Title key="a" size={44}>
                      Conversations
                    </Title>,
                    <Title key="b" size={44}>
                      <Em>éclairées.</Em>
                    </Title>,
                  ]}
                />
              </View>
              {error ? <Notice title="Erreur" message={error} /> : null}
              {rows === null && !error ? <ActivityIndicator color={INK} /> : null}
              {rows?.length === 0 ? <Body>Aucun match pour l’instant. Personne n’est à la hauteur, ou vous êtes trop exigeant. Les deux, sans doute.</Body> : null}
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: alpha(INK, 0.15), marginLeft: space.gutter + 64 + 14, marginRight: space.gutter }} />}
          renderItem={({ item }) => (
            <Pressable
              testID={`match-${item.match_id}`}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/chat/[matchId]', params: { matchId: item.match_id } })}
            >
              {({ pressed }) => (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    paddingHorizontal: space.gutter,
                    paddingVertical: 12,
                    backgroundColor: pressed ? INK : PAPER,
                  }}
                >
                  <Photo
                    path={item.photo_path}
                    url={item.photo_path ? urls[item.photo_path] : ''}
                    name={item.display_name}
                    monogramSize={34}
                    caption={false}
                    style={{ width: 64, height: 64, borderWidth: 1.5, borderColor: pressed ? PAPER : INK }}
                  />
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <Title size={24} color={pressed ? PAPER : INK} numberOfLines={1} style={{ flexShrink: 1 }}>
                        {item.display_name}
                      </Title>
                      <Label size={9} color={pressed ? PAPER : INK} style={{ opacity: 0.6 }}>
                        {item.last_message_at ? formatShort(item.last_message_at) : 'Nouveau'}
                      </Label>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Body
                        size={14}
                        numberOfLines={1}
                        color={pressed ? PAPER : INK}
                        style={{ flex: 1, opacity: item.unread_count ? 1 : 0.65, fontFamily: item.unread_count ? 'Inter_600SemiBold' : 'Inter_400Regular' }}
                      >
                        {item.last_message ?? 'Écrivez le premier message. Pas de pression.'}
                      </Body>
                      {item.unread_count ? (
                        <View testID="unread-badge" style={{ minWidth: 20, height: 20, paddingHorizontal: 5, backgroundColor: pressed ? PAPER : INK, alignItems: 'center', justifyContent: 'center' }}>
                          <Label size={10} color={pressed ? INK : PAPER} style={{ letterSpacing: 0 }}>
                            {item.unread_count}
                          </Label>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              )}
            </Pressable>
          )}
        />
      </View>
    </ToneProvider>
  );
}
