import * as Notifications from 'expo-notifications';
import { router, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useApp } from '@/lib/app-state';
import { PUSH_SUPPORTED, registerForPush, routeForPush, type PushData } from '@/lib/push';
import { decide, isAllowed, SIGNED_OUT } from '@/lib/routing';

/**
 * Portail de routage : l'écran affiché découle de la session et de get_my_state().
 * On ne redirige que si l'écran courant n'est pas autorisé pour l'état.
 */
export function Gate() {
  const { ready, session, state, stateError, seen, userId, refresh } = useApp();
  const pathname = usePathname();
  const pendingPush = useRef<string | null>(null);

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
    if (pendingPush.current) {
      const target = pendingPush.current;
      pendingPush.current = null;
      if (isAllowed(target.split('?')[0], route.allowed)) {
        router.push(target);
        return;
      }
    }
    if (pathname === '/' || !isAllowed(pathname, route.allowed)) router.replace(route.target);
  }, [ready, session, state, stateError, seen, pathname]);

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
