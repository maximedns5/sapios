import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { errorMessage } from '@/lib/errors';
import { useOverlay } from './Overlay';

/**
 * Suppression définitive du compte, en deux confirmations (la seconde à taper). Partagée par le compte
 * et l'écran « Nos conditions évoluent » (CGU art. 14.1 : refuser la nouvelle version, c'est partir).
 */
export function useAccountDeletion() {
  const { signOut } = useApp();
  const { confirm, toast } = useOverlay();

  return async () => {
    const first = await confirm({
      label: 'Suppression définitive',
      title: 'Supprimer votre compte ?',
      message: 'CV, candidatures, conversations, diplôme et jetons de notification seront effacés. Les entreprises ne verront plus rien de vous. C’est irréversible.',
      confirm: 'Continuer',
      destructive: true,
    });
    if (!first) return;
    const second = await confirm({
      label: 'Dernière confirmation',
      title: 'Vraiment ?',
      message: 'Aucune restauration ne sera possible.',
      confirm: 'Supprimer définitivement',
      destructive: true,
      typeToConfirm: 'SUPPRIMER',
    });
    if (!second) return;
    try {
      await api.deleteAccount();
      await signOut({ local: true });
    } catch (e) {
      toast(errorMessage(e));
    }
  };
}
