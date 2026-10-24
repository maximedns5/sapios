import { APPLICATION_STATUS_LABELS_CANDIDATE, EMPLOI_LIMITS, type ApplicationMessage, type MyApplicationDetail } from '@sapios/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SlotRow } from '@/components/ApplicationBits';
import { Button, IconButton } from '@/components/Button';
import { CompanyLogo } from '@/components/Company';
import { ArrowRightIcon, CalendarIcon, ChevronLeftIcon } from '@/components/Icons';
import { PopIn, Rise } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { Body, Small } from '@/components/Text';
import { ToneProvider } from '@/components/Tone';
import { useApp } from '@/lib/app-state';
import { emploi } from '@/lib/emploi';
import { errorCode, errorMessage } from '@/lib/errors';
import { formatDay } from '@/lib/format';
import { setActiveChat } from '@/lib/push';
import { channelName, supabase } from '@/lib/supabase';
import { colors, fonts } from '@/lib/theme';
import { useForeground } from '@/lib/visibility';

type Local = ApplicationMessage & { pending?: boolean; failed?: boolean };
type Item = { kind: 'msg'; msg: Local; last: boolean } | { kind: 'day'; label: string; key: string };

/**
 * Conversation d'une candidature appariée : les créneaux d'entretien proposés en tête (à choisir), puis les
 * messages en temps réel. Avant le match, la conversation n'existe pas (`not_matched`).
 */
