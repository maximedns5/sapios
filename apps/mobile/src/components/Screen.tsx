import { StatusBar } from 'expo-status-bar';
import type { ReactNode, RefObject } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View, type ScrollViewInstance, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLayout } from '@/lib/layout';
import { palette, space, type Tone } from '@/lib/theme';
import { CropMarks } from './CropMarks';
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

/**
 * Page de parcours. Grand écran : colonne centrée de 600 px sous les repères de cadrage, actions placées
 * juste après le contenu (et non collées au bas d'une fenêtre de 900 px).
 */
export function Screen({ tone = 'light', scroll, header, footer, children, bottomInset = true, contentStyle, testID, overlay, scrollRef }: Props) {
  const insets = useSafeAreaInsets();
  const { wide, column } = useLayout();
  const { bg } = palette(tone);
  const bottom = bottomInset ? insets.bottom : 0;
  const inlineFooter = wide && scroll && footer;
  const footerBlock = footer ? (
    <View style={{ paddingHorizontal: inlineFooter ? 0 : space.gutter, paddingTop: inlineFooter ? space.xl : 12, paddingBottom: inlineFooter ? 0 : bottom + space.m, gap: 10 }}>
      {footer}
    </View>
  ) : null;
  return (
    <ToneProvider tone={tone}>
      <StatusBar style={tone === 'light' ? 'dark' : 'light'} />
      <View testID={testID} style={{ flex: 1, backgroundColor: bg }}>
        <View style={{ flex: 1, width: '100%', maxWidth: column, alignSelf: 'center', paddingTop: insets.top + (wide ? 40 : 0) }}>
          {header}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            {scroll ? (
              <ScrollView
                ref={scrollRef}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={[
                  { paddingHorizontal: space.gutter, paddingTop: space.m, paddingBottom: footer && !inlineFooter ? space.l : bottom + (wide ? 64 : space.xl) },
                  contentStyle,
                ]}
              >
                {children}
                {inlineFooter ? footerBlock : null}
              </ScrollView>
            ) : (
              <View style={[{ flex: 1, paddingHorizontal: space.gutter }, contentStyle]}>{children}</View>
            )}
            {inlineFooter ? null : footerBlock}
          </KeyboardAvoidingView>
        </View>
        {overlay ?? (wide ? <CropMarks /> : null)}
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
        {({ pressed, hovered }) => <Label style={{ opacity: pressed ? 0.5 : 1, textAlign: align, textDecorationLine: hovered ? 'underline' : 'none' }}>{item.label}</Label>}
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
