import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '@/lib/theme';
import { BriefcaseIcon, ChatIcon, ListIcon, UserIcon } from './Icons';
import { haptic } from './motion';
import { Body } from './Text';

const TABS: Record<string, { label: string; icon: (color: string) => React.ReactNode; badge: (n: number) => string }> = {
  offers: { label: 'Offres', icon: (c) => <BriefcaseIcon size={24} color={c} stroke={2} />, badge: (n) => `${n} nouvelle${n > 1 ? 's' : ''}` },
  applications: {
    label: 'Candidatures',
    icon: (c) => <ListIcon size={24} color={c} stroke={2} />,
    badge: (n) => `${n} invitation${n > 1 ? 's' : ''} ou réponse${n > 1 ? 's' : ''}`,
  },
  messages: { label: 'Messages', icon: (c) => <ChatIcon size={24} color={c} stroke={2} />, badge: (n) => `${n} non lu${n > 1 ? 's' : ''}` },
  profile: { label: 'Profil', icon: (c) => <UserIcon size={24} color={c} stroke={2} />, badge: () => '' },
};

type Props = BottomTabBarProps & {
  /** Compteur affiché sur l'onglet (messages non lus, invitations). */
  badges?: Record<string, number>;
};

/** Barre d'onglets : quatre entrées, icône et libellé, onglet actif en couleur d'accent. */
export function TabBar({ state, emitter, navigateToTab, descriptors, badges }: Props) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r) => {
    const options = descriptors[r.key]?.options as { href?: unknown } | undefined;
    return options?.href !== null && TABS[r.name];
  });
  const current = state.routes[state.index]?.key;
  const press = (key: string) => {
    haptic.selection();
    const event = emitter.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    if (key !== current && !event.defaultPrevented) navigateToTab(key);
  };

  return (
    <View role="tablist" style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, paddingTop: 8, paddingHorizontal: 6, paddingBottom: Math.max(insets.bottom, 14) }}>
      {routes.map((route) => {
        const tab = TABS[route.name];
        const focused = current === route.key;
        const badge = badges?.[route.name] ?? 0;
        const color = focused ? colors.accent : colors.muted;
        return (
          <Pressable
            key={route.key}
            testID={`tab-${route.name}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={`${tab.label}${badge ? `, ${tab.badge(badge)}` : ''}`}
            style={{ flex: 1 }}
            onPress={() => press(route.key)}
          >
            {({ pressed }) => (
              <View style={{ alignItems: 'center', gap: 4, paddingVertical: 6, transform: [{ scale: pressed ? 0.94 : 1 }] }}>
                {tab.icon(color)}
                <Body size={12} color={color} numberOfLines={1} style={{ fontFamily: focused ? fonts.bold : fonts.semibold, lineHeight: 15 }}>
                  {tab.label}
                </Body>
                {badge > 0 ? (
                  <View testID="tab-badge" style={{ position: 'absolute', top: 0, left: '50%', marginLeft: 8, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Body size={11} weight="bold" color="#FFFFFF" style={{ lineHeight: 14 }}>
                      {badge > 9 ? '9+' : badge}
                    </Body>
                  </View>
                ) : null}
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
