import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { encode } from 'uqr';

import { colors } from '@/lib/theme';

/** QR code net (modules carrés, marge de 4 modules), dessiné en SVG. Lisible par n'importe quel lecteur. */
export function QrCode({ value, size = 168, label }: { value: string; size?: number; label: string }) {
  const { d, n } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 0 });
    let path = '';
    qr.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) path += `M${x + 4} ${y + 4}h1v1h-1z`;
      }),
    );
    return { d: path, n: qr.size + 8 };
  }, [value]);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`}>
        <Rect x={0} y={0} width={n} height={n} fill="#FFFFFF" />
        <Path d={d} fill={colors.text} />
      </Svg>
    </View>
  );
}
