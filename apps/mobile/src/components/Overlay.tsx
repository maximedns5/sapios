import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, SlideInDown, SlideInUp, SlideOutDown, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius, shadow, space } from '@/lib/theme';
import { Button, IconButton } from './Button';
import { CrossIcon, HeartIcon } from './Icons';
import { Body, Small, Title } from './Text';
import { ToneProvider } from './Tone';

type ConfirmOptions = {
  label?: string;
  title: string;
  message?: string;
  confirm?: string;
  cancel?: string;
  /** Action irréversible : bouton de confirmation rouge. */
  destructive?: boolean;
  /** Saisie exacte exigée avant confirmation (double confirmation). */
  typeToConfirm?: string;
};

type SheetAction = { label: string; onPress: () => void; testID?: string; destructive?: boolean };

/** Notification dans l'app (le web n'a pas de push) : nouveau match, nouveau message. */
export type BannerOptions = { label: string; title: string; message?: string; action?: { label: string; onPress: () => void }; testID?: string };

type ToastOptions = { icon?: 'heart' };

type OverlayContext = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  sheet: (title: string, actions: SheetAction[]) => void;
  toast: (message: string, opts?: ToastOptions) => void;
  banner: (opts: BannerOptions) => void;
};

const Ctx = createContext<OverlayContext | null>(null);

type DialogState = ConfirmOptions & { resolve: (v: boolean) => void };

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [sheetState, setSheetState] = useState<{ title: string; actions: SheetAction[] } | null>(null);
  const [toastState, setToastState] = useState<{ message: string; icon?: 'heart'; id: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bannerState, setBannerState] = useState<(BannerOptions & { id: number }) | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...opts, resolve })), []);
  const sheet = useCallback((title: string, actions: SheetAction[]) => setSheetState({ title, actions }), []);
  const toast = useCallback((message: string, opts?: ToastOptions) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastState({ message, icon: opts?.icon, id: Date.now() });
    toastTimer.current = setTimeout(() => setToastState(null), 2800);
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
      {toastState ? <Toast key={toastState.id} message={toastState.message} icon={toastState.icon} onPress={() => setToastState(null)} /> : null}
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
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(26,25,24,0.45)' }]}>
      <Pressable accessibilityLabel="Fermer" tabIndex={-1} style={[StyleSheet.absoluteFill, { cursor: 'default' } as object]} onPress={onPress} />
    </Animated.View>
  );
}

/** Feuille montante : coins de 28 px, poignée, contenu blanc. */
function SheetFrame({ children, testID }: { children: ReactNode; testID?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View entering={SlideInDown.duration(380)} exiting={SlideOutDown.duration(220)} style={{ width: '100%' }}>
      <ToneProvider tone="light">
        <View
          testID={testID}
          accessibilityViewIsModal
          role="dialog"
          aria-modal
          style={{ backgroundColor: colors.bg, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingHorizontal: space.gutter, paddingTop: 12, paddingBottom: insets.bottom + space.l, gap: 14 }}
        >
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.disabled }} />
          {children}
        </View>
      </ToneProvider>
    </Animated.View>
  );
}

function Dialog({ state, onClose }: { state: DialogState; onClose: (v: boolean) => void }) {
  const [typed, setTyped] = useState('');
  const ok = !state.typeToConfirm || typed.trim().toUpperCase() === state.typeToConfirm.toUpperCase();
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 1000, justifyContent: 'flex-end' }]}>
      <Backdrop onPress={() => onClose(false)} />
      <SheetFrame testID="dialog">
        {state.label ? (
          <Body weight="bold" size={14} color={state.destructive ? colors.danger : colors.accent}>
            {state.label}
          </Body>
        ) : null}
        <Title size={24}>{state.title}</Title>
        {state.message ? <Body secondary>{state.message}</Body> : null}
        {state.typeToConfirm ? (
          <View style={{ gap: 8 }}>
            <Body weight="semibold" size={14}>
              Tapez « {state.typeToConfirm} » pour confirmer
            </Body>
            <TextInput
              testID="dialog-input"
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel={`Tapez ${state.typeToConfirm}`}
              onSubmitEditing={() => ok && onClose(true)}
              style={[
                { height: 56, borderWidth: 1.5, borderColor: colors.disabled, borderRadius: radius.field, paddingHorizontal: 16, fontFamily: fonts.bold, fontSize: 18, letterSpacing: 2, color: colors.text },
                Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
              ]}
            />
          </View>
        ) : null}
        <View style={{ gap: 6, marginTop: 4 }}>
          <Button testID="dialog-confirm" label={state.confirm ?? 'Confirmer'} variant={state.destructive ? 'destructive' : 'primary'} disabled={!ok} onPress={() => onClose(true)} />
          <Button testID="dialog-cancel" label={state.cancel ?? 'Annuler'} variant="ghost" onPress={() => onClose(false)} />
        </View>
      </SheetFrame>
    </View>
  );
}

