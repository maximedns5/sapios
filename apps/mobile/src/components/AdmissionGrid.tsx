import { levelLabel } from '@sapios/shared';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { supabase } from '@/lib/supabase';
import { ease } from '@/lib/theme';
import type { AccessTier } from '@/lib/types';
import { CheckIcon, CrossIcon, DashIcon } from './Icons';
import { Label, Title } from './Text';
import { useTone } from './Tone';

export type PolicyRow = { min_level: number; tier: AccessTier; can_browse: boolean; copy_key: string };

/** Valeurs par défaut du contrat ; la vraie grille vient d'access_policy (configurable). */
const DEFAULT_POLICY: PolicyRow[] = [
  { min_level: 8, tier: 'unlimited', can_browse: true, copy_key: 'verdict.unlimited' },
  { min_level: 7, tier: 'standard', can_browse: true, copy_key: 'verdict.standard' },
  { min_level: 6, tier: 'waitlist', can_browse: false, copy_key: 'verdict.waitlist' },
  { min_level: 4, tier: 'refused', can_browse: false, copy_key: 'verdict.refused' },
  { min_level: 1, tier: 'refused', can_browse: false, copy_key: 'verdict.uninstall' },
];

const ROW_LABEL: Record<string, string> = {
  'verdict.unlimited': 'Accès illimité',
  'verdict.standard': 'Accès toléré',
  'verdict.waitlist': 'Liste d’attente',
  'verdict.refused': 'Refusé',
  'verdict.uninstall': 'Désinstallez.',
};
const TIER_LABEL: Record<AccessTier, string> = { unlimited: 'Accès illimité', standard: 'Accès toléré', waitlist: 'Liste d’attente', refused: 'Refusé' };

export function usePolicy(): PolicyRow[] {
  const [rows, setRows] = useState<PolicyRow[]>(DEFAULT_POLICY);
  useEffect(() => {
    supabase
      .from('access_policy')
      .select('min_level, tier, can_browse, copy_key')
      .order('min_level', { ascending: false })
      .then(({ data }) => {
        if (data && data.length) setRows(data as PolicyRow[]);
      });
  }, []);
  return rows;
}

function Row({
  row,
  index,
  highlighted,
  strike,
  delay,
  emphasis,
}: {
  row: PolicyRow;
  index: number;
  highlighted: boolean;
  strike: boolean;
  delay: number;
  emphasis: number;
}) {
  const { fg, bg } = useTone();
  const line = useSharedValue(0);
  const enter = useSharedValue(0);
  const cross = useSharedValue(0);
  const fill = useSharedValue(0);
  const [inverted, setInverted] = useState(false);

  useEffect(() => {
    const t = delay + index * 80;
    line.value = withDelay(t, withTiming(1, { duration: 600, easing: ease.expoInOut }));
    enter.value = withDelay(t + 80, withTiming(1, { duration: 600, easing: ease.expoOut }));
    if (strike) cross.value = withDelay(emphasis + index * 60, withTiming(1, { duration: 300, easing: ease.expoInOut }));
    if (highlighted) {
      fill.value = withDelay(emphasis + 140, withTiming(1, { duration: 360, easing: ease.expoInOut }));
      const timer = setTimeout(() => setInverted(true), emphasis + 140 + 180);
      return () => clearTimeout(timer);
    }
  }, [cross, delay, emphasis, enter, fill, highlighted, index, line, strike]);

  const lineStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: line.value }] }));
  const enterStyle = useAnimatedStyle(() => ({ opacity: enter.value, transform: [{ translateY: (1 - enter.value) * 24 }] }));
  const crossStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: cross.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));

  const ink = inverted ? bg : fg;
  const Icon = row.can_browse ? CheckIcon : row.tier === 'waitlist' ? DashIcon : CrossIcon;
  return (
    <View testID={highlighted ? 'grid-row-mine' : undefined} style={{ height: 58, justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', left: -12, right: -12, top: 0, bottom: 0, backgroundColor: fg, transformOrigin: 'left' }, fillStyle]} />
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: 1.5, backgroundColor: fg, transformOrigin: 'left' }, lineStyle]} />
      <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, enterStyle]}>
        <View>
          <Title size={34} color={ink}>
            {levelLabel(row.min_level)}
          </Title>
          <Animated.View style={[{ position: 'absolute', left: -4, right: -4, top: '54%', height: 3, backgroundColor: ink, transformOrigin: 'left' }, crossStyle]} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Label color={ink} size={10.5}>
            {ROW_LABEL[row.copy_key] ?? TIER_LABEL[row.tier]}
          </Label>
          <Icon size={20} color={ink} />
        </View>
      </Animated.View>
    </View>
  );
}

/** Grille d'admission de la vidéo (scène 03) : la ligne du membre est remplie, les refus barrés. */
export function AdmissionGrid({ rows, level, delay = 0, emphasis = 900 }: { rows: PolicyRow[]; level: number | null; delay?: number; emphasis?: number }) {
  const mine = level == null ? -1 : rows.findIndex((r) => r.min_level <= level);
  return (
    <View>
      {rows.map((row, i) => (
        <Row key={row.min_level} row={row} index={i} highlighted={i === mine} strike={row.tier === 'refused'} delay={delay} emphasis={emphasis} />
      ))}
    </View>
  );
}
