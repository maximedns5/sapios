import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Label } from './Text';
import { useTone } from './Tone';

/** Repères de cadrage et mentions d'angle de la vidéo de lancement. */
export function CropMarks({ caption = 'QI ≥ 130 — Bac+5 min.' }: { caption?: string }) {
  const { fg } = useTone();
  const insets = useSafeAreaInsets();
  const m = 12;
  const s = 14;
  const corner = (pos: object, widths: object) => (
    <View style={[{ position: 'absolute', width: s, height: s, borderColor: fg }, pos, widths]} />
  );
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { top: insets.top, bottom: insets.bottom }]}>
      {corner({ top: m, left: m }, { borderTopWidth: 1.5, borderLeftWidth: 1.5 })}
      {corner({ top: m, right: m }, { borderTopWidth: 1.5, borderRightWidth: 1.5 })}
      {corner({ bottom: m, left: m }, { borderBottomWidth: 1.5, borderLeftWidth: 1.5 })}
      {corner({ bottom: m, right: m }, { borderBottomWidth: 1.5, borderRightWidth: 1.5 })}
      <Label size={9} style={{ position: 'absolute', top: m + 4, left: m + 22, fontWeight: '700' }}>
        Sapios®
      </Label>
      <Label size={9} style={{ position: 'absolute', top: m + 4, right: m + 22 }}>
        {caption}
      </Label>
    </View>
  );
}
