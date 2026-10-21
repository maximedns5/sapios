import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Conversation } from '@/components/Conversation';
import { Notice } from '@/components/Notice';
import { Photo, useSignedUrls } from '@/components/Photo';
import { RevealLines } from '@/components/Reveal';
import { Body, Em, Label, Title } from '@/components/Text';
import { ToneProvider } from '@/components/Tone';
import { formatShort } from '@/lib/format';
import { useInbox } from '@/lib/inbox';
import { useLayout } from '@/lib/layout';
import { openChat } from '@/lib/nav';
import { alpha, INK, PAPER, space } from '@/lib/theme';
import type { MatchRow } from '@/lib/types';

/**
 * Conversations (get_matches via la boîte de réception partagée, tenue à jour en temps réel).
 * Grand écran : liste à gauche, conversation à droite (`/messages?m=<match_id>`).
 */
export default function Messages() {
  const { wide } = useLayout();
  const { m } = useLocalSearchParams<{ m?: string }>();
  const selected = wide && m ? m : null;

  if (!wide) return <Inbox selected={null} onOpen={(id) => openChat(id)} />;
  return (
    <ToneProvider tone="light">
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: PAPER }} testID="messages-split">
        <View style={{ width: 380, borderRightWidth: 1.5, borderColor: INK }}>
          <Inbox selected={selected} compact onOpen={(id) => router.setParams({ m: id })} />
        </View>
        <View style={{ flex: 1 }}>
          {selected ? (
            <Conversation key={selected} matchId={selected} embedded onLeave={() => router.setParams({ m: '' })} />
          ) : (
            <EmptyPane />
          )}
        </View>
      </View>
    </ToneProvider>
  );
}

function Inbox({ selected, onOpen, compact }: { selected: string | null; onOpen: (matchId: string) => void; compact?: boolean }) {
  const { rows, error, reload, isFresh } = useInbox();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  useFocusEffect(reload);
  const urls = useSignedUrls((rows ?? []).map((r) => r.photo_path).filter((p): p is string => !!p));
  const titleSize = compact ? 36 : 44;

  return (
    <ToneProvider tone="light">
      <View style={{ flex: 1, backgroundColor: PAPER, paddingTop: compact ? 0 : insets.top }} testID="messages">
        <FlatList
          data={rows ?? []}
          keyExtractor={(r) => r.match_id}
          style={{ width: '100%', maxWidth: 560, alignSelf: 'center' }}
          contentContainerStyle={{ paddingBottom: space.xl }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={INK}
              onRefresh={() => {
                setRefreshing(true);
                reload();
                setTimeout(() => setRefreshing(false), 600);
              }}
            />
          }
          ListHeaderComponent={
            <View style={{ gap: 14, paddingTop: compact ? 28 : 14, paddingBottom: 18, paddingHorizontal: space.gutter }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Label>Messages</Label>
                <Label>{rows ? `${rows.length} match${rows.length > 1 ? 's' : ''}` : ''}</Label>
              </View>
              <View>
                <RevealLines
                  lines={[
                    <Title key="a" size={titleSize}>
                      Conversations
                    </Title>,
                    <Title key="b" size={titleSize}>
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
          renderItem={({ item }) => <Row item={item} url={item.photo_path ? urls[item.photo_path] : ''} active={item.match_id === selected} fresh={isFresh(item.match_id)} onPress={() => onOpen(item.match_id)} />}
        />
      </View>
    </ToneProvider>
  );
}

function Row({ item, url, active, fresh, onPress }: { item: MatchRow; url: string; active: boolean; fresh: boolean; onPress: () => void }) {
  return (
    <Pressable
      testID={`match-${item.match_id}`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${item.display_name}${item.unread_count ? `, ${item.unread_count} non lu${item.unread_count > 1 ? 's' : ''}` : ''}`}
      onPress={onPress}
    >
      {({ pressed, hovered }) => {
        const inv = pressed || hovered || active;
        const fg = inv ? PAPER : INK;
        return (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: space.gutter, paddingVertical: 12, backgroundColor: inv ? INK : PAPER }}>
            <Photo path={item.photo_path} url={url} name={item.display_name} monogramSize={34} caption={false} style={{ width: 64, height: 64, borderWidth: 1.5, borderColor: fg }} />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <Title size={24} color={fg} numberOfLines={1} style={{ flexShrink: 1 }}>
                  {item.display_name}
                </Title>
                {fresh ? (
                  <View testID="match-new" style={{ backgroundColor: fg, paddingHorizontal: 5, paddingVertical: 1 }}>
                    <Label size={8.5} color={inv ? INK : PAPER}>
                      Nouveau
                    </Label>
                  </View>
                ) : (
                  <Label size={9} color={fg} style={{ opacity: 0.6 }}>
                    {item.last_message_at ? formatShort(item.last_message_at) : 'Nouveau'}
                  </Label>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Body
                  size={14}
                  numberOfLines={1}
                  color={fg}
                  style={{ flex: 1, opacity: item.unread_count ? 1 : 0.65, fontFamily: item.unread_count ? 'Inter_600SemiBold' : 'Inter_400Regular' }}
                >
                  {item.last_message ?? 'Écrivez le premier message. Pas de pression.'}
                </Body>
                {item.unread_count ? (
                  <View testID="unread-badge" style={{ minWidth: 20, height: 20, paddingHorizontal: 5, backgroundColor: fg, alignItems: 'center', justifyContent: 'center' }}>
                    <Label size={10} color={inv ? INK : PAPER} style={{ letterSpacing: 0 }}>
                      {item.unread_count}
                    </Label>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        );
      }}
    </Pressable>
  );
}

function EmptyPane() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 64, gap: 18, maxWidth: 640 }} testID="chat-empty">
      <Label>Aucune conversation ouverte</Label>
      <RevealLines
        lines={[
          <Title key="a" size={52}>
            Choisissez
          </Title>,
          <Title key="b" size={52}>
            <Em>votre interlocuteur.</Em>
          </Title>,
        ]}
      />
      <Body style={{ opacity: 0.75 }}>La liste de gauche se met à jour en temps réel. Entrée envoie un message, Maj + Entrée passe à la ligne.</Body>
    </View>
  );
}
