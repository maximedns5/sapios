import { forwardRef, useState } from 'react';
import { Platform, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';

import { colors, fonts, radius } from '@/lib/theme';
import { AlertIcon } from './Icons';
import { Label, Small } from './Text';

type Props = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  counter?: boolean;
  /** Grande saisie d'onboarding (prénom) : texte extra-gras, filet inférieur d'accent. */
  big?: boolean;
};

const WEB_NO_OUTLINE = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

/** Message d'erreur sous un champ : rouge, icône, annoncé (distinct des boutons). */
export function FieldError({ message, testID }: { message: string; testID?: string }) {
  return (
    <View testID={testID} accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <AlertIcon size={16} color={colors.danger} />
      <Small weight="semibold" color={colors.danger} style={{ flexShrink: 1 }}>
        {message}
      </Small>
    </View>
  );
}

/** Champ de saisie : étiquette au-dessus, cadre arrondi, focus en accent, erreur sous le champ. */
export const Field = forwardRef<TextInputInstance, Props>(function Field({ label, hint, error, counter, big, style, multiline, maxLength, value, onFocus, onBlur, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  const border = error ? colors.danger : focused ? colors.accent : big ? colors.accent : colors.disabled;
  return (
    <View style={{ gap: 8 }}>
      {label ? <Label>{label}</Label> : null}
      <View
        style={
          big
            ? { borderBottomWidth: 2, borderColor: border, minHeight: 60, justifyContent: 'center' }
            : {
                borderWidth: focused || error ? 2 : 1.5,
                margin: focused || error ? 0 : 0.5,
                borderColor: border,
                borderRadius: radius.field,
                backgroundColor: colors.bg,
                minHeight: multiline ? 112 : 56,
                justifyContent: 'center',
                paddingHorizontal: 16,
              }
        }
      >
        <TextInput
          ref={ref}
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          multiline={multiline}
          maxLength={maxLength}
          value={value}
          accessibilityLabel={label}
          {...({ 'aria-invalid': !!error } as object)}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            big
              ? { fontFamily: fonts.extrabold, fontSize: 28, color: colors.text, paddingVertical: 8 }
              : { fontFamily: fonts.regular, fontSize: 16, color: colors.text, paddingVertical: multiline ? 14 : 14, textAlignVertical: multiline ? 'top' : 'center', minHeight: multiline ? 108 : undefined },
            WEB_NO_OUTLINE,
            style,
          ]}
          {...rest}
        />
      </View>
      {error ? <FieldError message={error} /> : null}
      {!error && (hint || (counter && maxLength)) ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <Small style={{ flexShrink: 1 }}>{hint ?? ''}</Small>
          {counter && maxLength ? (
            <Small>
              {(value ?? '').length} / {maxLength}
            </Small>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});
