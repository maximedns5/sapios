import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { INK, PAPER } from '@/lib/theme';
import { tapFeedback } from './motion';
import { Label } from './Text';

const LABELS: Record<string, string> = { feed: 'Découverte', likes: 'Likes', messages: 'Messages', account: 'Compte' };

/** Barre d'onglets : étiquettes mono, onglet actif inversé. */
export function TabBar({ state, emitter, navigateToTab, descriptors, badges }: BottomTabBarProps & { badges?: Record<string, number> }) {
  const insets = useSafeAreaInsets();
  const routes = state.routes.filter((r) => {
    const options = descriptors[r.key]?.options as { href?: unknown } | undefined;
    return options?.href !== null && LABELS[r.name];
  });
  return (
    <View style={{ backgroundColor: INK, paddingBottom: insets.bottom }}>
      <View style={{ flexDirection: 'row', width: '100%', maxWidth: 560, alignSelf: 'center', padding: 6, gap: 6 }}>
        {routes.map((route) => {
          const focused = state.routes[state.index]?.key === route.key;
          const badge = badges?.[route.name] ?? 0;
          return (
            <Pressable
              key={route.key}
              testID={`tab-${route.name}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              style={{ flex: 1 }}
              onPress={() => {
                tapFeedback();
                const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigateToTab(route.key);
              }}
            >
              {({ pressed }) => (
                <View
                  style={{
                    height: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6,
                    backgroundColor: focused ? PAPER : INK,
                    opacity: pressed && !focused ? 0.6 : 1,
                  }}
                >
                  <Label size={9.5} color={focused ? INK : PAPER} numberOfLines={1}>
                    {LABELS[route.name]}
                  </Label>
                  {badge > 0 ? (
                    <View style={{ minWidth: 16, height: 16, paddingHorizontal: 3, backgroundColor: focused ? INK : PAPER, alignItems: 'center', justifyContent: 'center' }}>
                      <Label size={9} color={focused ? PAPER : INK} style={{ letterSpacing: 0 }}>
                        {badge > 9 ? '9+' : badge}
                      </Label>
                    </View>
                  ) : null}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
