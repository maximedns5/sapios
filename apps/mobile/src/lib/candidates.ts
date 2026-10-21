import type { Candidate } from './types';

/** Profils déjà reçus (feed, likes) : la fiche détaillée s'ouvre sans nouvel appel. */
const cache = new Map<string, Candidate>();

export function rememberCandidates(list: Candidate[]) {
  for (const c of list) cache.set(c.id, c);
}

export function cachedCandidate(id: string): Candidate | undefined {
  return cache.get(id);
}

// Profil bloqué (ou signalé puis bloqué) depuis une fiche : la découverte le retire de sa file locale.
const dropListeners = new Set<(id: string) => void>();

export function dropCandidate(id: string) {
  cache.delete(id);
  dropListeners.forEach((listener) => listener(id));
}

export function onCandidateDropped(listener: (id: string) => void): () => void {
  dropListeners.add(listener);
  return () => {
    dropListeners.delete(listener);
  };
}

export function describe(c: Pick<Candidate, 'city' | 'distance_km'>): string {
  const parts: string[] = [];
  if (c.city) parts.push(c.city);
  if (c.distance_km != null) parts.push(`à ${c.distance_km} km`);
  return parts.join(' · ');
}
