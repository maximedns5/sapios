import { LEGAL_PATHS } from '@sapios/shared';
import { Linking, View } from 'react-native';

import { SITE_URL } from '@/lib/env';
import { TextLink } from './Button';

const LINKS = [
  { key: 'terms', label: 'CGU', path: LEGAL_PATHS.terms },
  { key: 'legalNotice', label: 'Mentions légales', path: LEGAL_PATHS.legalNotice },
  { key: 'privacy', label: 'Confidentialité', path: LEGAL_PATHS.privacy },
  { key: 'contact', label: 'Contact', path: LEGAL_PATHS.contact },
] as const;

/** Liens vers les pages légales du site public (CGU, mentions légales, confidentialité, contact). */
export function LegalLinks({ only, color, size = 13.5 }: { only?: (typeof LINKS)[number]['key'][]; color?: string; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 }}>
      {LINKS.filter((l) => !only || only.includes(l.key)).map((l) => (
        <TextLink key={l.key} testID={`legal-${l.key}`} label={l.label} accessibilityRole="link" size={size} color={color} onPress={() => Linking.openURL(`${SITE_URL}${l.path}`)} />
      ))}
    </View>
  );
}
