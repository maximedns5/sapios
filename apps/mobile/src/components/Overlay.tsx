import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, SlideInDown, SlideOutDown, SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLayout } from '@/lib/layout';
import { alpha, fonts, INK, palette, space } from '@/lib/theme';
import { Button } from './Button';
import { Body, Label, Title } from './Text';
import { ToneProvider } from './Tone';

type ConfirmOptions = {
  label?: string;
  title: string;
  message?: string;
  confirm?: string;
  cancel?: string;
  /** Saisie exacte exigée avant confirmation (double confirmation). */
  typeToConfirm?: string;
};

type SheetAction = { label: string; onPress: () => void; testID?: string };

/** Notification dans l'app (le web n'a pas de push) : nouveau match, nouveau message. */
export type BannerOptions = { label: string; title: string; message?: string; action?: { label: string; onPress: () => void }; testID?: string };

type OverlayContext = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  sheet: (title: string, actions: SheetAction[]) => void;
  toast: (message: string) => void;
  banner: (opts: BannerOptions) => void;
};

const Ctx = createContext<OverlayContext | null>(null);

type DialogState = ConfirmOptions & { resolve: (v: boolean) => void };

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [sheetState, setSheetState] = useState<{ title: string; actions: SheetAction[] } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bannerState, setBannerState] = useState<(BannerOptions & { id: number }) | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...opts, resolve })),
    [],
  );
  const sheet = useCallback((title: string, actions: SheetAction[]) => setSheetState({ title, actions }), []);
  const toast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(message);
    toastTimer.current = setTimeout(() => setToastMessage(null), 3200);
  }, []);
  const banner = useCallback((opts: BannerOptions) => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBannerState({ ...opts, id: Date.now() });
    bannerTimer.current = setTimeout(() => setBannerState(null), 7000);
  }, []);

  // Échap ferme la boîte de dialogue ou la feuille d'actions.
  useEffect(() => {
    if (Platform.OS !== 'web' || (!dialog && !sheetState)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (dialog) {
        dialog.resolve(false);
        setDialog(null);
      } else setSheetState(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, sheetState]);

  const value = useMemo(() => ({ confirm, sheet, toast, banner }), [confirm, sheet, toast, banner]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {dialog ? (
        <Dialog
          state={dialog}
          onClose={(v) => {
            dialog.resolve(v);
            setDialog(null);
          }}
        />
      ) : null}
      {sheetState ? <Sheet state={sheetState} onClose={() => setSheetState(null)} /> : null}
      {toastMessage ? <Toast message={toastMessage} onPress={() => setToastMessage(null)} /> : null}
      {bannerState ? <Banner key={bannerState.id} state={bannerState} onClose={() => setBannerState(null)} /> : null}
    </Ctx.Provider>
  );
}

export function useOverlay(): OverlayContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useOverlay hors de OverlayProvider');
  return ctx;
}

function Backdrop({ onPress }: { onPress: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={[StyleSheet.absoluteFill, { backgroundColor: alpha(INK, 0.72) }]}>
      <Pressable accessibilityLabel="Fermer" tabIndex={-1} style={[StyleSheet.absoluteFill, { cursor: 'default' } as object]} onPress={onPress} />
    </Animated.View>
  );
}

/** Feuille montante sur téléphone, fenêtre centrée sur grand écran. */
function useModalFrame(maxWide: number) {
  const { wide } = useLayout();
  return {
    wide,
    container: { zIndex: 1000, justifyContent: wide ? 'center' : 'flex-end' } as const,
    entering: wide ? FadeInDown.duration(240) : SlideInDown.duration(360),
    exiting: wide ? FadeOutDown.duration(150) : SlideOutDown.duration(210),
    box: { width: '100%', maxWidth: wide ? maxWide : 560, alignSelf: 'center' } as const,
  };
}

function Dialog({ state, onClose }: { state: DialogState; onClose: (v: boolean) => void }) {
  const insets = useSafeAreaInsets();
  const frame = useModalFrame(520);
  const [typed, setTyped] = useState('');
  const { fg, bg } = palette('light');
  const ok = !state.typeToConfirm || typed.trim().toUpperCase() === state.typeToConfirm.toUpperCase();
  return (
    <View style={[StyleSheet.absoluteFill, frame.container]}>
      <Backdrop onPress={() => onClose(false)} />
      <Animated.View entering={frame.entering} exiting={frame.exiting} style={frame.box}>
        <ToneProvider tone="light">
          <View
            testID="dialog"
            accessibilityViewIsModal
            role="dialog"
            aria-modal
            style={{
              backgroundColor: bg,
              borderColor: fg,
              borderTopWidth: 1.5,
              borderWidth: frame.wide ? 1.5 : 0,
              padding: frame.wide ? 32 : space.gutter,
              paddingBottom: frame.wide ? 32 : insets.bottom + space.l,
              gap: 14,
            }}
          >
            {state.label ? <Label>{state.label}</Label> : null}
            <Title size={30}>{state.title}</Title>
            {state.message ? <Body>{state.message}</Body> : null}
            {state.typeToConfirm ? (
              <View style={{ gap: 6 }}>
                <Label>Tapez « {state.typeToConfirm} » pour confirmer</Label>
                <TextInput
                  testID="dialog-input"
                  value={typed}
                  onChangeText={setTyped}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoFocus={frame.wide}
                  onSubmitEditing={() => ok && onClose(true)}
                  style={[
                    { borderBottomWidth: 1.5, borderColor: fg, fontFamily: fonts.mono, fontSize: 18, letterSpacing: 3.6, paddingVertical: 10, color: fg },
                    Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
                  ]}
                />
              </View>
            ) : null}
            <View style={{ gap: 10, marginTop: 6, flexDirection: frame.wide ? 'row-reverse' : 'column' }}>
              <Button testID="dialog-confirm" label={state.confirm ?? 'Confirmer'} disabled={!ok} onPress={() => onClose(true)} style={frame.wide ? { flex: 1 } : undefined} />
              <Button testID="dialog-cancel" label={state.cancel ?? 'Annuler'} variant="outline" onPress={() => onClose(false)} style={frame.wide ? { flex: 1 } : undefined} />
            </View>
          </View>
        </ToneProvider>
      </Animated.View>
    </View>
  );
}

