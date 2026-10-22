import { View, type StyleProp, type ViewStyle } from 'react-native';

import { alpha, colors, radius } from '@/lib/theme';
import { AlertIcon, LockIcon } from './Icons';
import { Body } from './Text';

type Kind = 'info' | 'error' | 'accent';

/** Encart arrondi : information (surface chaude), erreur (rouge, annoncée) ou mise en avant (teinte d'accent). */
export function Notice({
  title,
  message,
  kind = 'info',
  style,
  testID,
  icon,
}: {
  title?: string;
  message: string;
  kind?: Kind;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  icon?: 'alert' | 'lock' | 'none';
}) {
  const bg = kind === 'error' ? alpha(colors.danger, 0.08) : kind === 'accent' ? alpha(colors.accent, 0.08) : colors.surface;
  const ink = kind === 'error' ? colors.danger : kind === 'accent' ? colors.accent : colors.secondary;
  const glyph = icon ?? (kind === 'error' ? 'alert' : 'none');
  return (
    <View
      testID={testID}
      accessibilityRole={kind === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion={kind === 'error' ? 'polite' : undefined}
      style={[{ backgroundColor: bg, borderRadius: radius.tile, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, style]}
    >
      {glyph === 'alert' ? <AlertIcon size={20} color={ink} /> : glyph === 'lock' ? <LockIcon size={20} color={ink} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        {title ? (
          <Body weight="bold" size={15} color={kind === 'info' ? colors.text : ink}>
            {title}
          </Body>
        ) : null}
        <Body size={14.5} color={kind === 'error' ? colors.danger : colors.secondary} style={{ lineHeight: 21 }}>
          {message}
        </Body>
      </View>
    </View>
  );
}
