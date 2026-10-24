import { View } from 'react-native';

import { initials } from '@/lib/format';
import { colors, fonts, radius } from '@/lib/theme';
import { VerifiedBadge } from './Icons';
import { Body, Small } from './Text';

const LOGO_TINTS = ['#0E7C61', '#1A1918', '#B4532A', '#2F5DA8', '#7A4BA8', '#9A6B12'];

function tint(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return LOGO_TINTS[h % LOGO_TINTS.length];
}

/** Monogramme d'entreprise (initiales sur une teinte stable) : pas de logo téléversé dans le produit minimal. */
export function CompanyLogo({ name, size = 44, muted }: { name: string; size?: number; muted?: boolean }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), backgroundColor: muted ? colors.surface : tint(name), alignItems: 'center', justifyContent: 'center' }}
    >
      <Body size={Math.round(size * 0.32)} color={muted ? colors.muted : '#FFFFFF'} style={{ fontFamily: fonts.extrabold, lineHeight: Math.round(size * 0.42) }}>
        {initials(name)}
      </Body>
    </View>
  );
}

/** Nom d'entreprise et mention « Entreprise vérifiée » (SIREN contrôlé par l'équipe). */
export function CompanyLine({ name, verified, sub }: { name: string; verified?: boolean; sub?: string | null }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <CompanyLogo name={name} size={40} />
      <View style={{ flex: 1, gap: 1 }}>
        <Body weight="bold" size={15} numberOfLines={1}>
          {name}
        </Body>
        {verified ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <VerifiedBadge size={14} label="Entreprise vérifiée" />
            <Small size={13} weight="semibold" color={colors.accent}>
              Entreprise vérifiée{sub ? ` · ${sub}` : ''}
            </Small>
          </View>
        ) : sub ? (
          <Small size={13}>{sub}</Small>
        ) : null}
      </View>
    </View>
  );
}

/** Pastille (« CDI », « 2 jours de télétravail »). */
export function Tag({ label, tone = 'surface' }: { label: string; tone?: 'surface' | 'accent' | 'line' }) {
  return (
    <View
      style={{
        borderRadius: radius.pill,
        paddingHorizontal: 11,
        paddingVertical: 5,
        backgroundColor: tone === 'accent' ? colors.accent : tone === 'surface' ? colors.surface : 'transparent',
        borderWidth: tone === 'line' ? 1.5 : 0,
        borderColor: colors.disabled,
      }}
    >
      <Small size={13} weight="bold" color={tone === 'accent' ? '#FFFFFF' : colors.text}>
        {label}
      </Small>
    </View>
  );
}
