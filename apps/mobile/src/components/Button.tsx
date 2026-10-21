import { useState } from 'react';
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { fonts, tracking } from '@/lib/theme';
import { Label } from './Text';
import { useTone } from './Tone';

type Variant = 'solid' | 'outline' | 'ghost';

type Props = {
  label: string;
  onPress?: () => void | Promise<unknown>;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Mention à droite (ex. compteur, flèche). */
  trailing?: string;
  testID?: string;
  accessibilityHint?: string;
  compact?: boolean;
};

/** Bouton : plein = inversion du ton courant ; contour = filet 1,5 px ; état pressé = inversion franche. */
export function Button({ label, onPress, variant = 'solid', disabled, loading, style, trailing, testID, accessibilityHint, compact }: Props) {
  const { fg, bg } = useTone();
  const [busy, setBusy] = useState(false);
  const isBusy = loading || busy;
  // Libellés longs (« Soumettre un diplôme supérieur ») : corps réduit plutôt que tronqué.
  const labelSize = compact ? 11 : label.length > 24 ? 10.5 : 12;
  const inactive = disabled || isBusy;

  const handle = async () => {
    if (!onPress || inactive) return;
    const result = onPress();
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      setBusy(true);
      try {
        await result;
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: isBusy }}
      onPress={handle}
      disabled={inactive}
      style={style}
    >
      {({ pressed }) => {
        const solid = variant === 'solid' ? !pressed : pressed;
        const fill = solid ? fg : variant === 'ghost' ? 'transparent' : bg;
        const ink = solid ? bg : fg;
        return (
          <View
            style={{
              minHeight: compact ? 40 : 56,
              paddingHorizontal: compact ? 14 : 20,
              borderWidth: variant === 'ghost' ? 0 : 1.5,
              borderColor: fg,
              backgroundColor: fill,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: trailing ? 'space-between' : 'center',
              opacity: disabled ? 0.35 : 1,
            }}
          >
            {isBusy ? (
              <ActivityIndicator color={ink} />
            ) : (
              <>
                <Label
                  color={ink}
                  size={labelSize}
                  numberOfLines={1}
                  style={{ fontFamily: fonts.monoMedium, letterSpacing: tracking(labelSize), flexShrink: 1 }}
                >
                  {label}
                </Label>
                {trailing ? (
                  <Label color={ink} size={trailing.length > 3 ? 9 : compact ? 11 : 12} numberOfLines={1} style={{ marginLeft: 12, opacity: trailing.length > 3 ? 0.8 : 1 }}>
                    {trailing}
                  </Label>
                ) : null}
              </>
            )}
          </View>
        );
      }}
    </Pressable>
  );
}

/** Lien textuel souligné, pour les actions secondaires. */
export function TextLink({ label, onPress, testID, color }: { label: string; onPress: () => void; testID?: string; color?: string }) {
  const { fg } = useTone();
  return (
    <Pressable testID={testID} accessibilityRole="link" onPress={onPress} hitSlop={8}>
      {({ pressed }) => (
        <Label color={color ?? fg} style={{ textDecorationLine: 'underline', opacity: pressed ? 0.5 : 1 }}>
          {label}
        </Label>
      )}
    </Pressable>
  );
}
