import * as Notifications from 'expo-notifications';
import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useApp } from '@/lib/app-state';
import { PUSH_SUPPORTED, registerForPush, routeForPush, type PushData } from '@/lib/push';
import { decide, isAllowed, SIGNED_OUT } from '@/lib/routing';

/**
 * Portail de routage : l'écran affiché découle de la session et de get_my_state().
 * On ne redirige que si l'écran courant n'est pas autorisé pour l'état, ou si le verdict affiché est périmé.
 */
export function Gate() {
  const { ready, session, state, stateError, seen, userId, refresh } = useApp();
  const pathname = usePathname();
  const { v: shownVerdict } = useGlobalSearchParams<{ v?: string }>();
  const pendingPush = useRef<string | null>(null);
  const verdictSig = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      verdictSig.current = null;
      if (!isAllowed(pathname, SIGNED_OUT.allowed)) router.replace(SIGNED_OUT.target);
      return;
    }
    if (!state) {
      if (stateError && pathname !== '/') router.replace('/');
      return;
    }
    const route = decide(state, seen);
    // Palier, niveau ou soumission changés côté serveur (relus au focus ou périodiquement) pendant qu'un
    // verdict est affiché : on montre le nouveau. Un simple « vu » ne compte pas.
    const sub = state.latest_submission;
    const sig = `${userId}|${state.tier}|${state.level}|${state.copy_key}|${sub?.id}|${sub?.status}`;
    const changed = verdictSig.current !== null && verdictSig.current !== sig;
    verdictSig.current = sig;
    if (pendingPush.current) {
      const target = pendingPush.current;
      pendingPush.current = null;
      if (isAllowed(target.split('?')[0], route.allowed)) {
        router.push(target);
        return;
      }
    }
    const staleVerdict = changed && pathname === '/verdict' && route.target.startsWith('/verdict?v=') && route.target !== `/verdict?v=${shownVerdict ?? ''}`;
    if (pathname === '/' || staleVerdict || !isAllowed(pathname, route.allowed)) router.replace(route.target);
  }, [ready, session, state, stateError, seen, pathname, shownVerdict, userId]);

  // Jeton push : enregistré sans redemander la permission dès que le profil est actif.
  useEffect(() => {
    if (!userId || !state || state.profile_status === 'onboarding') return;
    registerForPush(userId, false).catch(() => {});
  }, [userId, state?.profile_status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tap sur une notification : rafraîchit l'état puis ouvre l'écran pertinent.
  useEffect(() => {
    if (!PUSH_SUPPORTED) return;
    const open = (data: PushData | undefined) => {
      const target = routeForPush(data);
      if (!target) return;
      refresh().then(() => {
        if (target !== '/') router.push(target);
      });
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      pendingPush.current = routeForPush(last.notification.request.content.data as PushData);
      Notifications.clearLastNotificationResponse();
    }
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      open(response.notification.request.content.data as PushData);
    });
    const received = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as PushData;
      if (data?.type === 'verdict' || data?.type === 'match') refresh();
    });
    return () => {
      sub.remove();
      received.remove();
    };
  }, [refresh]);

  return null;
}
