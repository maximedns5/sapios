import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/lib/theme';
import { useTone } from './Tone';

type Props = { size?: number; color?: string; stroke?: number };

function useInk(color?: string) {
  const { fg } = useTone();
  return color ?? fg;
}

/** Icône au trait (grille 24, bouts arrondis), comme dans les maquettes. */
function Line({ size = 22, color, stroke = 2.2, d, children }: Props & { d?: string | string[]; children?: React.ReactNode }) {
  const c = useInk(color);
  const paths = Array.isArray(d) ? d : d ? [d] : [];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {paths.map((p) => (
        <Path key={p} d={p} />
      ))}
      {children}
    </Svg>
  );
}

const HEART = 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z';

export const ChevronLeftIcon = (p: Props) => <Line {...p} d="M15 5l-7 7 7 7" />;
export const ChevronRightIcon = (p: Props) => <Line {...p} d="M9 5l7 7-7 7" />;
export const ArrowRightIcon = (p: Props) => <Line {...p} d="M5 12h13M13 6l6 6-6 6" />;
export const CrossIcon = (p: Props) => <Line {...p} d="M6 6l12 12M18 6L6 18" />;
export const CheckIcon = (p: Props) => <Line {...p} d="M6 12.5l4 4 8-9" />;
export const PlusIcon = (p: Props) => <Line {...p} d="M12 5v14M5 12h14" />;
export const ChatIcon = (p: Props) => <Line {...p} d="M4 5h16v11H9l-5 4z" />;
export const CapIcon = (p: Props) => <Line {...p} d={['M2 9l10-5 10 5-10 5z', 'M6 11v5c3 2 9 2 12 0v-5']} />;
export const BookIcon = (p: Props) => <Line {...p} d={['M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z', 'M5 17a3 3 0 0 1 3-3h10']} />;
export const BuildingIcon = (p: Props) => <Line {...p} d="M4 21h16M5 21V10l7-5 7 5v11M9 21v-6h6v6" />;
export const ReplayIcon = (p: Props) => <Line {...p} d={['M4 12a8 8 0 1 0 2.4-5.7', 'M4 4v4h4']} />;
export const EditIcon = (p: Props) => <Line {...p} d={['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4']} />;
export const CameraIcon = (p: Props) => (
  <Line {...p} d="M4 8h3l2-3h6l2 3h3v11H4z">
    <Circle cx={12} cy={13} r={3.5} />
  </Line>
);
export const FileIcon = (p: Props) => <Line {...p} d={['M7 3h7l5 5v13H7z', 'M14 3v5h5']} />;
export const ImageIcon = (p: Props) => (
  <Line {...p} d={['M21 16l-5-5-9 9']}>
    <Rect x={3} y={4} width={18} height={16} rx={3} />
    <Circle cx={9} cy={10} r={1.6} />
  </Line>
);
export const MailIcon = (p: Props) => (
  <Line {...p} d="M3.5 7l8.5 6 8.5-6">
    <Rect x={3} y={5} width={18} height={14} rx={2.5} />
  </Line>
);
export const LockIcon = (p: Props) => (
  <Line {...p} d="M8 11V8a4 4 0 0 1 8 0v3">
    <Rect x={5} y={11} width={14} height={10} rx={2.5} />
  </Line>
);
export const ShieldIcon = (p: Props) => <Line {...p} d={['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M9 12l2 2 4-4']} />;
export const PinIcon = (p: Props) => (
  <Line {...p} d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z">
    <Circle cx={12} cy={10} r={2} />
  </Line>
);
export const UserIcon = (p: Props) => (
  <Line {...p} d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6">
    <Circle cx={12} cy={8} r={4} />
  </Line>
);
export const CardIcon = (p: Props) => (
  <Line {...p}>
    <Rect x={5} y={3} width={14} height={18} rx={3} />
  </Line>
);
export const GearIcon = (p: Props) => (
  <Line
    {...p}
    d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
  >
    <Circle cx={12} cy={12} r={3} />
  </Line>
);
export const SlidersIcon = (p: Props) => (
  <Line {...p} d="M4 7h10M18 7h2M4 17h4M12 17h8">
    <Circle cx={16} cy={7} r={2} />
    <Circle cx={10} cy={17} r={2} />
  </Line>
);
export const WifiIcon = (p: Props) => <Line {...p} d={['M8.6 15.6a4.8 4.8 0 0 1 6.8 0', 'M5.6 12.5a9.1 9.1 0 0 1 12.8 0', 'M2.6 9.4a13.4 13.4 0 0 1 18.8 0', 'M12 19h.01']} />;
export const HourglassIcon = (p: Props) => <Line {...p} d={['M6 3h12M6 21h12', 'M7 3c0 5 5 6 5 9s-5 4-5 9', 'M17 3c0 5-5 6-5 9s5 4 5 9']} />;
export const ClockIcon = (p: Props) => (
  <Line {...p} d="M12 7v5l3 2">
    <Circle cx={12} cy={12} r={9} />
  </Line>
);
export const CopyIcon = (p: Props) => (
  <Line {...p} d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2">
    <Rect x={8} y={8} width={12} height={12} rx={2.5} />
  </Line>
);
export const ShareIcon = (p: Props) => <Line {...p} d={['M12 15V3M7 8l5-5 5 5', 'M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6']} />;
export const LinkIcon = (p: Props) => <Line {...p} d={['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1']} />;
export const CalendarIcon = (p: Props) => (
  <Line {...p} d="M3 10h18M8 3v4M16 3v4">
    <Rect x={3} y={5} width={18} height={16} rx={3} />
  </Line>
);
export const TicketIcon = (p: Props) => (
  <Line
    {...p}
    d={['M3 9V6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5V9a3 3 0 0 0 0 6v2.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5V15a3 3 0 0 0 0-6z', 'M14 5v2M14 11v2M14 17v2']}
  />
);
export const BriefcaseIcon = (p: Props) => <Line {...p} d={['M4 8h16v11H4z', 'M9 8V5h6v3', 'M4 13h16']} />;
export const ListIcon = (p: Props) => <Line {...p} d={['M9 6h11M9 12h11M9 18h11', 'M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2']} />;
export const HomeIcon = (p: Props) => <Line {...p} d={['M4 11l8-6 8 6v9H4z', 'M10 20v-5h4v5']} />;
export const GlobeIcon = (p: Props) => (
  <Line {...p} d={['M3 12h18', 'M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z']}>
    <Circle cx={12} cy={12} r={9} />
  </Line>
);
export const EuroIcon = (p: Props) => <Line {...p} d={['M17 6.5A6.5 6.5 0 1 0 17 17.5', 'M4 10h9M4 14h9']} />;
export const SendIcon = (p: Props) => <Line {...p} d={['M4 12l16-8-6 16-3-7z', 'M11 13l9-9']} />;
export const VideoIcon = (p: Props) => <Line {...p} d={['M3 7h12v10H3z', 'M15 10l6-3v10l-6-3']} />;
export const BellIcon = (p: Props) => <Line {...p} d={['M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z', 'M10 21h4']} />;
export const LogoutIcon = (p: Props) => <Line {...p} d={['M10 4H5v16h5', 'M14 8l4 4-4 4', 'M18 12H9']} />;
export const TrashIcon = (p: Props) => <Line {...p} d={['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13']} />;
export const DownloadIcon = (p: Props) => <Line {...p} d={['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14']} />;
export const EyeIcon = (p: Props) => (
  <Line {...p} d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z">
    <Circle cx={12} cy={12} r={3} />
  </Line>
);
export const AlertIcon = (p: Props) => (
  <Line {...p} d="M12 7.5v5.5M12 16.5v.01">
    <Circle cx={12} cy={12} r={9} />
  </Line>
);
export const SparkIcon = (p: Props) => <Line {...p} d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />;
export const FlagIcon = (p: Props) => <Line {...p} d={['M5 21V4', 'M5 4h11l-2 4 2 4H5']} />;
export const BlockIcon = (p: Props) => (
  <Line {...p} d="M5.6 5.6l12.8 12.8">
    <Circle cx={12} cy={12} r={9} />
  </Line>
);

export function HeartIcon({ size = 22, color, filled, stroke = 2.2 }: Props & { filled?: boolean }) {
  const c = useInk(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={HEART} stroke={c} strokeWidth={stroke} strokeLinejoin="round" fill={filled ? c : 'none'} />
    </Svg>
  );
}

export function DotsIcon({ size = 22, color }: Props) {
  const c = useInk(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={5} cy={12} r={2} fill={c} />
      <Circle cx={12} cy={12} r={2} fill={c} />
      <Circle cx={19} cy={12} r={2} fill={c} />
    </Svg>
  );
}

/** Pastille « diplôme vérifié » : disque d'accent, coche blanche. */
export function VerifiedBadge({ size = 22, label = 'Diplôme vérifié' }: { size?: number; label?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel={label} role="img">
      <Circle cx={12} cy={12} r={10} fill={colors.accent} />
      <Path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
