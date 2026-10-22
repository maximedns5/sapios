import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, View, type AccessibilityActionEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { alpha, colors, ease, radius, shadow } from '@/lib/theme';
import { CheckIcon } from './Icons';
import { haptic, PopIn } from './motion';
import { Body, Label, Small } from './Text';

/** Grande carte de choix (onboarding) : cochée = teinte d'accent, filet d'accent, coche qui surgit. */
export function OptionCard({
  label,
  hint,
  active,
  onPress,
  testID,
  multiple,
}: {
  label: string;
  hint?: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
  /** Choix multiple (case à cocher) plutôt qu'exclusif (bouton radio). */
  multiple?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: active }}
      accessibilityLabel={hint ? `${label}, ${hint}` : label}
      onPress={() => {
        haptic.selection();
        onPress();
      }}
    >
      {({ pressed, hovered }) => (
        <View
          style={{
            minHeight: 64,
            paddingLeft: 20,
            paddingRight: 18,
            paddingVertical: 12,
            borderRadius: 20,
            borderWidth: 2,
            borderColor: active ? colors.accent : hovered ? colors.disabled : colors.line,
            backgroundColor: active ? alpha(colors.accent, 0.08) : colors.bg,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Body weight="bold" size={17}>
              {label}
            </Body>
            {hint ? <Small>{hint}</Small> : null}
          </View>
          {active ? (
            <PopIn duration={400}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                <CheckIcon size={15} stroke={3} color="#FFFFFF" />
              </View>
            </PopIn>
          ) : (
            <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.disabled }} />
          )}
        </View>
      )}
    </Pressable>
  );
}

/** Pastille à bascule (sujets, critères, motifs courts). */
export function Chip({ label, active, onPress, testID, disabled }: { label: string; active: boolean; onPress: () => void; testID?: string; disabled?: boolean }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        haptic.selection();
        onPress();
      }}
    >
      {({ pressed }) => (
        <View
          style={{
            minHeight: 46,
            paddingHorizontal: 18,
            borderRadius: radius.pill,
            borderWidth: 2,
            borderColor: active ? colors.accent : colors.surface,
            backgroundColor: active ? colors.accent : colors.surface,
            justifyContent: 'center',
            opacity: disabled ? 0.45 : 1,
            transform: [{ scale: pressed ? 0.96 : active ? 1.03 : 1 }],
          }}
        >
          <Body weight="bold" size={15} color={active ? '#FFFFFF' : colors.text}>
            {label}
          </Body>
        </View>
      )}
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{children}</View>;
}

/** Case à cocher explicite (jamais pré-cochée pour un consentement). */
export function Checkbox({ checked, onChange, label, testID }: { checked: boolean; onChange: (v: boolean) => void; label: string; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => {
        haptic.selection();
        onChange(!checked);
      }}
      style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start', minHeight: 44 }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          borderWidth: 2,
          borderColor: checked ? colors.accent : colors.disabled,
          backgroundColor: checked ? colors.accent : colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        {checked ? <CheckIcon size={16} stroke={3} color="#FFFFFF" /> : null}
      </View>
      <Body style={{ flex: 1 }} size={15}>
        {label}
      </Body>
    </Pressable>
  );
}

