import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { fromPostgrest } from '@/lib/errors';
import { formatDay, formatTime } from '@/lib/format';
import { useInbox } from '@/lib/inbox';
import { setActiveChat } from '@/lib/push';
import { blockUser, openReport, unmatchUser } from '@/lib/safety';
import { channelName, supabase } from '@/lib/supabase';
import { alpha, fonts, INK, PAPER, space } from '@/lib/theme';
import type { MatchRow, Message } from '@/lib/types';
import { useForeground } from '@/lib/visibility';
import { ArrowIcon, DotsIcon } from './Icons';
import { Notice } from './Notice';
import { useOverlay } from './Overlay';
import { Photo, useSignedUrls } from './Photo';
import { Body, Label, Title } from './Text';
import { ToneProvider } from './Tone';

const MAX = 2000;
type Local = Message & { pending?: boolean; failed?: boolean };
type Item = { kind: 'msg'; msg: Local; last: boolean } | { kind: 'day'; label: string; key: string };

/**
 * Conversation : messages en temps réel (INSERT filtrés par match_id), envoi par insert, lecture marquée
 * seulement quand l'app est au premier plan (sinon le badge et le titre d'onglet ne verraient rien).
 * `embedded` : colonne de droite de « Messages » sur grand écran.
 */
export function Conversation({ matchId, embedded, onLeave }: { matchId: string; embedded?: boolean; onLeave?: () => void }) {
  const { userId } = useApp();
  const { markOpened } = useInbox();
  const overlay = useOverlay();
  const insets = useSafeAreaInsets();
  const foreground = useForeground();
  const [match, setMatch] = useState<MatchRow | null>(null);
  const [messages, setMessages] = useState<Local[]>([]);
  const [closed, setClosed] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const input = useRef<TextInputInstance>(null);
  const visible = useRef(foreground);
  visible.current = foreground;
  const urls = useSignedUrls(match?.photo_path ? [match.photo_path] : []);

  const upsert = useCallback((incoming: Message) => {
    setMessages((list) => {
      const i = list.findIndex((m) => m.id === incoming.id);
      if (i >= 0) {
        const next = [...list];
        next[i] = { ...next[i], ...incoming, pending: false };
        return next;
      }
      return [incoming, ...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    });
  }, []);

  const markRead = useCallback(async () => {
    if (!userId || !matchId || !visible.current) return;
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('match_id', matchId)
      .neq('sender_id', userId)
      .is('read_at', null);
  }, [matchId, userId]);

  useEffect(() => {
    if (!matchId) return;
    setActiveChat(matchId);
    markOpened(matchId);
    (async () => {
      try {
        const rows = await api.matches();
        const found = rows.find((r) => r.match_id === matchId) ?? null;
        setMatch(found);
        if (!found) setClosed(true);
      } catch {
        setClosed(true);
      }
      const { data, error: e } = await supabase
        .from('messages')
        .select('id, match_id, sender_id, body, read_at, created_at')
        .eq('match_id', matchId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (e) setError('Messages indisponibles.');
      else setMessages((data ?? []) as Message[]);
      markRead();
    })();

    const channel = supabase
      .channel(channelName(`chat:${matchId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` }, (payload) => {
        const msg = payload.new as Message;
        upsert(msg);
        if (msg.sender_id !== userId) markRead();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` }, (payload) => {
        upsert(payload.new as Message);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, (payload) => {
        if ((payload.new as { unmatched_at: string | null }).unmatched_at) setClosed(true);
      })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => {
      setActiveChat(null);
      supabase.removeChannel(channel);
    };
  }, [markOpened, markRead, matchId, upsert, userId]);

  // Retour sur l'onglet : les messages arrivés entre-temps deviennent lus.
  useEffect(() => {
    if (foreground) markRead();
  }, [foreground, markRead]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !userId || !matchId || closed) return;
    if (body.length > MAX) {
      setError('2000 caractères maximum. Soyez brillant, pas bavard.');
      return;
    }
    setError(null);
    const temp: Local = { id: `tmp-${Date.now()}`, match_id: matchId, sender_id: userId, body, read_at: null, created_at: new Date().toISOString(), pending: true };
    setMessages((list) => [temp, ...list]);
    setDraft('');
    const { data, error: e } = await supabase.from('messages').insert({ match_id: matchId, sender_id: userId, body }).select('id, match_id, sender_id, body, read_at, created_at').single();
    if (e || !data) {
      setMessages((list) => list.map((m) => (m.id === temp.id ? { ...m, pending: false, failed: true } : m)));
      const code = fromPostgrest(e).code;
      if (code === 'forbidden' || e?.code === '42501') {
        setClosed(true);
        setError('Cette conversation est fermée.');
      } else setError('Message non envoyé. Touchez-le pour réessayer.');
      return;
    }
    setMessages((list) => {
      const withoutTemp = list.filter((m) => m.id !== temp.id && m.id !== data.id);
      return [data as Message, ...withoutTemp].sort((a, b) => b.created_at.localeCompare(a.created_at));
    });
  };

  const retry = (msg: Local) => {
    setMessages((list) => list.filter((m) => m.id !== msg.id));
    setDraft(msg.body);
    input.current?.focus();
  };

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const lastMine = messages.find((m) => m.sender_id === userId);
    messages.forEach((m, i) => {
      out.push({ kind: 'msg', msg: m, last: m === lastMine });
      const older = messages[i + 1];
      const day = new Date(m.created_at).toDateString();
      if (!older || new Date(older.created_at).toDateString() !== day) out.push({ kind: 'day', label: formatDay(m.created_at), key: `day-${day}` });
    });
    return out;
  }, [messages, userId]);

  const name = match?.display_name ?? 'Conversation';
  const otherId = match?.other_id;
  const openProfile = () => otherId && router.push({ pathname: '/profile/[userId]', params: { userId: otherId, matchId } });

  const menu = () => {
    if (!otherId || !matchId) return;
    overlay.sheet(name, [
      { label: 'Voir le profil', testID: 'menu-profile', onPress: openProfile },
      { label: 'Signaler', testID: 'menu-report', onPress: () => openReport(otherId, name, matchId) },
      { label: 'Se dé-matcher', testID: 'menu-unmatch', onPress: () => unmatchUser(overlay, matchId, name, onLeave) },
      { label: 'Bloquer', testID: 'menu-block', onPress: () => blockUser(overlay, otherId, name, '/messages', onLeave) },
    ]);
  };

  // Colonne de lecture bornée dans le volet large : bulles à 80 % d'au plus 760 px.
  const column = embedded ? ({ width: '100%', maxWidth: 760, alignSelf: 'center' } as const) : null;

  return (
    <ToneProvider tone="light">
      <View style={{ flex: 1, backgroundColor: PAPER, paddingTop: embedded ? 0 : insets.top }} testID="chat">
        <View style={{ flex: 1, width: '100%', maxWidth: embedded ? undefined : 560, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: embedded ? space.gutter : space.gutter - 6, height: embedded ? 72 : 64, gap: 10, borderBottomWidth: 1.5, borderColor: INK }}>
            {embedded ? null : (
              <Pressable accessibilityRole="button" accessibilityLabel="Retour" hitSlop={10} onPress={() => (router.canGoBack() ? router.back() : router.replace('/messages'))} style={{ padding: 6 }}>
                <ArrowIcon direction="left" size={20} />
              </Pressable>
            )}
            <Pressable style={{ flex: 1 }} disabled={!otherId} accessibilityRole="button" accessibilityLabel={`Profil de ${name}`} onPress={openProfile}>
              {({ hovered }) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Photo path={match?.photo_path} url={match?.photo_path ? urls[match.photo_path] : ''} name={name} monogramSize={20} caption={false} style={{ width: 40, height: 40, borderWidth: 1.5, borderColor: INK }} />
                  <View style={{ flex: 1 }}>
                    <Title size={22} numberOfLines={1} style={{ textDecorationLine: hovered ? 'underline' : 'none' }}>
                      {name}
                    </Title>
                    <Label size={8.5} style={{ opacity: 0.6 }}>
                      {closed ? 'Conversation fermée' : live ? 'En direct' : 'Connexion…'}
                    </Label>
                  </View>
                </View>
              )}
            </Pressable>
            <Pressable testID="chat-menu" accessibilityRole="button" accessibilityLabel="Options" hitSlop={10} onPress={menu}>
              {({ hovered, pressed }) => (
                <View style={{ padding: 8, backgroundColor: hovered || pressed ? INK : 'transparent' }}>
                  <DotsIcon color={hovered || pressed ? PAPER : INK} />
                </View>
              )}
            </Pressable>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <FlatList
              testID="chat-list"
              inverted
              data={items}
              keyExtractor={(it) => (it.kind === 'msg' ? it.msg.id : it.key)}
              contentContainerStyle={[{ paddingHorizontal: space.gutter, paddingVertical: 16, gap: 6 }, column]}
              ListFooterComponent={
                messages.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
                    <Label>Nouveau match</Label>
                    <Body style={{ textAlign: 'center', opacity: 0.7 }}>Ouvrez par une citation. Ou un simple « bonjour » : c’est aussi permis.</Body>
                  </View>
                ) : undefined
              }
              renderItem={({ item }) => {
                if (item.kind === 'day') {
                  return (
                    <View style={{ alignItems: 'center', marginVertical: 12 }}>
                      <Label size={9} style={{ opacity: 0.55 }}>
                        {item.label}
                      </Label>
                    </View>
                  );
                }
                const m = item.msg;
                const mine = m.sender_id === userId;
                return (
                  <Pressable disabled={!m.failed} onPress={() => retry(m)} style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                    <View
                      testID={mine ? 'bubble-mine' : 'bubble-theirs'}
                      style={{
                        maxWidth: '80%',
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        backgroundColor: mine ? INK : PAPER,
                        borderWidth: 1.5,
                        borderColor: INK,
                        opacity: m.pending ? 0.6 : 1,
                        borderStyle: m.failed ? 'dashed' : 'solid',
                      }}
                    >
                      <Body size={15} color={mine ? PAPER : INK} style={{ lineHeight: 21 }}>
                        {m.body}
                      </Body>
                    </View>
                    <Label size={8.5} style={{ opacity: 0.55, marginTop: 4 }}>
                      {m.failed ? 'Non envoyé — toucher pour réessayer' : m.pending ? 'Envoi…' : `${formatTime(m.created_at)}${mine && item.last ? (m.read_at ? ' · Lu' : ' · Envoyé') : ''}`}
                    </Label>
                  </Pressable>
                );
              }}
            />
            <View style={{ borderTopWidth: 1.5, borderColor: INK }}>
              <View style={[{ paddingHorizontal: space.gutter, paddingTop: 10, paddingBottom: (embedded ? 0 : insets.bottom) + (embedded ? 16 : 10), gap: 8 }, column]}>
                {error ? <Notice message={error} /> : null}
                {closed ? (
                  <Notice outline title="Conversation fermée" message="Ce match n’existe plus. Les messages restent lisibles, mais plus personne ne répondra." />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                    <View style={{ flex: 1, borderWidth: 1.5, borderColor: INK, paddingHorizontal: 12, minHeight: 48, justifyContent: 'center' }}>
                      <TextInput
                        ref={input}
                        testID="chat-input"
                        value={draft}
                        onChangeText={setDraft}
                        placeholder={embedded ? 'Écrire avec esprit… (Entrée pour envoyer)' : 'Écrire avec esprit…'}
                        placeholderTextColor={alpha(INK, 0.4)}
                        multiline
                        autoFocus={embedded}
                        accessibilityLabel={`Message à ${name}`}
                        {...(Platform.OS === 'web' ? { rows: 1 } : {})}
                        maxLength={MAX}
                        selectionColor={INK}
                        style={[
                          { fontFamily: fonts.sans, fontSize: 16, color: INK, maxHeight: 120, paddingVertical: 12 },
                          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
                        ]}
                        onKeyPress={(e) => {
                          const ne = e.nativeEvent as { key: string; shiftKey?: boolean };
                          if (Platform.OS === 'web' && ne.key === 'Enter' && !ne.shiftKey) {
                            (e as unknown as { preventDefault: () => void }).preventDefault();
                            send();
                          }
                        }}
                      />
                    </View>
                    <Pressable testID="chat-send" accessibilityRole="button" accessibilityLabel="Envoyer" disabled={!draft.trim()} onPress={send}>
                      {({ pressed, hovered }) => (
                        <View style={{ height: 48, paddingHorizontal: 14, backgroundColor: pressed || hovered ? PAPER : INK, borderWidth: 1.5, borderColor: INK, justifyContent: 'center', opacity: draft.trim() ? 1 : 0.35 }}>
                          <Label color={pressed || hovered ? INK : PAPER}>Envoyer</Label>
                        </View>
                      )}
                    </Pressable>
                  </View>
                )}
                {draft.length > MAX - 200 ? (
                  <Label size={9} style={{ textAlign: 'right', opacity: 0.6 }}>
                    {draft.length} / {MAX}
                  </Label>
                ) : null}
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </View>
    </ToneProvider>
  );
}
