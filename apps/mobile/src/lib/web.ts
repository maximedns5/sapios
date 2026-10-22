import { useEffect } from 'react';
import { Platform } from 'react-native';

import { ACCENT, colors } from './theme';

const WEB = Platform.OS === 'web' && typeof document !== 'undefined';

/**
 * Réglages de page propres au navigateur : fond, sélection, anneau de focus clavier visible (accent),
 * barres de défilement discrètes.
 */
export function installWebChrome() {
  if (!WEB || document.getElementById('sapios-web')) return;
  document.body.style.backgroundColor = colors.bg;
  const style = document.createElement('style');
  style.id = 'sapios-web';
  style.textContent = `
* { -webkit-tap-highlight-color: transparent; }
::selection { background: ${ACCENT}; color: #FFFFFF; }
[tabindex]:not([tabindex="-1"]):not(input):not(textarea):focus { outline: none; }
[tabindex]:not([tabindex="-1"]):not(input):not(textarea):focus-visible {
  outline: 2px solid ${ACCENT}; outline-offset: 2px; border-radius: 12px;
}
input:focus-visible, textarea:focus-visible { outline: none; }
* { scrollbar-width: thin; scrollbar-color: ${colors.disabled} transparent; }
`;
  document.head.appendChild(style);
}

const BASE_TITLE = 'Sapios';

/** Titre de l'onglet : « (2) Sapios » tant qu'il reste des notifications non lues. */
export function useDocumentTitle(count: number) {
  useEffect(() => {
    if (!WEB) return;
    document.title = count > 0 ? `(${count > 99 ? '99+' : count}) ${BASE_TITLE}` : BASE_TITLE;
  }, [count]);
}

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** Raccourcis clavier (web) ignorés pendant une saisie ; `keys` : touche → action. */
export function useKeyboardShortcuts(keys: Record<string, () => void>, enabled = true) {
  useEffect(() => {
    if (!WEB || !enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const action = keys[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keys, enabled]);
}
