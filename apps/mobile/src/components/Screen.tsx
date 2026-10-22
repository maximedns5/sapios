import { StatusBar } from 'expo-status-bar';
import type { ReactNode, RefObject } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, type ScrollViewInstance, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, space, type Tone } from '@/lib/theme';
import { IconButton } from './Button';
import { ChevronLeftIcon } from './Icons';
import { Body } from './Text';
import { ToneProvider } from './Tone';

type Props = {
  tone?: Tone;
  scroll?: boolean;
  header?: ReactNode;
  /** Actions fixées en bas de page (bouton principal). */
  footer?: ReactNode;
  children: ReactNode;
  /** Ajoute la marge basse de sécurité (désactiver sous une barre d'onglets). */
  bottomInset?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
  scrollRef?: RefObject<ScrollViewInstance | null>;
  /** Décor derrière toute la page (formes d'accent), sans interaction. */
  backdrop?: ReactNode;
};

/** Page de l'app : fond blanc, en-tête, contenu (défilant ou non), actions fixées en bas. */
export function Screen({ tone = 'light', scroll, header, footer, children, bottomInset = true, contentStyle, testID, scrollRef, backdrop }: Props) {
  const insets = useSafeAreaInsets();
  const { bg } = palette(tone);
  const bottom = bottomInset ? insets.bottom : 0;
  return (
    <ToneProvider tone={tone}>
      <StatusBar style={tone === 'light' ? 'dark' : 'light'} />
      <View testID={testID} style={{ flex: 1, backgroundColor: bg, paddingTop: insets.top, overflow: 'hidden' }}>
        {backdrop ? (
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            {backdrop}
          </View>
        ) : null}
        {header}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          {scroll ? (
            <ScrollView
              ref={scrollRef}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[{ paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: footer ? space.l : bottom + space.xl, flexGrow: 1 }, contentStyle]}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[{ flex: 1, paddingHorizontal: space.gutter }, contentStyle]}>{children}</View>
          )}
          {footer ? <View style={{ paddingHorizontal: space.gutter, paddingTop: 12, paddingBottom: bottom + space.m, gap: 6, backgroundColor: bg }}>{footer}</View> : null}
        </KeyboardAvoidingView>
      </View>
    </ToneProvider>
  );
}

/** En-tête : retour rond à gauche, titre (ou logo) centré, action à droite. */
export function Header({
  onBack,
  backLabel = 'Retour',
  title,
  center,
  right,
  testID,
}: {
  onBack?: () => void;
  backLabel?: string;
  title?: string;
  center?: ReactNode;
  right?: ReactNode;
  testID?: string;
}) {
  return (
    <View testID={testID} style={{ height: 60, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      {center || title ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 64, right: 64, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          {center ?? (
            <Body weight="bold" size={17} numberOfLines={1}>
              {title}
            </Body>
          )}
        </View>
      ) : null}
      <View style={{ minWidth: 44 }}>
        {onBack ? (
          <IconButton label={backLabel} onPress={onBack} testID="header-back">
            <ChevronLeftIcon />
          </IconButton>
        ) : null}
      </View>
      <View style={{ minWidth: 44, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}
