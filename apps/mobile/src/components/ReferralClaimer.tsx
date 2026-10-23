import { useEffect, useRef } from 'react';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { errorCode } from '@/lib/errors';
import { forgetReferral, listenForReferralLinks, pendingReferral } from '@/lib/referral';
import { useOverlay } from './Overlay';

/**
 * Lettre de recommandation : une fois connecté, le code gardé depuis le lien est utilisé une seule fois
 * (`claim_referral`), puis oublié. Un code expiré, révoqué ou trop tardif n'empêche jamais l'inscription :
 * au pire, un mot discret.
 */
export function ReferralClaimer() {
  const { userId, state, refresh } = useApp();
  const { toast } = useOverlay();
  const tried = useRef<string | null>(null);

  // Téléphone : lien d'ouverture de l'app (le web lit l'adresse dès le chargement, voir lib/referral).
  useEffect(() => listenForReferralLinks(() => {}), []);

  useEffect(() => {
    if (!userId || !state || state.referred) return;
    let active = true;
    (async () => {
      const code = await pendingReferral();
      if (!active || !code || tried.current === `${userId}:${code}`) return;
      tried.current = `${userId}:${code}`;
      try {
        const res = await api.claimReferral(code);
        await forgetReferral();
        refresh();
        toast(res?.referrer_first_name ? `Lettre de ${res.referrer_first_name} enregistrée : votre dossier passera en premier.` : 'Lettre de recommandation enregistrée.');
      } catch (e) {
        const code = errorCode(e);
        if (code === 'network') {
          // Le code reste gardé : nouvel essai au prochain chargement de l'état.
          tried.current = null;
          return;
        }
        await forgetReferral();
        if (code === 'invalid_code' || code === 'quota_exceeded') toast('Ce lien de recommandation n’est plus valable. Votre inscription continue normalement.');
      }
    })();
    return () => {
      active = false;
    };
  }, [refresh, state, toast, userId]);

  return null;
}