export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refresh } = useApp();
  const { toast } = useOverlay();
  const insets = useSafeAreaInsets();
  const foreground = useForeground();
  const [app, setApp] = useState<MyApplicationDetail | null>(null);
  const [messages, setMessages] = useState<Local[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const input = useRef<TextInputInstance>(null);
  const history = useRef<Set<string> | null>(null);

  const loadMessages = useCallback(async () => {
    try {
      const list = await emploi.messages(id);
      setMessages(list.slice().reverse());
      if (!history.current) history.current = new Set(list.map((m) => m.id));
      setClosed(null);
    } catch (e) {
      if (errorCode(e) === 'not_matched') setClosed('La conversation s’ouvre dès que l’entreprise se dit intéressée par votre candidature.');
      else setError(errorMessage(e));
    }
  }, [id]);

  const loadApp = useCallback(() => emploi.application(id).then(setApp).catch(() => {}), [id]);

  useEffect(() => {
    setActiveChat(id);
    loadApp();
    loadMessages();
    const channel = supabase
      .channel(channelName(`application:${id}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'application_messages', filter: `application_id=eq.${id}` }, () => loadMessages())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'interview_slots', filter: `application_id=eq.${id}` }, () => loadApp())
      .subscribe();
    // Repli sans Realtime : relecture toutes les 20 s.
    const poll = setInterval(() => {
      loadMessages();
      loadApp();
    }, 20_000);
    return () => {
      setActiveChat(null);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [id, loadApp, loadMessages]);

  // Retour sur l'onglet : les messages arrivés entre-temps deviennent lus.
  useEffect(() => {
    if (foreground) loadMessages().then(() => refresh());
  }, [foreground, loadMessages, refresh]);

  const send = async () => {
    const body = draft.trim();
    if (!body || closed) return;
    setError(null);
    const temp: Local = { id: `tmp-${Date.now()}`, application_id: id, mine: true, body, context: null, created_at: new Date().toISOString(), read_at: null, pending: true };
    setMessages((list) => [temp, ...list]);
    setDraft('');
    try {
      await emploi.sendMessage(id, body);
      await loadMessages();
    } catch (e) {
      setMessages((list) => list.map((m) => (m.id === temp.id ? { ...m, pending: false, failed: true } : m)));
      setError(errorMessage(e));
    }
  };

  const retry = (msg: Local) => {
    setMessages((list) => list.filter((m) => m.id !== msg.id));
    setDraft(msg.body);
    input.current?.focus();
  };

  const confirmSlot = async () => {
    if (!slot) return;
    try {
      await emploi.acceptSlot(slot);
      await Promise.all([loadApp(), refresh()]);
      router.push({ pathname: '/interview/[id]', params: { id } });
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const lastMine = messages.find((m) => m.mine);
    messages.forEach((m, i) => {
      out.push({ kind: 'msg', msg: m, last: m === lastMine });
      const older = messages[i + 1];
      const day = new Date(m.created_at).toDateString();
      if (!older || new Date(older.created_at).toDateString() !== day) out.push({ kind: 'day', label: formatDay(m.created_at), key: `day-${day}` });
    });
    return out;
  }, [messages]);

  const company = app?.company.display_name ?? 'Conversation';
  const proposed = app?.slots.filter((s) => s.status === 'proposed') ?? [];
  const accepted = app?.slots.find((s) => s.status === 'accepted');

  const head = (
    <View style={{ gap: 12, paddingTop: 8, paddingBottom: 8 }}>
      {app?.note_target_label || app?.note ? (
        <View style={{ alignSelf: 'flex-end', maxWidth: '88%', borderLeftWidth: 3, borderColor: colors.accent, backgroundColor: colors.surfaceSoft, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, gap: 2 }}>
          <Small size={13} weight="semibold" color={colors.accent}>
            Votre candidature{app?.note_target_label ? ` · en réponse à « ${app.note_target_label} »` : ''}
          </Small>
          {app?.note ? (
            <Body size={14.5} weight="semibold" style={{ lineHeight: 20 }}>
              « {app.note} »
            </Body>
          ) : null}
        </View>
      ) : null}
      {proposed.length ? (
        <Rise>
          <View testID="slots-card" style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 22, padding: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CalendarIcon size={18} color={colors.accent} />
              <Body weight="bold" size={15}>
                {company} vous propose {proposed.length} créneau{proposed.length > 1 ? 'x' : ''}
              </Body>
            </View>
            {proposed.map((s) => (
              <SlotRow key={s.id} slot={s} selected={slot === s.id} onPress={() => setSlot(s.id)} testID={`slot-${s.id}`} />
            ))}
            <Button testID="confirm-slot" label="Confirmer ce créneau" size="md" disabled={!slot} onPress={confirmSlot} />
          </View>
        </Rise>
      ) : accepted ? (
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/interview/[id]', params: { id } })}>
          <SlotRow slot={accepted} />
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <ToneProvider tone="light">
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="chat">
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, height: 64, gap: 8, borderBottomWidth: 1, borderColor: colors.line }}>
          <IconButton label="Retour" variant="plain" onPress={() => (router.canGoBack() ? router.back() : router.replace('/messages'))}>
            <ChevronLeftIcon />
          </IconButton>
          <Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`Candidature ${app?.offer.title ?? ''}`} onPress={() => router.push({ pathname: '/applications/[id]', params: { id } })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <CompanyLogo name={company} size={40} />
              <View style={{ flex: 1 }}>
                <Body weight="bold" size={16.5} numberOfLines={1}>
                  {app?.recruiter?.first_name ? `${app.recruiter.first_name} · ${company}` : company}
                </Body>
                {app ? (
                  <Small size={13} numberOfLines={1} style={{ lineHeight: 16 }}>
                    {app.offer.title} · {APPLICATION_STATUS_LABELS_CANDIDATE[app.status]}
                  </Small>
                ) : null}
              </View>
            </View>
          </Pressable>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <FlatList
            testID="chat-list"
            inverted
            data={items}
            keyExtractor={(it) => (it.kind === 'msg' ? it.msg.id : it.key)}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, gap: 6 }}
            ListFooterComponent={head}
            renderItem={({ item }) => {
              if (item.kind === 'day') {
                return (
                  <Small size={13} align="center" style={{ marginVertical: 10 }}>
                    {item.label}
                  </Small>
                );
              }
              const m = item.msg;
              const animate = m.mine ? m.id.startsWith('tmp-') : !!history.current && !history.current.has(m.id);
              const bubble = (
                <View
                  testID={m.mine ? 'bubble-mine' : 'bubble-theirs'}
                  style={{
                    maxWidth: '80%',
                    paddingHorizontal: 15,
                    paddingVertical: 11,
                    borderRadius: 20,
                    borderBottomRightRadius: m.mine ? 6 : 20,
                    borderBottomLeftRadius: m.mine ? 20 : 6,
                    backgroundColor: m.mine ? colors.accent : colors.surface,
                    opacity: m.pending ? 0.6 : 1,
                    borderWidth: m.failed ? 1.5 : 0,
                    borderColor: colors.danger,
                  }}
                >
                  {m.context ? (
                    <Small size={13} color={m.mine ? 'rgba(255,255,255,0.85)' : colors.muted} style={{ marginBottom: 4 }}>
                      « {m.context} »
                    </Small>
                  ) : null}
                  <Body size={15.5} color={m.mine ? '#FFFFFF' : colors.text} style={{ lineHeight: 22 }}>
                    {m.body}
                  </Body>
                </View>
              );
              return (
                <Pressable disabled={!m.failed} onPress={() => retry(m)} style={{ alignItems: m.mine ? 'flex-end' : 'flex-start' }}>
                  {animate ? (
                    <PopIn duration={360} overshoot={1.06} style={{ alignItems: m.mine ? 'flex-end' : 'flex-start', width: '100%' }}>
                      {bubble}
                    </PopIn>
                  ) : (
                    bubble
                  )}
                  {m.failed || m.pending || (m.mine && item.last) ? (
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
              <Notice title="Pas encore de conversation" message={closed} />
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
                    accessibilityLabel={`Message à ${company}`}
                    {...(Platform.OS === 'web' ? { rows: 1 } : {})}
                    maxLength={EMPLOI_LIMITS.messageMax}
                    selectionColor={colors.accent}
                    style={[{ fontFamily: fonts.regular, fontSize: 16, color: colors.text, maxHeight: 120, paddingVertical: 12 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
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
          </View>
        </KeyboardAvoidingView>
      </View>
    </ToneProvider>
  );
}
