import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

type OverlayContext = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  sheet: (title: string, actions: SheetAction[]) => void;
  toast: (message: string) => void;
};

const Ctx = createContext<OverlayContext | null>(null);

type DialogState = ConfirmOptions & { resolve: (v: boolean) => void };

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [sheetState, setSheetState] = useState<{ title: string; actions: SheetAction[] } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const value = useMemo(() => ({ confirm, sheet, toast }), [confirm, sheet, toast]);

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
      <Pressable accessibilityLabel="Fermer" style={StyleSheet.absoluteFill} onPress={onPress} />
    </Animated.View>
  );
}

function Dialog({ state, onClose }: { state: DialogState; onClose: (v: boolean) => void }) {
  const insets = useSafeAreaInsets();
  const [typed, setTyped] = useState('');
  const { fg } = palette('light');
  const ok = !state.typeToConfirm || typed.trim().toUpperCase() === state.typeToConfirm.toUpperCase();
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 1000, justifyContent: 'flex-end' }]}>
      <Backdrop onPress={() => onClose(false)} />
      <Animated.View
        entering={SlideInDown.duration(380)}
        exiting={SlideOutDown.duration(220)}
        style={{ width: '100%', maxWidth: 560, alignSelf: 'center' }}
      >
        <ToneProvider tone="light">
          <View
            testID="dialog"
            accessibilityViewIsModal
            style={{ backgroundColor: palette('light').bg, borderTopWidth: 1.5, borderColor: fg, padding: space.gutter, paddingBottom: insets.bottom + space.l, gap: 14 }}
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
                  style={[
                    { borderBottomWidth: 1.5, borderColor: fg, fontFamily: fonts.mono, fontSize: 18, letterSpacing: 3.6, paddingVertical: 10, color: fg },
                    Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
                  ]}
                />
              </View>
            ) : null}
            <View style={{ gap: 10, marginTop: 6 }}>
              <Button testID="dialog-confirm" label={state.confirm ?? 'Confirmer'} disabled={!ok} onPress={() => onClose(true)} />
              <Button testID="dialog-cancel" label={state.cancel ?? 'Annuler'} variant="outline" onPress={() => onClose(false)} />
            </View>
          </View>
        </ToneProvider>
      </Animated.View>
    </View>
  );
}

function Sheet({ state, onClose }: { state: { title: string; actions: SheetAction[] }; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { fg, bg } = palette('dark');
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 1000, justifyContent: 'flex-end' }]}>
      <Backdrop onPress={onClose} />
      <Animated.View entering={SlideInDown.duration(340)} exiting={SlideOutDown.duration(200)} style={{ width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        <ToneProvider tone="dark">
          <View style={{ backgroundColor: bg, paddingTop: space.l, paddingBottom: insets.bottom + space.m }}>
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
                {({ pressed }) => (
                  <View style={{ paddingHorizontal: space.gutter, paddingVertical: 18, backgroundColor: pressed ? fg : bg, borderTopWidth: 1, borderColor: alpha(fg, 0.25) }}>
                    <Title size={24} color={pressed ? bg : fg}>
                      {action.label}
                    </Title>
                  </View>
                )}
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" onPress={onClose} style={{ paddingHorizontal: space.gutter, paddingTop: 18 }}>
              <Label>Fermer</Label>
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
