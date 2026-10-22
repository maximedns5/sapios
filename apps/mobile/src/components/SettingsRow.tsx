import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { colors, radius } from '@/lib/theme';
import { ChevronRightIcon } from './Icons';
import { Body, Small } from './Text';

/** Groupe de réglages : carte chaude, lignes séparées par un filet. */
export function SettingsGroup({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <View accessibilityLabel={label} style={{ backgroundColor: colors.surface, borderRadius: radius.card, overflow: 'hidden' }}>
      {children}
    </View>
  );
}

/** Ligne de réglage : pastille d'icône, titre, sous-titre, chevron (ou contrôle à droite). */
export function SettingsRow({
  icon,
  title,
  sub,
  onPress,
  right,
  first,
  testID,
  danger,
}: {
  icon?: ReactNode;
  title: string;
  sub?: string;
  onPress?: () => void;
  right?: ReactNode;
  first?: boolean;
  testID?: string;
  danger?: boolean;
}) {
  const content = (pressed: boolean) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderColor: colors.line, backgroundColor: pressed ? colors.line : 'transparent' }}>
      {icon ? <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>{icon}</View> : null}
      <View style={{ flex: 1 }}>
        <Body weight="bold" size={15.5} color={danger ? colors.danger : colors.text}>
          {title}
        </Body>
        {sub ? <Small>{sub}</Small> : null}
      </View>
      {right ?? (onPress ? <ChevronRightIcon size={18} color={colors.muted} /> : null)}
    </View>
  );
  if (!onPress) return <View testID={testID}>{content(false)}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={sub ? `${title}, ${sub}` : title} onPress={onPress}>
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}
