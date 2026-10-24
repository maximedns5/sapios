import * as Notifications from 'expo-notifications';
import { router, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useApp } from '@/lib/app-state';
import { PUSH_SUPPORTED, registerForPush, routeForPush, type PushData } from '@/lib/push';
import { decide, isAllowed, SIGNED_OUT } from '@/lib/routing';

const TABS = ['/offers', '/applications', '/messages', '/profile'];

/**
 * Portail de routage : l'écran affiché découle de la session et de get_emploi_state(). On ne redirige que si
 * l'écran courant n'est pas autorisé pour l'état. Un recruteur intéressé (avis non lu) ouvre une fois l'écran
 * « C'est un match » quand le candidat est sur un onglet.
 */
export function Gate() {
  const { ready, session, state, stateError, seen, userId, refresh } = useApp();
  const pathname = usePathname();
  const pendingPush = useRef<string | null>(null);
  const shownMatch = useRef(new Set<string>());

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      if (!isAllowed(pathname, SIGNED_OUT.allowed)) router.replace(SIGNED_OUT.target);
      return;
    }
    if (!state) {
      if (stateError && pathname !== '/') router.replace('/');
      return;
    }
    const route = decide(state, seen);
    if (!route) return;
    if (pendingPush.current) {
      const target = pendingPush.current;
      pendingPush.current = null;
      if (isAllowed(target.split('?')[0], route.allowed)) {
        router.push(target);
        return;
      }
    }
    if (pathname === '/' || !isAllowed(pathname, route.allowed)) {
      router.replace(route.target);
      return;
    }
    // Match : la candidature passe « Intéressé·e », l'identité est révélée au recruteur.
    if (TABS.includes(pathname)) {
      const match = state.notices.find((n) => n.kind === 'application_interested' && !shownMatch.current.has(n.id) && !seen.has(`match:${n.id}`));
      if (match && match.kind === 'application_interested') {
        shownMatch.current.add(match.id);
        router.push({ pathname: '/match/[id]', params: { id: match.payload.application_id, notice: match.id } });
      }
    }
  }, [ready, session, state, stateError, seen, pathname]);

  // Jeton push : enregistré sans redemander la permission dès que l'inscription est finie.
  useEffect(() => {
    if (!userId || !state?.candidate?.complete) return;
    registerForPush(userId, false).catch(() => {});
  }, [userId, state?.candidate?.complete]);

  // Tap sur une notification : rafraîchit l'état puis ouvre l'écran pertinent.
  useEffect(() => {
    if (!PUSH_SUPPORTED) return;
    const open = (data: PushData | undefined) => {
      const target = routeForPush(data);
      if (!target) return;
      refresh().then(() => router.push(target));
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      pendingPush.current = routeForPush(last.notification.request.content.data as PushData);
      Notifications.clearLastNotificationResponse();
    }
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      open(response.notification.request.content.data as PushData);
    });
    const received = Notifications.addNotificationReceivedListener(() => refresh());
    return () => {
      sub.remove();
      received.remove();
    };
  }, [refresh]);

  return null;
}
