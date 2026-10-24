import { APPLICATION_STATUS_LABELS_CANDIDATE, type ConversationSummary } from '@sapios/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { CompanyLogo } from '@/components/Company';
import { FeedSkeleton, LoadError } from '@/components/FeedStates';
import { Rise, stagger } from '@/components/motion';
import { Body, Small, Title } from '@/components/Text';
import { emploi } from '@/lib/emploi';
import { errorCode, errorMessage } from '@/lib/errors';
import { formatShort } from '@/lib/format';
import { openChat } from '@/lib/nav';
import { colors, space } from '@/lib/theme';

/** Messages : une conversation par candidature appariée (l'entreprise s'est dite intéressée). */
export default function Messages() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<ConversationSummary[] | null>(null);
  const [failure, setFailure] = useState<{ network: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await emploi.conversations();
      list.sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));
      setRows(list);
      setFailure(null);
    } catch (e) {
      setFailure({ network: errorCode(e) === 'network', message: errorMessage(e) });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const id = setInterval(load, 30_000);
      return () => clearInterval(id);
    }, [load]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="messages">
      <View style={{ paddingHorizontal: space.gutter, paddingTop: 12, paddingBottom: 8 }}>
        <Title size={30}>Messages</Title>
      </View>
      {failure && !rows ? (
        <View style={{ paddingHorizontal: space.gutter }}>
          <LoadError network={failure.network} message={failure.message} onRetry={load} />
        </View>
      ) : !rows ? (
        <View style={{ paddingHorizontal: space.gutter }}>
          <FeedSkeleton />
        </View>
      ) : rows.length === 0 ? (
        <View style={{ paddingHorizontal: space.gutter, paddingTop: 30, gap: 12, alignItems: 'center' }} testID="messages-empty">
          <Title size={24} align="center">
            Pas encore de conversation
          </Title>
          <Body secondary align="center">
            Une conversation s’ouvre dès qu’une entreprise se dit intéressée par votre candidature. Elle découvre alors votre nom, et vous pouvez échanger et fixer un entretien.
          </Body>
          <Button label="Suivre mes candidatures" variant="secondary" onPress={() => router.navigate('/applications')} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.application_id}
          contentContainerStyle={{ paddingBottom: space.xl }}
          renderItem={({ item, index }) => (
            <Rise delay={stagger(index, 0, 50)}>
              <Pressable testID={`conversation-${item.application_id}`} accessibilityRole="button" accessibilityLabel={`${item.counterpart}, ${item.offer_title}${item.unread_count ? `, ${item.unread_count} non lu${item.unread_count > 1 ? 's' : ''}` : ''}`} onPress={() => openChat(item.application_id)}>
                {({ pressed }) => (
                  <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', paddingHorizontal: space.gutter, paddingVertical: 12, backgroundColor: pressed ? colors.surface : colors.bg }}>
                    <CompanyLogo name={item.counterpart} size={54} />
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                        <Body weight="bold" size={16} numberOfLines={1} style={{ flexShrink: 1 }}>
                          {item.counterpart}
                        </Body>
                        {item.last_message_at ? <Small size={13}>{formatShort(item.last_message_at)}</Small> : null}
                      </View>
                      <Small size={13} numberOfLines={1}>
                        {item.offer_title} · {APPLICATION_STATUS_LABELS_CANDIDATE[item.status]}
                      </Small>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Body size={14.5} weight={item.unread_count ? 'semibold' : 'regular'} color={item.unread_count ? colors.text : colors.muted} numberOfLines={1} style={{ flex: 1 }}>
                          {item.last_message ?? 'Écrivez le premier message.'}
                        </Body>
                        {item.unread_count ? <View accessibilityLabel="Non lu" style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} /> : null}
                      </View>
                    </View>
                  </View>
                )}
              </Pressable>
            </Rise>
          )}
        />
      )}
    </View>
  );
}