function Sheet({ state, onClose }: { state: { title: string; actions: SheetAction[] }; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const frame = useModalFrame(440);
  const { fg, bg } = palette('dark');
  return (
    <View style={[StyleSheet.absoluteFill, frame.container]}>
      <Backdrop onPress={onClose} />
      <Animated.View entering={frame.entering} exiting={frame.exiting} style={frame.box}>
        <ToneProvider tone="dark">
          <View role="dialog" aria-modal style={{ backgroundColor: bg, paddingTop: space.l, paddingBottom: frame.wide ? space.l : insets.bottom + space.m }}>
            <Label style={{ paddingHorizontal: space.gutter, marginBottom: 12, opacity: 0.6 }}>{state.title}</Label>
            {state.actions.map((action) => (
              <Pressable
                key={action.label}
                testID={action.testID}
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  setTimeout(action.onPress, 60);
                }}
              >
                {({ pressed, hovered }) => (
                  <View style={{ paddingHorizontal: space.gutter, paddingVertical: 18, backgroundColor: pressed || hovered ? fg : bg, borderTopWidth: 1, borderColor: alpha(fg, 0.25) }}>
                    <Title size={24} color={pressed || hovered ? bg : fg}>
                      {action.label}
                    </Title>
                  </View>
                )}
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" onPress={onClose} style={{ marginHorizontal: space.gutter, marginTop: 18, alignSelf: 'flex-start' }}>
              {({ hovered }) => <Label style={{ textDecorationLine: hovered ? 'underline' : 'none' }}>{frame.wide ? 'Fermer · Échap' : 'Fermer'}</Label>}
            </Pressable>
          </View>
        </ToneProvider>
      </Animated.View>
    </View>
  );
}

function Toast({ message, onPress }: { message: string; onPress: () => void }) {
  const insets = useSafeAreaInsets();
  const { fg, bg } = palette('dark');
  return (
    <Animated.View
      entering={SlideInUp.duration(320)}
      exiting={SlideOutUp.duration(200)}
      style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, zIndex: 1100, alignItems: 'center' }}
    >
      <Pressable testID="toast" onPress={onPress} style={{ backgroundColor: bg, borderWidth: 1.5, borderColor: fg, paddingHorizontal: 16, paddingVertical: 12, width: '100%', maxWidth: 536 }}>
        <Label color={fg}>{message}</Label>
      </Pressable>
    </Animated.View>
  );
}

/** Bandeau de notification : en haut sur téléphone, en haut à droite sur grand écran. */
function Banner({ state, onClose }: { state: BannerOptions; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { wide } = useLayout();
  const { fg, bg } = palette('dark');
  const act = () => {
    onClose();
    state.action?.onPress();
  };
  return (
    <Animated.View
      entering={wide ? FadeInDown.duration(280) : SlideInUp.duration(320)}
      exiting={wide ? FadeOut.duration(160) : SlideOutUp.duration(200)}
      style={
        wide
          ? { position: 'absolute', top: 24, right: 24, width: 380, zIndex: 1200 }
          : { position: 'absolute', top: insets.top + 8, left: 12, right: 12, zIndex: 1200, alignItems: 'center' }
      }
    >
      <ToneProvider tone="dark">
        <View
          testID={state.testID ?? 'banner'}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{ backgroundColor: bg, borderWidth: 1.5, borderColor: fg, width: '100%', maxWidth: 536, flexDirection: 'row' }}
        >
          <Pressable testID="banner-action" accessibilityRole="button" onPress={act} style={{ flex: 1 }}>
            {({ hovered }) => (
              <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 4 }}>
                <Label size={9.5} style={{ opacity: 0.7 }}>
                  {state.label}
                </Label>
                <Title size={22} numberOfLines={1}>
                  {state.title}
                </Title>
                {state.message ? (
                  <Body size={14} numberOfLines={2} style={{ opacity: 0.85 }}>
                    {state.message}
                  </Body>
                ) : null}
                {state.action ? (
                  <Label size={10} style={{ marginTop: 4, textDecorationLine: hovered ? 'underline' : 'none' }}>
                    {state.action.label} →
                  </Label>
                ) : null}
              </View>
            )}
          </Pressable>
          <Pressable testID="banner-close" accessibilityRole="button" accessibilityLabel="Fermer la notification" onPress={onClose} hitSlop={6}>
            {({ hovered, pressed }) => (
              <View style={{ width: 40, alignItems: 'center', paddingTop: 12, opacity: hovered || pressed ? 1 : 0.6 }}>
                <Label size={12}>✕</Label>
              </View>
            )}
          </Pressable>
        </View>
      </ToneProvider>
    </Animated.View>
  );
}