function Sheet({ state, onClose }: { state: { title: string; actions: SheetAction[] }; onClose: () => void }) {
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 1000, justifyContent: 'flex-end' }]}>
      <Backdrop onPress={onClose} />
      <SheetFrame>
        <Small weight="semibold" align="center">
          {state.title}
        </Small>
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, overflow: 'hidden' }}>
          {state.actions.map((action, i) => (
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
                <View style={{ minHeight: 56, paddingHorizontal: 20, justifyContent: 'center', borderTopWidth: i ? 1 : 0, borderColor: colors.line, backgroundColor: pressed || hovered ? colors.line : 'transparent' }}>
                  <Body weight="bold" size={16.5} color={action.destructive ? colors.danger : colors.text}>
                    {action.label}
                  </Body>
                </View>
              )}
            </Pressable>
          ))}
        </View>
        <Button label="Annuler" variant="secondary" onPress={onClose} />
      </SheetFrame>
    </View>
  );
}

function Toast({ message, icon, onPress }: { message: string; icon?: 'heart'; onPress: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      entering={FadeInDown.duration(320)}
      exiting={FadeOutDown.duration(200)}
      pointerEvents="box-none"
      style={{ position: 'absolute', bottom: insets.bottom + 92, left: 16, right: 16, zIndex: 1100, alignItems: 'center' }}
    >
      <Pressable
        testID="toast"
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        onPress={onPress}
        style={{ backgroundColor: colors.text, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 480, boxShadow: shadow.card }}
      >
        {icon === 'heart' ? <HeartIcon size={18} color={colors.accent} filled /> : null}
        <Body weight="semibold" size={14.5} color="#FFFFFF" style={{ flexShrink: 1 }}>
          {message}
        </Body>
      </Pressable>
    </Animated.View>
  );
}

/** Bandeau de notification : carte blanche en haut, action et fermeture. */
function Banner({ state, onClose }: { state: BannerOptions; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const act = () => {
    onClose();
    state.action?.onPress();
  };
  return (
    <Animated.View
      entering={SlideInUp.duration(360)}
      exiting={SlideOutUp.duration(220)}
      style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, zIndex: 1200, alignItems: 'center' }}
    >
      <ToneProvider tone="light">
        <View
          testID={state.testID ?? 'banner'}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{ backgroundColor: colors.bg, borderRadius: radius.card, width: '100%', maxWidth: 496, flexDirection: 'row', alignItems: 'center', boxShadow: shadow.card }}
        >
          <Pressable testID="banner-action" accessibilityRole="button" onPress={act} style={{ flex: 1 }}>
            <View style={{ paddingLeft: 18, paddingVertical: 14, gap: 2 }}>
              <Body weight="bold" size={13.5} color={colors.accent}>
                {state.label}
              </Body>
              <Body weight="extrabold" size={17} numberOfLines={1}>
                {state.title}
              </Body>
              {state.message ? (
                <Body size={14.5} secondary numberOfLines={2}>
                  {state.message}
                </Body>
              ) : null}
              {state.action ? (
                <Body weight="bold" size={14} color={colors.accent} style={{ marginTop: 4 }}>
                  {state.action.label} →
                </Body>
              ) : null}
            </View>
          </Pressable>
          <IconButton testID="banner-close" label="Fermer la notification" variant="plain" onPress={onClose} style={{ marginRight: 6 }}>
            <CrossIcon size={18} color={colors.muted} />
          </IconButton>
        </View>
      </ToneProvider>
    </Animated.View>
  );
}
