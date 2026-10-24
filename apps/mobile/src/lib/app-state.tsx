import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState as RNAppState, Platform } from 'react-native';

import { emploi } from './emploi';
import { AppError } from './errors';
import { supabase } from './supabase';
import type { AppState } from './types';

const FOCUS_THROTTLE = 10_000;
const POLL = 60_000;

type AppContext = {
  /** false tant que la session locale n'a pas été lue. */
  ready: boolean;
  session: Session | null;
  userId: string | null;
  state: AppState | null;
  stateError: AppError | null;
  loadingState: boolean;
  refresh: () => Promise<AppState | null>;
  /** Écrans déjà montrés une fois (clé locale par utilisateur) : invitation au diplôme, matchs. */
  seen: Set<string>;
  markSeen: (key: string) => Promise<void>;
  /** local : efface la session sans appel serveur (compte déjà supprimé). */
  signOut: (opts?: { local?: boolean }) => Promise<void>;
};

const Ctx = createContext<AppContext | null>(null);

/** Lit get_emploi_state() ; un compte sans type est déclaré candidat (l'app est réservée aux candidats). */
async function loadState(): Promise<AppState> {
  const first = (await emploi.state()) as AppState;
  if (first.kind) return { ...first, notices: first.notices ?? [] };
  try {
    await emploi.setAccountKind('candidate');
  } catch (e) {
    // Déclaré entre-temps (autre appareil, site recruteur) : l'état relu dira lequel.
    if (!(e instanceof AppError && e.code === 'kind_already_set')) throw e;
  }
  const next = (await emploi.state()) as AppState;
  return { ...next, notices: next.notices ?? [] };
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [stateError, setStateError] = useState<AppError | null>(null);
  const [loadingState, setLoadingState] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const userId = session?.user.id ?? null;
  const inflight = useRef<Promise<AppState | null> | null>(null);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setReady(true));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      // Pas d'appel Supabase synchrone ici : on se contente de mémoriser la session.
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const lastRead = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId) return null;
    if (inflight.current) return inflight.current;
    lastRead.current = Date.now();
    setLoadingState(true);
    const run = loadState()
      .then((next) => {
        setState(next);
        setStateError(null);
        return next;
      })
      .catch((error: unknown) => {
        setStateError(error instanceof AppError ? error : new AppError('unknown'));
        return null;
      })
      .finally(() => {
        setLoadingState(false);
        inflight.current = null;
      });
    inflight.current = run;
    return run;
  }, [userId]);

  useEffect(() => {
    setState(null);
    setStateError(null);
    setSeen(new Set());
    if (!userId) return;
    refresh();
    AsyncStorage.getItem(`sapios.seen.${userId}`)
      .then((raw) => raw && setSeen(new Set(JSON.parse(raw) as string[])))
      .catch(() => {});
  }, [userId, refresh]);

  // Réponses des recruteurs, avis, compteurs : relus au retour sur l'app (au plus une fois toutes les 10 s)
  // et toutes les 60 s au premier plan. Sur le web, il n'y a pas de push pour les annoncer.
  useEffect(() => {
    if (!userId) return;
    const soft = () => {
      if (Date.now() - lastRead.current > FOCUS_THROTTLE) refresh();
    };
    const sub = RNAppState.addEventListener('change', (next) => next === 'active' && soft());
    const onFocus = () => soft();
    if (Platform.OS === 'web') window.addEventListener('focus', onFocus);
    const poll = setInterval(() => {
      if (RNAppState.currentState === 'active' && Date.now() - lastRead.current >= POLL - 1000) refresh();
    }, POLL);
    return () => {
      sub.remove();
      clearInterval(poll);
      if (Platform.OS === 'web') window.removeEventListener('focus', onFocus);
    };
  }, [refresh, userId]);

  const markSeen = useCallback(
    async (key: string) => {
      if (!userId) return;
      const next = new Set(seen);
      next.add(key);
      setSeen(next);
      await AsyncStorage.setItem(`sapios.seen.${userId}`, JSON.stringify([...next])).catch(() => {});
    },
    [seen, userId],
  );

  const signOut = useCallback(async (opts?: { local?: boolean }) => {
    await supabase.auth.signOut(opts?.local ? { scope: 'local' } : undefined).catch(() => {});
    setSession(null);
  }, []);

  const value = useMemo<AppContext>(
    () => ({ ready, session, userId, state, stateError, loadingState, refresh, seen, markSeen, signOut }),
    [ready, session, userId, state, stateError, loadingState, refresh, seen, markSeen, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp hors de AppStateProvider');
  return ctx;
}
