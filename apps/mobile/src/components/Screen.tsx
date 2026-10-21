import { StatusBar } from 'expo-status-bar';
import type { ReactNode, RefObject } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View, type ScrollViewInstance, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, space, type Tone } from '@/lib/theme';
import { Label } from './Text';
import { ToneProvider, useTone } from './Tone';

type Props = {
  tone?: Tone;
  scroll?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Ajoute la marge basse de sécurité (désactiver sous une barre d'onglets). */
  bottomInset?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
  overlay?: ReactNode;
  scrollRef?: RefObject<ScrollViewInstance | null>;
};

export function Screen({ tone = 'light', scroll, header, footer, children, bottomInset = true, contentStyle, testID, overlay, scrollRef }: Props) {
  const insets = useSafeAreaInsets();
  const { bg } = palette(tone);
  const bottom = bottomInset ? insets.bottom : 0;
  return (
    <ToneProvider tone={tone}>
      <StatusBar style={tone === 'light' ? 'dark' : 'light'} />
      <View testID={testID} style={{ flex: 1, backgroundColor: bg }}>
        <View style={{ flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', paddingTop: insets.top }}>
          {header}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            {scroll ? (
              <ScrollView
                ref={scrollRef}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={[
                  { paddingHorizontal: space.gutter, paddingTop: space.m, paddingBottom: footer ? space.l : bottom + space.xl },
                  contentStyle,
                ]}
              >
                {children}
              </ScrollView>
            ) : (
              <View style={[{ flex: 1, paddingHorizontal: space.gutter }, contentStyle]}>{children}</View>
            )}
            {footer ? (
              <View style={{ paddingHorizontal: space.gutter, paddingTop: 12, paddingBottom: bottom + space.m, gap: 10 }}>{footer}</View>
            ) : null}
          </KeyboardAvoidingView>
        </View>
        {overlay}
      </View>
    </ToneProvider>
  );
}

type BarItem = { label: string; onPress?: () => void; testID?: string };

/** Barre supérieure : deux étiquettes mono, comme l'en-tête « Étape 01 / 01 — Vérification obligatoire ». */
export function TopBar({ left, right, center }: { left?: BarItem | string; right?: BarItem | string; center?: string }) {
  const render = (item: BarItem | string | undefined, align: 'left' | 'right') => {
    if (!item) return <View style={{ minWidth: 40 }} />;
    if (typeof item === 'string') return <Label style={{ textAlign: align }}>{item}</Label>;
    return (
      <Pressable testID={item.testID} onPress={item.onPress} hitSlop={12} accessibilityRole="button">
        {({ pressed }) => <Label style={{ opacity: pressed ? 0.5 : 1, textAlign: align }}>{item.label}</Label>}
      </Pressable>
    );
  };
  return (
    <View
      style={{
        height: 52,
        paddingHorizontal: space.gutter,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      {render(left, 'left')}
      {center ? <Label style={{ flexShrink: 1 }}>{center}</Label> : null}
      {render(right, 'right')}
    </View>
  );
}

/** Filet horizontal pleine largeur. */
export function Rule({ weight = 1.5, style }: { weight?: number; style?: StyleProp<ViewStyle> }) {
  const { fg } = useTone();
  return <View style={[{ height: weight, backgroundColor: fg }, style]} />;
}
