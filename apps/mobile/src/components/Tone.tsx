import { createContext, useContext, type ReactNode } from 'react';

import { palette, type Palette, type Tone } from '@/lib/theme';

const ToneContext = createContext<Palette>(palette('light'));

export function ToneProvider({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <ToneContext.Provider value={palette(tone)}>{children}</ToneContext.Provider>;
}

export function useTone(): Palette {
  return useContext(ToneContext);
}
