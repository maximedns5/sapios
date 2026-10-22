import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatIcon } from '@/components/Icons';
import { MaskUp, PopIn, Rise, Spinner } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { Avatar, useSignedUrls } from '@/components/Photo';
import { Body, Heading, Small, Title } from '@/components/Text';
import { formatShort } from '@/lib/format';
import { useInbox } from '@/lib/inbox';
import { openChat } from '@/lib/nav';
import { colors, fonts, radius, space } from '@/lib/theme';
import type { MatchRow } from '@/lib/types';

/** Messages : nouveaux matchs en haut (pas encore de message), puis les conversations, en temps réel. */
export default function Messages() {
  const { m } = useLocalSearchParams<{ m?: string }>();
  const { rows, error, reload, isFresh } = useInbox();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  useFocusEffect(reload);
  const urls = useSignedUrls((rows ?? []).map((r) => r.photo_path).filter((p): p is string => !!p));

  // Ancien lien « /messages?m=<id> » (vue en deux colonnes) : ouvre la conversation.
  if (m) return <Redirect href={{ pathname: '/chat/[matchId]', params: { matchId: m } }} />;

  const fresh = (rows ?? []).filter((r) => !r.last_message);
  const conversations = (rows ?? []).filter((r) => !!r.last_message);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="messages">
      <FlatList
        data={conversations}
        keyExtractor={(r) => r.match_id}
        contentContainerStyle={{ paddingBottom: space.xl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accent}
            onRefresh={() => {
              setRefreshing(true);
              reload();
              setTimeout(() => setRefreshing(false), 600);
            }}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 18, paddingTop: 16, paddingBottom: 6 }}>
            <MaskUp style={{ paddingHorizontal: space.gutter }}>
              <Title size={30}>Messages</Title>
            </MaskUp>
            {error ? <Notice kind="error" message={error} style={{ marginHorizontal: space.gutter }} /> : null}
            {rows === null && !error ? (
              <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                <Spinner />
              </View>
            ) : null}
            {rows?.length === 0 ? <Empty /> : null}
            {fresh.length ? (
              <View style={{ gap: 12 }}>
                <Heading size={15} style={{ paddingHorizontal: space.gutter }}>
                  Nouveaux matchs
                </Heading>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.gutter, gap: 14 }}>
                  {fresh.map((r, i) => (
                    <PopIn key={r.match_id} delay={100 + i * 70} overshoot={1.1}>
                      <Pressable testID={`match-${r.match_id}`} accessibilityRole="button" accessibilityLabel={`Nouveau match avec ${r.display_name}. Écrire`} onPress={() => openChat(r.match_id)} style={{ alignItems: 'center', gap: 6, width: 76 }}>
                        <Avatar path={r.photo_path} url={r.photo_path ? urls[r.photo_path] : ''} name={r.display_name} size={72} ring />
                        <Body size={13.5} weight="semibold" numberOfLines={1}>
                          {r.display_name}
                        </Body>
                        {isFresh(r.match_id) ? <View testID="match-new" style={{ position: 'absolute', top: 0, right: 4, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.accent, borderWidth: 2, borderColor: '#FFFFFF' }} /> : null}
                      </Pressable>
                    </PopIn>
                  ))}
                </ScrollView>
              </View>
            ) : null}
            {conversations.length ? (
              <Heading size={15} style={{ paddingHorizontal: space.gutter }}>
                Conversations
              </Heading>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <Rise delay={120 + index * 60}>
            <Row item={item} url={item.photo_path ? urls[item.photo_path] : ''} onPress={() => openChat(item.match_id)} />
          </Rise>
        )}
      />
    </View>
  );
}

function Row({ item, url, onPress }: { item: MatchRow; url: string; onPress: () => void }) {
  const unread = item.unread_count > 0;
  return (
    <Pressable
      testID={`match-${item.match_id}`}
      accessibilityRole="button"
      accessibilityLabel={`${item.display_name}${unread ? `, ${item.unread_count} non lu${item.unread_count > 1 ? 's' : ''}` : ''}`}
      onPress={onPress}
    >
      {({ pressed }) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: space.gutter, paddingVertical: 12, backgroundColor: pressed ? colors.surfaceSoft : colors.bg }}>
          <Avatar path={item.photo_path} url={url} name={item.display_name} size={58} />
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <Body weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                {item.display_name}
              </Body>
              <Small size={13}>{item.last_message_at ? formatShort(item.last_message_at) : ''}</Small>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Body size={14.5} numberOfLines={1} color={unread ? colors.text : colors.muted} style={{ flex: 1, fontFamily: unread ? fonts.semibold : fonts.regular }}>
                {item.last_message}
              </Body>
              {unread ? (
                <View testID="unread-badge" style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Body size={11.5} weight="bold" color="#FFFFFF" style={{ lineHeight: 15 }}>
                    {item.unread_count}
                  </Body>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

function Empty() {
  return (
    <Rise delay={150} style={{ marginHorizontal: space.gutter, backgroundColor: colors.surface, borderRadius: radius.card, padding: 22, gap: 10, alignItems: 'center' }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        <ChatIcon size={24} color={colors.accent} stroke={2} />
      </View>
      <Body weight="bold" align="center">
        Aucun match pour l’instant
      </Body>
      <Body secondary size={15} align="center">
        Un like réciproque, et la conversation s’ouvre ici. Personne n’est à la hauteur, ou vous êtes trop exigeant. Les deux, sans doute.
      </Body>
    </Rise>
  );
}
