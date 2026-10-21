import Svg, { Circle, Path } from 'react-native-svg';

import { useTone } from './Tone';

type Props = { size?: number; color?: string; stroke?: number };

function useInk(color?: string) {
  const { fg } = useTone();
  return color ?? fg;
}

export function CheckIcon({ size = 24, color, stroke = 2.4 }: Props) {
  const c = useInk(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 46 46" fill="none">
      <Path d="M8 24 L19 35 L39 11" stroke={c} strokeWidth={stroke * 1.5} fill="none" />
    </Svg>
  );
}

export function CrossIcon({ size = 24, color, stroke = 2.4 }: Props) {
  const c = useInk(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 46 46" fill="none">
      <Path d="M11 11 L35 35 M35 11 L11 35" stroke={c} strokeWidth={stroke * 1.5} fill="none" />
    </Svg>
  );
}

export function DashIcon({ size = 24, color, stroke = 2.4 }: Props) {
  const c = useInk(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 46 46" fill="none">
      <Path d="M9 23 H37" stroke={c} strokeWidth={stroke * 1.5} fill="none" />
    </Svg>
  );
}

export function ArrowIcon({ size = 18, color, stroke = 1.8, direction = 'right' }: Props & { direction?: 'left' | 'right' | 'up' }) {
  const c = useInk(color);
  const d = direction === 'left' ? 'M15 4 L7 12 L15 20' : direction === 'up' ? 'M4 15 L12 7 L20 15' : 'M9 4 L17 12 L9 20';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={d} stroke={c} strokeWidth={stroke} fill="none" />
    </Svg>
  );
}

export function HeartIcon({ size = 22, color, filled }: Props & { filled?: boolean }) {
  const c = useInk(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 20.5 C 6 16.4 2.5 13.1 2.5 8.9 C 2.5 6 4.7 3.8 7.4 3.8 C 9.3 3.8 11 4.9 12 6.6 C 13 4.9 14.7 3.8 16.6 3.8 C 19.3 3.8 21.5 6 21.5 8.9 C 21.5 13.1 18 16.4 12 20.5 Z"
        stroke={c}
        strokeWidth={1.8}
        fill={filled ? c : 'none'}
      />
    </Svg>
  );
}

export function DotsIcon({ size = 22, color }: Props) {
  const c = useInk(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={5} cy={12} r={1.8} fill={c} />
      <Circle cx={12} cy={12} r={1.8} fill={c} />
      <Circle cx={19} cy={12} r={1.8} fill={c} />
    </Svg>
  );
}

/** Signature manuscrite de la carte de diplôme (tracé repris de la vidéo). */
export function Signature({ width = 120, color }: { width?: number; color?: string }) {
  const c = useInk(color);
  return (
    <Svg width={width} height={(width * 62) / 230} viewBox="0 0 230 62" fill="none">
      <Path
        d="M6 46 C 26 6, 40 64, 62 30 S 96 8, 104 40 S 132 58, 150 22 S 186 34, 200 28 S 218 24, 226 30"
        stroke={c}
        strokeWidth={2.4}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
