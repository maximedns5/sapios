import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useOverlay } from '@/components/Overlay';
import { api } from './api';
import { useApp } from './app-state';
import { errorMessage } from './errors';
import { openChat } from './nav';
import { getActiveChat } from './push';
import { channelName, supabase } from './supabase';
import type { MatchRow, Message } from './types';
import { isForeground } from './visibility';
import { useDocumentTitle } from './web';

type Inbox = {
  /** get_matches(), null tant que la première lecture n'est pas faite. */
  rows: MatchRow[] | null;
  error: string | null;
  /** Messages reçus non lus, toutes conversations. */
  unread: number;
  /** Nouveaux matchs jamais ouverts (sans message). */
  fresh: number;
  isFresh: (matchId: string) => boolean;
  reload: () => void;
  markOpened: (matchId: string) => void;
};

const Ctx = createContext<Inbox | null>(null);

// Matchs nés d'un like de cet appareil : l'écran « C'est un match » s'affiche déjà, pas de bandeau.
const ownMatches = new Set<string>();
export function noteOwnMatch(matchId: string) {
  ownMatches.add(matchId);
}

const DEBOUNCE = 350;
const SAFETY_POLL = 60_000;

/**
 * Notifications dans l'app (le push n'existe pas sur le web) : un seul abonnement Realtime aux INSERT/UPDATE
 * de messages et matches (la RLS filtre), relecture groupée de get_matches(), badge, bandeaux, titre d'onglet.
 */
export function InboxProvider({ children }: { children: ReactNode }) {
  const { userId, state } = useApp();
  const { banner } = useOverlay();
  const pathname = usePathname();
  const enabled = !!userId && !!state?.can_browse && (state.profile_status === 'active' || state.profile_status === 'paused');

  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Set<string>>(new Set());

  const path = useRef(pathname);
  path.current = pathname;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const again = useRef(false);
  const live = useRef(false);
  const pending = useRef<{ messages: Message[]; matches: string[] }>({ messages: [], matches: [] });

  const announce = useCallback(
    (list: MatchRow[]) => {
      const { messages, matches } = pending.current;
      pending.current = { messages: [], matches: [] };
      const byId = new Map(list.map((r) => [r.match_id, r]));
      const match = matches.map((id) => byId.get(id)).filter((r): r is MatchRow => !!r && !ownMatches.has(r.match_id) && path.current !== `/match/${r.match_id}`).pop();
      const message = messages
        .filter((m) => m.sender_id !== userId && !(m.match_id === getActiveChat() && isForeground()))
        .map((m) => ({ m, row: byId.get(m.match_id) }))
        .filter((x): x is { m: Message; row: MatchRow } => !!x.row)
        .pop();
      if (message) {
        banner({
          testID: 'banner-message',
          label: 'Nouveau message',
          title: message.row.display_name,
          message: message.m.body,
          action: { label: 'Répondre', onPress: () => openChat(message.m.match_id) },
        });
      } else if (match) {
        banner({
          testID: 'banner-match',
          label: 'C’est un match',
          title: match.display_name,
          message: 'Vous vous êtes mutuellement trouvés à la hauteur.',
          action: { label: `Écrire à ${match.display_name}`, onPress: () => openChat(match.match_id) },
        });
      }
    },
    [banner, userId],
  );

  const load = useCallback(async () => {
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      const list = await api.matches();
      setRows(list);
      setError(null);
      announce(list);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      running.current = false;
      if (again.current) {
        again.current = false;
        load();
      }
    }
  }, [announce]);

  // Plusieurs événements rapprochés (envoi + accusé de lecture) : une seule relecture.
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      load();
    }, DEBOUNCE);
  }, [load]);

  useEffect(() => {
    setRows(null);
    setOpened(new Set());
    if (!enabled || !userId) return;
    AsyncStorage.getItem(`sapios.opened.${userId}`)
      .then((raw) => raw && setOpened(new Set(JSON.parse(raw) as string[])))
      .catch(() => {});
    load();
    const channel = supabase
      .channel(channelName(`inbox:${userId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        pending.current.messages.push(payload.new as Message);
        schedule();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => schedule())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, (payload) => {
        pending.current.matches.push((payload.new as { id: string }).id);
        schedule();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, () => schedule())
      .subscribe((status) => {
        live.current = status === 'SUBSCRIBED';
      });
    // Retour sur l'onglet : la connexion Realtime a pu dormir, on relit une fois.
    const sub = AppState.addEventListener('change', (next) => next === 'active' && schedule());
    // Filet de sécurité si le WebSocket est bloqué (proxy) : relecture lente, page visible seulement.
    const poll = setInterval(() => {
      if (!live.current && isForeground()) load();
    }, SAFETY_POLL);
    return () => {
      sub.remove();
      clearInterval(poll);
      if (timer.current) clearTimeout(timer.current);
      live.current = false;
      supabase.removeChannel(channel);
    };
  }, [enabled, userId, load, schedule]);

  const markOpened = useCallback(
    (matchId: string) => {
      if (!userId) return;
      setOpened((prev) => {
        if (prev.has(matchId)) return prev;
        const next = new Set(prev);
        next.add(matchId);
        AsyncStorage.setItem(`sapios.opened.${userId}`, JSON.stringify([...next].slice(-200))).catch(() => {});
        return next;
      });
    },
    [userId],
  );

  const unread = useMemo(() => (rows ?? []).reduce((n, r) => n + (r.unread_count ?? 0), 0), [rows]);
  const freshIds = useMemo(() => new Set((rows ?? []).filter((r) => !r.last_message_at && !opened.has(r.match_id)).map((r) => r.match_id)), [rows, opened]);
  const isFresh = useCallback((matchId: string) => freshIds.has(matchId), [freshIds]);

  useDocumentTitle(enabled ? unread + freshIds.size : 0);

  const value = useMemo<Inbox>(
    () => ({ rows, error, unread, fresh: freshIds.size, isFresh, reload: schedule, markOpened }),
    [rows, error, unread, freshIds, isFresh, schedule, markOpened],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInbox(): Inbox {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useInbox hors de InboxProvider');
  return ctx;
}
