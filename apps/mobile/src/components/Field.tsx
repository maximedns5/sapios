import { forwardRef, useState } from 'react';
import { Platform, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';

import { alpha, fonts } from '@/lib/theme';
import { Label } from './Text';
import { useTone } from './Tone';

type Props = TextInputProps & { label?: string; hint?: string; error?: string | null; counter?: boolean };

/** Champ de saisie : filet inférieur, étiquette mono ; focus et erreur par inversion du filet en bloc. */
export const Field = forwardRef<TextInputInstance, Props>(function Field({ label, hint, error, counter, style, multiline, maxLength, value, onFocus, onBlur, ...rest }, ref) {
  const { fg, bg } = useTone();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? <Label>{label}</Label> : null}
      <View
        style={{
          borderBottomWidth: focused ? 3 : 1.5,
          borderColor: fg,
          paddingBottom: focused ? 0 : 1.5,
          minHeight: multiline ? 96 : 48,
          justifyContent: 'center',
        }}
      >
        <TextInput
          ref={ref}
          placeholderTextColor={alpha(fg, 0.4)}
          selectionColor={fg}
          cursorColor={fg}
          multiline={multiline}
          maxLength={maxLength}
          value={value}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            {
              fontFamily: fonts.sans,
              fontSize: 18,
              color: fg,
              paddingVertical: 10,
              textAlignVertical: multiline ? 'top' : 'center',
              minHeight: multiline ? 96 : undefined,
            },
            Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
            style,
          ]}
          {...rest}
        />
      </View>
      {error ? (
        <View style={{ backgroundColor: fg, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' }}>
          <Label color={bg}>{error}</Label>
        </View>
      ) : hint || (counter && maxLength) ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <Label style={{ opacity: 0.6, flexShrink: 1 }}>{hint ?? ''}</Label>
          {counter && maxLength ? (
            <Label style={{ opacity: 0.6 }}>
              {(value ?? '').length}/{maxLength}
            </Label>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});
