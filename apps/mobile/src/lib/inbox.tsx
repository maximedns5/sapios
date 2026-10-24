import { usePathname } from 'expo-router';
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';

import { useOverlay } from '@/components/Overlay';
import { useApp } from './app-state';
import { openChat } from './nav';
import { getActiveChat } from './push';
import { channelName, supabase } from './supabase';
import { isForeground } from './visibility';
import { useDocumentTitle } from './web';

type Inbox = {
  /** Messages reçus non lus, toutes candidatures (get_emploi_state().counts). */
  unread: number;
  /** Candidatures en attente d'une réponse du recruteur. */
  open: number;
  /** Invitations (approche directe) sans réponse. */
  invitations: number;
};

const Ctx = createContext<Inbox>({ unread: 0, open: 0, invitations: 0 });

type Row = { id: string; application_id: string; sender_id: string | null; body: string };

/**
 * Notifications dans l'app (le push n'existe pas sur le web) : un abonnement Realtime aux nouveaux messages
 * des candidatures (la RLS filtre), bandeau « Nouveau message », relecture de l'état pour les compteurs.
 */
export function InboxProvider({ children }: { children: ReactNode }) {
  const { userId, state, refresh } = useApp();
  const { banner } = useOverlay();
  const pathname = usePathname();
  const path = useRef(pathname);
  path.current = pathname;
  const enabled = !!userId && state?.kind === 'candidate' && !!state.candidate?.complete;

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel(channelName('inbox'))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'application_messages' }, (payload) => {
        const m = payload.new as Row;
        if (!m || m.sender_id === userId) return;
        refresh();
        if (m.application_id === getActiveChat() && isForeground()) return;
        banner({
          testID: 'banner-message',
          label: 'Nouveau message',
          title: 'Un recruteur vous a écrit',
          message: m.body,
          action: { label: 'Répondre', onPress: () => openChat(m.application_id) },
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [banner, enabled, refresh, userId]);

  const counts = state?.counts;
  const value = useMemo<Inbox>(
    () => ({ unread: counts?.unread_messages ?? 0, open: counts?.applications_open ?? 0, invitations: counts?.invitations_pending ?? 0 }),
    [counts?.applications_open, counts?.invitations_pending, counts?.unread_messages],
  );
  useDocumentTitle(value.unread);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInbox(): Inbox {
  return useContext(Ctx);
}
