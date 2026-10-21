import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { api } from './api';
import { AppError } from './errors';
import { supabase } from './supabase';
import type { MyState } from './types';

type AppContext = {
  /** false tant que la session locale n'a pas été lue. */
  ready: boolean;
  session: Session | null;
  userId: string | null;
  state: MyState | null;
  stateError: AppError | null;
  loadingState: boolean;
  refresh: () => Promise<MyState | null>;
  /** Verdicts déjà montrés (clé locale par utilisateur). */
  seen: Set<string>;
  markSeen: (key: string) => Promise<void>;
  /** local : efface la session sans appel serveur (compte déjà supprimé). */
  signOut: (opts?: { local?: boolean }) => Promise<void>;
};

const Ctx = createContext<AppContext | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<MyState | null>(null);
  const [stateError, setStateError] = useState<AppError | null>(null);
  const [loadingState, setLoadingState] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const userId = session?.user.id ?? null;
  const inflight = useRef<Promise<MyState | null> | null>(null);

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

  const refresh = useCallback(async () => {
    if (!userId) return null;
    if (inflight.current) return inflight.current;
    setLoadingState(true);
    const run = api
      .myState()
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

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

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