/** Interrupteur (visibilité, badge). */
export function Switch({ value, onChange, label, testID, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; testID?: string; disabled?: boolean }) {
  const x = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    x.value = withTiming(value ? 1 : 0, { duration: 220, easing: ease.out });
  }, [value, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * 20 }] }));
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        haptic.selection();
        onChange(!value);
      }}
      hitSlop={8}
    >
      <View style={{ width: 52, height: 32, borderRadius: 16, backgroundColor: value ? colors.accent : colors.disabled, padding: 3, opacity: disabled ? 0.5 : 1 }}>
        <Animated.View style={[{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF', boxShadow: shadow.soft }, knob]} />
      </View>
    </Pressable>
  );
}

const THUMB = 30;

/**
 * Curseur à deux poignées (âge recherché) : glisser, ou flèches du clavier et actions
 * d'accessibilité (« augmenter », « diminuer ») sur chaque poignée.
 */
export function RangeSlider({
  min,
  max,
  low,
  high,
  onChange,
  label,
  unit = 'ans',
  testID,
}: {
  min: number;
  max: number;
  low: number;
  high: number;
  onChange: (low: number, high: number) => void;
  label: string;
  unit?: string;
  testID?: string;
}) {
  const [width, setWidth] = useState(0);
  const track = Math.max(1, width - THUMB);
  const lowX = useSharedValue(0);
  const highX = useSharedValue(0);
  const startLow = useSharedValue(0);
  const startHigh = useSharedValue(0);
  const span = max - min;

  useEffect(() => {
    lowX.value = ((low - min) / span) * track;
    highX.value = ((high - min) / span) * track;
  }, [high, highX, low, lowX, min, span, track]);

  const emit = (l: number, h: number) => onChange(l, h);

  const lowPan = usePanGesture({
    hitSlop: 10,
    onBegin: () => {
      'worklet';
      startLow.value = lowX.value;
    },
    onUpdate: (e) => {
      'worklet';
      const x = Math.min(Math.max(startLow.value + e.translationX, 0), highX.value);
      lowX.value = x;
      const v = Math.round(min + (x / track) * span);
      scheduleOnRN(emit, v, Math.round(min + (highX.value / track) * span));
    },
  });
  const highPan = usePanGesture({
    hitSlop: 10,
    onBegin: () => {
      'worklet';
      startHigh.value = highX.value;
    },
    onUpdate: (e) => {
      'worklet';
      const x = Math.max(Math.min(startHigh.value + e.translationX, track), lowX.value);
      highX.value = x;
      const v = Math.round(min + (x / track) * span);
      scheduleOnRN(emit, Math.round(min + (lowX.value / track) * span), v);
    },
  });

  const lowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: lowX.value }] }));
  const highStyle = useAnimatedStyle(() => ({ transform: [{ translateX: highX.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ left: lowX.value + THUMB / 2, width: Math.max(0, highX.value - lowX.value) }));

  const step = (which: 'low' | 'high', delta: number) => {
    if (which === 'low') onChange(Math.min(Math.max(low + delta, min), high), high);
    else onChange(low, Math.max(Math.min(high + delta, max), low));
    haptic.selection();
  };

  const thumb = (which: 'low' | 'high') => {
    const value = which === 'low' ? low : high;
    const onKeyDown = (e: { nativeEvent: { key: string }; preventDefault?: () => void }) => {
      const key = e.nativeEvent.key;
      const delta = key === 'ArrowRight' || key === 'ArrowUp' ? 1 : key === 'ArrowLeft' || key === 'ArrowDown' ? -1 : 0;
      if (!delta) return;
      e.preventDefault?.();
      step(which, delta);
    };
    return (
      <GestureDetector gesture={which === 'low' ? lowPan : highPan}>
        <Animated.View
          testID={testID ? `${testID}-${which}` : undefined}
          accessible
          focusable
          accessibilityRole="adjustable"
          accessibilityLabel={`${label}, ${which === 'low' ? 'minimum' : 'maximum'}`}
          accessibilityValue={{ min, max, now: value, text: `${value} ${unit}` }}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={`${value} ${unit}`}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e: AccessibilityActionEvent) => step(which, e.nativeEvent.actionName === 'increment' ? 1 : -1)}
          {...(Platform.OS === 'web' ? ({ onKeyDown, tabIndex: 0 } as object) : {})}
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              width: THUMB,
              height: THUMB,
              borderRadius: THUMB / 2,
              backgroundColor: '#FFFFFF',
              borderWidth: 2,
              borderColor: colors.accent,
              boxShadow: shadow.button,
              cursor: 'grab',
            } as object,
            which === 'low' ? lowStyle : highStyle,
          ]}
        />
      </GestureDetector>
    );
  };

  return (
    <View style={{ gap: 10 }} testID={testID}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Label>{label}</Label>
        <Body weight="extrabold" size={18} testID={testID ? `${testID}-value` : undefined}>
          {low} – {high} {unit}
        </Body>
      </View>
      <View style={{ height: THUMB, justifyContent: 'center' }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={{ position: 'absolute', left: THUMB / 2, right: THUMB / 2, height: 6, borderRadius: 3, backgroundColor: colors.line }} />
        <Animated.View style={[{ position: 'absolute', height: 6, borderRadius: 3, backgroundColor: colors.accent }, fillStyle]} />
        {width > 0 ? (
          <>
            {thumb('low')}
            {thumb('high')}
          </>
        ) : null}
      </View>
    </View>
  );
}

/** Barre de progression arrondie (étapes, complétion), animée vers sa valeur. */
export function ProgressBar({ value, label, height = 6 }: { value: number; label?: string; height?: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withTiming(Math.min(Math.max(value, 0), 1), { duration: 700, easing: ease.out });
  }, [v, value]);
  const fill = useAnimatedStyle(() => ({ width: `${v.value * 100}%` }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      style={{ flex: 1, height, borderRadius: height / 2, backgroundColor: colors.line, overflow: 'hidden' }}
    >
      <Animated.View style={[{ height: '100%', borderRadius: height / 2, backgroundColor: colors.accent }, fill]} />
    </View>
  );
}

