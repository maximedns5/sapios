import { View } from 'react-native';

import { useApp } from '@/lib/app-state';
import { alpha } from '@/lib/theme';
import { useOverlay } from './Overlay';
import { TopBar } from './Screen';
import { useTone } from './Tone';

/** En-tête d'onboarding : étape courante, filet de progression, déconnexion. */
export function StepHeader({ step, total = 4 }: { step: number; total?: number }) {
  const { signOut } = useApp();
  const { confirm } = useOverlay();
  const { fg } = useTone();
  return (
    <View>
      <TopBar
        left={`Étape ${String(step).padStart(2, '0')} / ${String(total).padStart(2, '0')}`}
        right={{
          label: 'Quitter',
          testID: 'sign-out',
          onPress: async () => {
            if (await confirm({ title: 'Se déconnecter ?', message: 'Votre progression est enregistrée.', confirm: 'Se déconnecter' })) signOut();
          },
        }}
      />
      <View style={{ height: 1.5, marginHorizontal: 24, backgroundColor: alpha(fg, 0.15) }}>
        <View style={{ height: 1.5, width: `${(step / total) * 100}%`, backgroundColor: fg }} />
      </View>
    </View>
  );
}
