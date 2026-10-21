import { View } from 'react-native';

import { Reveal } from './Reveal';
import { Title } from './Text';

/** « SAPIOS » révélé lettre à lettre (stagger 45 ms, montée de 118 %, comme l'intro de la vidéo). */
export function Wordmark({ size = 72, delay = 0, color }: { size?: number; delay?: number; color?: string }) {
  return (
    <View accessible accessibilityLabel="Sapios" accessibilityRole="header" style={{ flexDirection: 'row' }}>
      {'SAPIOS'.split('').map((ch, i) => (
        <Reveal key={i} delay={delay + i * 45} duration={1050}>
          <Title size={size} color={color} style={{ letterSpacing: size * 0.03, lineHeight: size * 1.02 }}>
            {ch}
          </Title>
        </Reveal>
      ))}
    </View>
  );
}
