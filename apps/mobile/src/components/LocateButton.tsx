import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppError, errorMessage } from '@/lib/errors';
import { shareApproxLocation } from '@/lib/location';
import { colors } from '@/lib/theme';
import { FieldError } from './Field';
import { CheckIcon, PinIcon } from './Icons';
import { PopIn, Spinner } from './motion';
import { Body, Small } from './Text';

/** « Utiliser ma position (arrondie au km) » : facultatif, la distance s'affiche alors sur les profils. */
export function LocateButton() {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'denied'>('idle');
  const [error, setError] = useState<string | null>(null);

  const locate = async () => {
    setError(null);
    setState('busy');
    try {
      setState(await shareApproxLocation());
    } catch (e) {
      setState('idle');
      setError(e instanceof AppError ? errorMessage(e) : 'Position indisponible. Réessayez, ou passez : c’est facultatif.');
    }
  };

  return (
    <View style={{ gap: 4 }}>
      {state === 'done' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
          <PopIn>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
              <CheckIcon size={14} stroke={3} color="#FFFFFF" />
            </View>
          </PopIn>
          <Body weight="bold" size={14.5}>
            Position enregistrée, arrondie au kilomètre
          </Body>
        </View>
      ) : (
        <Pressable testID="locate" accessibilityRole="button" onPress={locate} disabled={state === 'busy'} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}>
          {state === 'busy' ? <Spinner size={18} /> : <PinIcon size={18} color={colors.accent} />}
          <Body weight="bold" size={14.5} color={colors.accent}>
            {state === 'busy' ? 'Localisation…' : 'Utiliser ma position (arrondie au km)'}
          </Body>
        </Pressable>
      )}
      {state === 'denied' ? <Small>Permission refusée : les distances ne s’afficheront pas. Vous pourrez l’activer plus tard.</Small> : null}
      {error ? <FieldError message={error} /> : null}
    </View>
  );
}
