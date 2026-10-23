import { parseLikedItem } from '@sapios/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { fromPostgrest } from '@/lib/errors';
import { formatDay } from '@/lib/format';
import { useInbox } from '@/lib/inbox';
import { setActiveChat } from '@/lib/push';
import { blockUser, openReport, unmatchUser } from '@/lib/safety';
import { channelName, supabase } from '@/lib/supabase';
import { colors, fonts } from '@/lib/theme';
import type { MatchRow, Message } from '@/lib/types';
import { useForeground } from '@/lib/visibility';
import { IconButton } from './Button';
import { ArrowRightIcon, ChevronLeftIcon, DotsIcon, VerifiedBadge } from './Icons';
import { PopIn, Rise } from './motion';
import { Notice } from './Notice';
import { useOverlay } from './Overlay';
import { Avatar, useSignedUrls } from './Photo';
import { SafetyCard } from './SafetyCard';
import { Body, Small } from './Text';
import { ToneProvider } from './Tone';

const MAX = 2000;
type Local = Message & { pending?: boolean; failed?: boolean };
type Item = { kind: 'msg'; msg: Local; last: boolean } | { kind: 'day'; label: string; key: string };

/**
 * Conversation : messages en temps réel (INSERT filtrés par match_id), envoi par insert, lecture marquée
 * seulement quand l'app est au premier plan (sinon le badge et le titre d'onglet ne verraient rien).
 */
