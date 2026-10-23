import { View } from 'react-native';

import { useApp } from '@/lib/app-state';
import { colors } from '@/lib/theme';
import { IconButton, TextLink } from './Button';
import { ProgressBar } from './Controls';
import { ChevronLeftIcon } from './Icons';
import { useOverlay } from './Overlay';

/** Les six étapes de l'inscription, des conditions d'utilisation au diplôme (un seul fil, un seul compteur). */
export const SIGNUP_STEPS = 6;

/**
 * En-tête d'inscription : retour (sous-étape précédente), barre de progression continue sur les six
 * étapes, déconnexion. `step` va de 1 à 6 ; `fraction` avance à l'intérieur d'une étape.
 */
export function StepHeader({ step, fraction = 0, onBack }: { step: number; fraction?: number; onBack?: () => void }) {
  const { signOut } = useApp();
  const { confirm } = useOverlay();
  const value = (step - 1 + Math.min(Math.max(fraction, 0), 1)) / SIGNUP_STEPS;
  return (
    <View style={{ height: 60, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 44 }}>
        {onBack ? (
          <IconButton label="Étape précédente" variant="plain" onPress={onBack} testID="step-back">
            <ChevronLeftIcon />
          </IconButton>
        ) : null}
      </View>
      <ProgressBar value={value} label={`Inscription, étape ${step} sur ${SIGNUP_STEPS}`} />
      <TextLink
        label="Quitter"
        testID="sign-out"
        color={colors.muted}
        size={14}
        onPress={async () => {
          if (await confirm({ title: 'Se déconnecter ?', message: 'Votre progression est enregistrée. Vous reprendrez où vous en étiez.', confirm: 'Se déconnecter' })) signOut();
        }}
      />
    </View>
  );
}
