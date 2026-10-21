import { Pressable, View } from 'react-native';

import { tapFeedback } from './motion';
import { CheckIcon } from './Icons';
import { Body, Label, Mono } from './Text';
import { useTone } from './Tone';

/** Option sélectionnable : active = inversion franche. */
export function Choice({ label, active, onPress, testID, flex }: { label: string; active: boolean; onPress: () => void; testID?: string; flex?: boolean }) {
  const { fg, bg } = useTone();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={flex ? { flex: 1 } : undefined}
    >
      {({ pressed }) => (
        <View
          style={{
            minHeight: 46,
            paddingHorizontal: 14,
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 1.5,
            borderColor: fg,
            backgroundColor: active || pressed ? fg : bg,
          }}
        >
          <Label color={active || pressed ? bg : fg} size={11} style={{ textAlign: 'center' }}>
            {label}
          </Label>
        </View>
      )}
    </Pressable>
  );
}

export function ChoiceRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}

/** Case à cocher explicite (jamais pré-cochée pour un consentement). */
export function Checkbox({ checked, onChange, label, testID }: { checked: boolean; onChange: (v: boolean) => void; label: string; testID?: string }) {
  const { fg, bg } = useTone();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => {
        tapFeedback();
        onChange(!checked);
      }}
      style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}
    >
      <View style={{ width: 26, height: 26, borderWidth: 1.5, borderColor: fg, backgroundColor: checked ? fg : bg, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        {checked ? <CheckIcon size={18} color={bg} /> : null}
      </View>
      <Body style={{ flex: 1 }} size={15}>
        {label}
      </Body>
    </Pressable>
  );
}

/** Sélecteur numérique − valeur +. */
export function Stepper({
  value,
  onChange,
  min,
  max,
  label,
  testID,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  label: string;
  testID?: string;
}) {
  const { fg, bg } = useTone();
  const btn = (sign: -1 | 1) => {
    const disabled = sign < 0 ? value <= min : value >= max;
    return (
      <Pressable
        testID={testID ? `${testID}-${sign < 0 ? 'minus' : 'plus'}` : undefined}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${sign < 0 ? 'moins' : 'plus'}`}
        disabled={disabled}
        onPress={() => {
          tapFeedback();
          onChange(Math.min(max, Math.max(min, value + sign)));
        }}
      >
        {({ pressed }) => (
          <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? fg : bg, opacity: disabled ? 0.3 : 1 }}>
            <Mono size={20} color={pressed ? bg : fg}>
              {sign < 0 ? '−' : '+'}
            </Mono>
          </View>
        )}
      </Pressable>
    );
  };
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Label>{label}</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: fg }}>
        {btn(-1)}
        <Mono size={20} testID={testID ? `${testID}-value` : undefined}>
          {value}
        </Mono>
        {btn(1)}
      </View>
    </View>
  );
}
