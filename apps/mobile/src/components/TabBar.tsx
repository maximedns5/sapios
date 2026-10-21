import { levelLabel } from '@sapios/shared';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/lib/app-state';
import { SIDE_NAV, useLayout } from '@/lib/layout';
import { alpha, INK, PAPER } from '@/lib/theme';
import { tapFeedback } from './motion';
import { Label } from './Text';
import { Wordmark } from './Wordmark';

const LABELS: Record<string, string> = { feed: 'Découverte', likes: 'Likes', messages: 'Messages', account: 'Compte' };
const TIER_LABEL: Record<string, string> = { unlimited: 'Accès illimité', standard: 'Accès toléré', waitlist: 'Liste d’attente', refused: 'Refusé' };

type Props = BottomTabBarProps & {
  /** Compteur affiché sur l'onglet (messages non lus). */
  badges?: Record<string, number>;
  /** Indicateur sans nombre (nouveau match). */
  marks?: Record<string, boolean>;
};

/** Barre d'onglets en bas sur téléphone, colonne de navigation à gauche sur grand écran. */
export function TabBar(props: Props) {
  const { wide } = useLayout();
  return wide ? <SideNav {...props} /> : <BottomBar {...props} />;
}

function useTabs({ state, emitter, navigateToTab, descriptors }: Props) {
  const routes = state.routes.filter((r) => {
    const options = descriptors[r.key]?.options as { href?: unknown } | undefined;
    return options?.href !== null && LABELS[r.name];
  });
  const current = state.routes[state.index]?.key;
  const press = (key: string) => {
    tapFeedback();
    const event = emitter.emit({ type: 'tabPress', target: key, canPreventDefault: true });
    if (key !== current && !event.defaultPrevented) navigateToTab(key);
  };
  return { routes, current, press };
}

function Count({ n, inverted }: { n: number; inverted: boolean }) {
  return (
    <View testID="tab-badge" style={{ minWidth: 16, height: 16, paddingHorizontal: 3, backgroundColor: inverted ? INK : PAPER, alignItems: 'center', justifyContent: 'center' }}>
      <Label size={9} color={inverted ? PAPER : INK} style={{ letterSpacing: 0 }}>
        {n > 9 ? '9+' : n}
      </Label>
    </View>
  );
}

function BottomBar(props: Props) {
  const insets = useSafeAreaInsets();
  const { routes, current, press } = useTabs(props);
  return (
    <View style={{ backgroundColor: INK, paddingBottom: insets.bottom }}>
      <View role="tablist" style={{ flexDirection: 'row', width: '100%', maxWidth: 560, alignSelf: 'center', padding: 6, gap: 6 }}>
        {routes.map((route) => {
          const focused = current === route.key;
          const badge = props.badges?.[route.name] ?? 0;
          const mark = props.marks?.[route.name];
          return (
            <Pressable
              key={route.key}
              testID={`tab-${route.name}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={`${LABELS[route.name]}${badge ? `, ${badge} non lu${badge > 1 ? 's' : ''}` : ''}${mark ? ', nouveau match' : ''}`}
              style={{ flex: 1 }}
              onPress={() => press(route.key)}
            >
              {({ pressed, hovered }) => (
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
                  <Label size={9.5} color={focused ? INK : PAPER} numberOfLines={1} style={{ textDecorationLine: hovered && !focused ? 'underline' : 'none' }}>
                    {LABELS[route.name]}
                  </Label>
                  {badge > 0 ? <Count n={badge} inverted={focused} /> : null}
                  {/* Nouveau match : repère d'angle, il tient à côté du compteur même avec quatre onglets. */}
                  {mark ? <View testID="tab-new" style={{ position: 'absolute', top: 5, right: 5, width: 7, height: 7, backgroundColor: focused ? INK : PAPER }} /> : null}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SideNav(props: Props) {
  const { state: me } = useApp();
  const { routes, current, press } = useTabs(props);
  return (
    <View testID="side-nav" style={{ width: SIDE_NAV, backgroundColor: INK, paddingTop: 30, paddingBottom: 24, borderRightWidth: 1.5, borderColor: INK }}>
      <View style={{ paddingHorizontal: 24, gap: 8 }}>
        <Wordmark size={34} color={PAPER} />
        <Label size={9} color={PAPER} style={{ opacity: 0.6 }}>
          Application de rencontre
        </Label>
      </View>
      <View style={{ height: 1.5, backgroundColor: PAPER, marginHorizontal: 24, marginTop: 22, marginBottom: 14 }} />
      <View role="tablist" aria-orientation="vertical" style={{ gap: 4, paddingHorizontal: 12 }}>
        {routes.map((route) => {
          const focused = current === route.key;
          const badge = props.badges?.[route.name] ?? 0;
          const mark = props.marks?.[route.name];
          return (
            <Pressable
              key={route.key}
              testID={`tab-${route.name}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={`${LABELS[route.name]}${badge ? `, ${badge} non lu${badge > 1 ? 's' : ''}` : ''}${mark ? ', nouveau match' : ''}`}
              onPress={() => press(route.key)}
            >
              {({ pressed, hovered }) => (
                <View
                  style={{
                    height: 46,
                    paddingHorizontal: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    backgroundColor: focused ? PAPER : INK,
                    opacity: pressed && !focused ? 0.6 : 1,
                  }}
                >
                  <Label size={11} color={focused ? INK : PAPER} style={{ flex: 1, textDecorationLine: hovered && !focused ? 'underline' : 'none' }}>
                    {LABELS[route.name]}
                  </Label>
                  {mark ? (
                    <View testID="tab-new" style={{ borderWidth: 1, borderColor: focused ? INK : PAPER, paddingHorizontal: 4, paddingVertical: 1 }}>
                      <Label size={8} color={focused ? INK : PAPER}>
                        Nouveau
                      </Label>
                    </View>
                  ) : null}
                  {badge > 0 ? <Count n={badge} inverted={focused} /> : null}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      <View style={{ flex: 1 }} />
      {me?.tier ? (
        <View style={{ paddingHorizontal: 24, gap: 6 }}>
          <View style={{ height: 1, backgroundColor: alpha(PAPER, 0.35), marginBottom: 8 }} />
          <Label size={9.5} color={PAPER}>
            {TIER_LABEL[me.tier] ?? me.tier}
            {me.level ? ` · ${levelLabel(me.level)}` : ''}
          </Label>
          {me.can_browse ? (
            <Label size={9.5} color={PAPER} style={{ opacity: 0.65 }}>
              {me.daily_like_quota == null ? 'Likes illimités' : `${me.daily_like_quota} likes par jour`}
            </Label>
          ) : null}
          {me.profile_status === 'paused' ? (
            <Label size={9.5} color={PAPER} style={{ opacity: 0.65 }}>
              Profil en pause
            </Label>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
