import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, radius, shadow } from '@/lib/theme';
import { useTone } from './Tone';

type Variant = 'primary' | 'secondary' | 'ghost' | 'inverse' | 'danger' | 'destructive';

type Props = {
  label: string;
  onPress?: () => void | Promise<unknown>;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Icône avant le libellé. */
  icon?: ReactNode;
  /** Icône après le libellé (flèche). */
  trailing?: ReactNode;
  testID?: string;
  accessibilityHint?: string;
  size?: 'lg' | 'md';
};

const FILL: Record<Variant, { bg: string; fg: string }> = {
  primary: { bg: colors.accent, fg: colors.onAccent },
  secondary: { bg: colors.surface, fg: colors.text },
  ghost: { bg: 'transparent', fg: colors.muted },
  inverse: { bg: '#FFFFFF', fg: colors.text },
  danger: { bg: 'transparent', fg: colors.danger },
  destructive: { bg: colors.danger, fg: '#FFFFFF' },
};

/**
 * Bouton pilule. Primaire = accent plein, secondaire = surface chaude, discret = texte seul.
 * Une action asynchrone affiche une roue et bloque les appuis répétés. Désactivé : gris, sans ombre.
 */
export function Button({ label, onPress, variant = 'primary', disabled, loading, style, icon, trailing, testID, accessibilityHint, size = 'lg' }: Props) {
  const { tone } = useTone();
  const [busy, setBusy] = useState(false);
  const isBusy = loading || busy;
  const inactive = disabled || isBusy;
  // Sur fond d'accent, le bouton principal devient blanc.
  const v: Variant = tone === 'accent' && variant === 'primary' ? 'inverse' : variant;
  const fill = disabled ? { bg: v === 'ghost' || v === 'danger' ? 'transparent' : colors.line, fg: colors.muted } : FILL[v];
  const fg = tone === 'accent' && v === 'ghost' ? colors.onAccent : fill.fg;

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
      {({ pressed, hovered }) => (
        <View
          style={{
            minHeight: size === 'lg' ? 56 : 48,
            paddingHorizontal: v === 'ghost' || v === 'danger' ? 14 : 22,
            borderRadius: radius.pill,
            backgroundColor: fill.bg,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            opacity: pressed ? 0.88 : hovered && !inactive ? 0.94 : 1,
            transform: [{ scale: pressed && !inactive ? 0.97 : 1 }],
            boxShadow: v === 'inverse' && !disabled ? shadow.soft : undefined,
          }}
        >
          {isBusy ? (
            <ActivityIndicator color={fg} />
          ) : (
            <>
              {icon}
              <Text
                numberOfLines={1}
                style={{ fontFamily: fonts.bold, fontSize: size === 'lg' ? 16 : 15, color: fg, flexShrink: 1, textDecorationLine: hovered && (v === 'ghost' || v === 'danger') ? 'underline' : 'none' }}
              >
                {label}
              </Text>
              {trailing}
            </>
          )}
        </View>
      )}
    </Pressable>
  );
}

type IconButtonProps = {
  label: string;
  onPress?: () => void;
  children: ReactNode;
  /** surface : disque chaud (en-têtes) ; floating : blanc avec ombre (actions sur photo) ; accent : plein. */
  variant?: 'surface' | 'floating' | 'accent' | 'plain' | 'glass';
  size?: number;
  disabled?: boolean;
  testID?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  selected?: boolean;
};

/** Bouton rond à icône (44 px minimum), libellé obligatoire pour les lecteurs d'écran. */
export function IconButton({ label, onPress, children, variant = 'surface', size = 44, disabled, testID, accessibilityHint, style, selected }: IconButtonProps) {
  const bg =
    variant === 'surface' ? colors.surface : variant === 'floating' ? '#FFFFFF' : variant === 'accent' ? colors.accent : variant === 'glass' ? 'rgba(255,255,255,0.18)' : 'transparent';
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, ...(selected != null ? { selected } : {}) }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={size < 44 ? (44 - size) / 2 : 0}
      style={style}
    >
      {({ pressed, hovered }) => (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: bg,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.4 : pressed ? 0.85 : hovered ? 0.92 : 1,
            transform: [{ scale: pressed && !disabled ? 0.94 : 1 }],
            boxShadow: variant === 'floating' ? (size >= 56 ? shadow.floating : shadow.button) : variant === 'accent' ? shadow.button : undefined,
          }}
        >
          {children}
        </View>
      )}
    </Pressable>
  );
}

/** Lien textuel pour les actions secondaires. */
export function TextLink({ label, onPress, testID, color, size = 15, accessibilityRole = 'button' }: { label: string; onPress: () => void; testID?: string; color?: string; size?: number; accessibilityRole?: 'button' | 'link' }) {
  const { fg } = useTone();
  return (
    <Pressable testID={testID} accessibilityRole={accessibilityRole} onPress={onPress} hitSlop={10} style={{ minHeight: 44, justifyContent: 'center' }}>
      {({ pressed, hovered }) => (
        <Text style={{ fontFamily: fonts.bold, fontSize: size, color: color ?? fg, opacity: pressed ? 0.6 : 1, textDecorationLine: hovered ? 'underline' : 'none' }}>{label}</Text>
      )}
    </Pressable>
  );
}
