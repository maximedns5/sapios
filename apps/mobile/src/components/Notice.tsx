import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Body, Label } from './Text';
import { useTone } from './Tone';

/** Bloc inversé : erreurs, avertissements, confirmations. Aucun rouge, aucun vert : l'inversion suffit. */
export function Notice({
  title,
  message,
  style,
  testID,
  outline,
}: {
  title?: string;
  message: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  outline?: boolean;
}) {
  const { fg, bg } = useTone();
  const ink = outline ? fg : bg;
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={[{ backgroundColor: outline ? 'transparent' : fg, borderWidth: 1.5, borderColor: fg, padding: 14, gap: 4 }, style]}
    >
      {title ? <Label color={ink}>{title}</Label> : null}
      <Body color={ink} size={15}>
        {message}
      </Body>
    </View>
  );
}
