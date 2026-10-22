import { levelLabel } from '@sapios/shared';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { supabase } from '@/lib/supabase';
import { colors, ease } from '@/lib/theme';
import type { AccessTier } from '@/lib/types';
import { Body, Small } from './Text';

export type PolicyRow = { min_level: number; tier: AccessTier; can_browse: boolean; copy_key: string };

/** Valeurs par défaut du contrat ; la vraie grille vient d'access_policy (configurable). */
const DEFAULT_POLICY: PolicyRow[] = [
  { min_level: 8, tier: 'unlimited', can_browse: true, copy_key: 'verdict.unlimited' },
  { min_level: 7, tier: 'standard', can_browse: true, copy_key: 'verdict.standard' },
  { min_level: 6, tier: 'waitlist', can_browse: false, copy_key: 'verdict.waitlist' },
  { min_level: 4, tier: 'refused', can_browse: false, copy_key: 'verdict.refused' },
  { min_level: 1, tier: 'refused', can_browse: false, copy_key: 'verdict.uninstall' },
];

export const TIER_SHORT: Record<AccessTier, string> = { unlimited: 'Illimité', standard: 'Toléré', waitlist: 'Attente', refused: 'Refusé' };
export const TIER_LABEL: Record<AccessTier, string> = { unlimited: 'Accès illimité', standard: 'Accès toléré', waitlist: 'Liste d’attente', refused: 'Refusé' };

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

/** Premier niveau qui ouvre une porte (liste d'attente comprise), d'après la grille. */
export function firstOpenLevel(rows: PolicyRow[]): number | null {
  const open = rows.filter((r) => r.tier !== 'refused').map((r) => r.min_level);
  return open.length ? Math.min(...open) : null;
}

type Column = { key: string; label: string; caption: string; mine: boolean; weight: number };

function Bar({ column, index, delay }: { column: Column; index: number; delay: number }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    p.value = withDelay(column.mine ? delay : delay + 700 + index * 100, withTiming(1, { duration: column.mine ? 900 : 400, easing: ease.out }));
  }, [column.mine, delay, index, p, reduced]);
  const fill = useAnimatedStyle(() => (column.mine ? { transform: [{ scaleX: p.value }] } : { opacity: p.value * column.weight }));
  return (
    <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: column.mine ? '#E2DDD7' : 'transparent', overflow: 'hidden' }}>
      <Animated.View style={[{ flex: 1, backgroundColor: column.mine ? colors.text : colors.accent, transformOrigin: 'left' }, fill]} />
    </View>
  );
}

/**
 * Grille d'admission en barres : votre niveau en noir, puis les paliers qui ouvrent une porte, de plus en plus
 * intenses. Elle dit la vérité de la règle (access_policy), sans viser la personne.
 */
export function AdmissionBars({ rows, level, delay = 500 }: { rows: PolicyRow[]; level: number | null; delay?: number }) {
  const open = rows.filter((r) => r.tier !== 'refused').sort((a, b) => a.min_level - b.min_level);
  const mineRow = level == null ? null : rows.find((r) => r.min_level <= level) ?? null;
  const columns: Column[] = [];
  if (level != null && mineRow?.tier === 'refused') columns.push({ key: 'me', label: levelLabel(level), caption: 'Vous', mine: true, weight: 1 });
  open.forEach((r, i) => {
    const mine = mineRow?.min_level === r.min_level;
    columns.push({ key: String(r.min_level), label: levelLabel(r.min_level), caption: mine ? 'Vous' : TIER_SHORT[r.tier], mine, weight: open.length > 1 ? 0.35 + (0.65 * i) / (open.length - 1) : 1 });
  });
  return (
    <View style={{ gap: 8 }} accessible accessibilityLabel={`Grille d’admission : ${columns.map((c) => `${c.label}, ${c.caption}`).join(' ; ')}`}>
      <Small weight="semibold" size={13}>
        Grille d’admission
      </Small>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {columns.map((c, i) => (
          <Bar key={c.key} column={c} index={i} delay={delay} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {columns.map((c) => (
          <View key={c.key} style={{ flex: 1 }}>
            <Body size={13} weight={c.mine ? 'extrabold' : 'bold'} style={{ lineHeight: 17 }}>
              {c.label}
            </Body>
            <Small size={13} style={{ lineHeight: 17 }}>
              {c.caption}
            </Small>
          </View>
        ))}
      </View>
    </View>
  );
}