export function Conversation({ matchId, onLeave }: { matchId: string; onLeave?: () => void }) {
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
  /** Messages déjà présents à l'ouverture : affichés sans animation. */
  const history = useRef<Set<string> | null>(null);
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
        .select('id, match_id, sender_id, body, read_at, created_at, context, liked_item, from_like')
        .eq('match_id', matchId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (e) setError('Messages indisponibles.');
      else setMessages((data ?? []) as Message[]);
      history.current = new Set(((data ?? []) as Message[]).map((m) => m.id));
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

  // Rappel de sécurité dès que la conversation est engagée des deux côtés (CGU art. 13.2).
  const bothWrote = useMemo(() => messages.some((m) => m.sender_id === userId && !m.pending) && messages.some((m) => m.sender_id !== userId), [messages, userId]);

  const name = match?.display_name ?? 'Conversation';
  const otherId = match?.other_id;
  const openProfile = () => otherId && router.push({ pathname: '/profile/[userId]', params: { userId: otherId, matchId } });

  const menu = () => {
    if (!otherId || !matchId) return;
    overlay.sheet(name, [
      { label: 'Voir le profil', testID: 'menu-profile', onPress: openProfile },
      { label: 'Signaler', testID: 'menu-report', onPress: () => openReport(otherId, name, matchId) },
      { label: 'Se dé-matcher', testID: 'menu-unmatch', onPress: () => unmatchUser(overlay, matchId, name, onLeave) },
      { label: 'Bloquer', testID: 'menu-block', destructive: true, onPress: () => blockUser(overlay, otherId, name, '/messages', onLeave) },
    ]);
  };


  return (
    <ToneProvider tone="light">
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="chat">
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, height: 64, gap: 6, borderBottomWidth: 1, borderColor: colors.line }}>
          <IconButton label="Retour aux messages" variant="plain" onPress={() => (router.canGoBack() ? router.back() : router.replace('/messages'))}>
            <ChevronLeftIcon />
          </IconButton>
          <Pressable style={{ flex: 1 }} disabled={!otherId} accessibilityRole="button" accessibilityLabel={`Profil de ${name}`} onPress={openProfile}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar path={match?.photo_path} url={match?.photo_path ? urls[match.photo_path] : ''} name={name} size={40} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Body weight="bold" size={17} numberOfLines={1} style={{ flexShrink: 1 }}>
                    {name}
                  </Body>
                  {match ? <VerifiedBadge size={18} /> : null}
                </View>
                {closed || !live ? (
                  <Small size={13} style={{ lineHeight: 16 }}>
                    {closed ? 'Conversation fermée' : 'Connexion…'}
                  </Small>
                ) : null}
              </View>
            </View>
          </Pressable>
          <IconButton testID="chat-menu" label="Signaler, bloquer ou se dé-matcher" variant="plain" onPress={menu}>
            <DotsIcon size={20} />
          </IconButton>
        </View>

        {userId && matchId ? <SafetyCard userId={userId} matchId={matchId} show={bothWrote && !closed} /> : null}

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FlatList
            testID="chat-list"
            inverted
            data={items}
            keyExtractor={(it) => (it.kind === 'msg' ? it.msg.id : it.key)}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, gap: 6 }}
            ListFooterComponent={messages.length === 0 && !closed ? <Starter name={name} onPick={(text) => { setDraft(text); input.current?.focus(); }} /> : undefined}
            renderItem={({ item }) => {
              if (item.kind === 'day') {
                return (
                  <Small size={13} align="center" style={{ marginVertical: 10 }}>
                    {item.label}
                  </Small>
                );
              }
              const m = item.msg;
              const mine = m.sender_id === userId;
              // Seuls les messages qui arrivent rebondissent (reçus en direct, ou le mien à l'envoi).
              const animate = mine ? m.id.startsWith('tmp-') : !!history.current && !history.current.has(m.id);
              const bubble = (
                <View
                  testID={mine ? 'bubble-mine' : 'bubble-theirs'}
                  style={{
                    maxWidth: '80%',
                    paddingHorizontal: 15,
                    paddingVertical: 11,
                    borderRadius: 20,
                    borderBottomRightRadius: mine ? 6 : 20,
                    borderBottomLeftRadius: mine ? 20 : 6,
                    backgroundColor: mine ? colors.accent : colors.surface,
                    opacity: m.pending ? 0.6 : 1,
                    borderWidth: m.failed ? 1.5 : 0,
                    borderColor: colors.danger,
                  }}
                >
                  <Body size={15.5} color={mine ? '#FFFFFF' : colors.text} style={{ lineHeight: 22 }}>
                    {m.body}
                  </Body>
                </View>
              );
              return (
                <Pressable disabled={!m.failed} onPress={() => retry(m)} style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  {m.from_like ? <LikedQuote mine={mine} name={name} item={m.liked_item ?? null} context={m.context ?? null} /> : null}
                  {animate ? (
                    <PopIn duration={360} overshoot={1.06} style={{ alignItems: mine ? 'flex-end' : 'flex-start', width: '100%' }}>
                      {bubble}
                    </PopIn>
                  ) : (
                    bubble
                  )}
                  {m.failed || m.pending || (mine && item.last) ? (
                    <Small size={13} color={m.failed ? colors.danger : colors.muted} style={{ marginTop: 3 }}>
                      {m.failed ? 'Non envoyé. Touchez pour réessayer.' : m.pending ? 'Envoi…' : m.read_at ? 'Lu' : 'Envoyé'}
                    </Small>
                  ) : null}
                </Pressable>
              );
            }}
          />
          <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: insets.bottom + 12, gap: 8 }}>
            {error ? <Notice kind="error" message={error} /> : null}
            {closed ? (
              <Notice title="Conversation fermée" message="Ce match n’existe plus. Les messages restent lisibles, mais plus personne ne répondra." />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                <View style={{ flex: 1, minHeight: 48, borderRadius: 24, backgroundColor: colors.surface, paddingHorizontal: 18, justifyContent: 'center' }}>
                  <TextInput
                    ref={input}
                    testID="chat-input"
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Votre message"
                    placeholderTextColor={colors.muted}
                    multiline
                    accessibilityLabel={`Message à ${name}`}
                    {...(Platform.OS === 'web' ? { rows: 1 } : {})}
                    maxLength={MAX}
                    selectionColor={colors.accent}
                    style={[
                      { fontFamily: fonts.regular, fontSize: 16, color: colors.text, maxHeight: 120, paddingVertical: 12 },
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
                <IconButton testID="chat-send" label="Envoyer" variant="accent" size={48} disabled={!draft.trim()} onPress={send}>
                  <ArrowRightIcon size={20} color="#FFFFFF" stroke={2.4} />
                </IconButton>
              </View>
            )}
            {draft.length > MAX - 200 ? (
              <Small size={13} align="right">
                {draft.length} / {MAX}
              </Small>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </ToneProvider>
  );
}

/** Au-dessus d'un mot né d'un like : ce qui a été aimé (réponse citée, ou la photo). */
function LikedQuote({ mine, name, item, context }: { mine: boolean; name: string; item: string | null; context: string | null }) {
  const kind = parseLikedItem(item).kind;
  const what = kind === 'answer' ? 'réponse' : kind === 'photo' ? 'photo' : 'profil';
  const label = mine ? `Vous avez aimé ${kind === 'profile' ? 'son profil' : `sa ${what}`}` : `${name} a aimé ${kind === 'profile' ? 'votre profil' : `votre ${what}`}`;
  return (
    <View
      testID="liked-quote"
      style={{ maxWidth: '86%', alignSelf: mine ? 'flex-end' : 'flex-start', borderLeftWidth: 3, borderColor: colors.accent, backgroundColor: colors.surfaceSoft, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 4, gap: 2 }}
    >
      <Small size={13} weight="semibold" color={colors.accent}>
        {label}
      </Small>
      {context ? (
        <Body size={14.5} weight="semibold" style={{ lineHeight: 20 }}>
          « {context} »
        </Body>
      ) : null}
    </View>
  );
}

const STARTERS = ['Votre livre de chevet, en ce moment ?', 'Le débat que vous gagnez toujours ?', 'Musée ou bibliothèque, pour un premier rendez-vous ?'];

/** Conversation vide : de quoi lancer l'échange (une question à toucher remplit le message). */
function Starter({ name, onPick }: { name: string; onPick: (text: string) => void }) {
  return (
    <Rise style={{ alignItems: 'center', gap: 12, paddingVertical: 28 }}>
      <Body weight="bold" align="center">
        Vous et {name}, c’est un match.
      </Body>
      <Small align="center">Brisez la glace. Une citation, une question, ou un simple « bonjour » : c’est aussi permis.</Small>
      <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 4 }}>
        {STARTERS.map((text, i) => (
          <Rise key={text} delay={120 + i * 80}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Proposer : ${text}`} onPress={() => onPick(text)}>
              {({ pressed }) => (
                <View style={{ borderWidth: 1.5, borderColor: pressed ? colors.accent : colors.line, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12 }}>
                  <Body size={15} weight="semibold">
                    {text}
                  </Body>
                </View>
              )}
            </Pressable>
          </Rise>
        ))}
      </View>
    </Rise>
  );
}
