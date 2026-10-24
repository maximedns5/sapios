import { CONTRACT_LABELS, EXPERIENCE_BAND_LABELS, formatCandidateNumber, formatSalaryRange, type CandidateCv } from '@sapios/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/Button';
import { DiplomaCard } from '@/components/DiplomaCard';
import { BriefcaseIcon, EyeIcon, FileIcon, GearIcon, LockIcon, SlidersIcon } from '@/components/Icons';
import { MaskUp, Rise } from '@/components/motion';
import { SettingsGroup, SettingsRow } from '@/components/SettingsRow';
import { Body, Small, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';
import { emploi } from '@/lib/emploi';
import { formatMonth, remoteLabel } from '@/lib/format';
import { alpha, colors, radius, space } from '@/lib/theme';

/** Profil : nom (vu seulement après un match), numéro anonyme, diplôme, CV, recherche, visibilité, compte. */
export default function Profile() {
  const { state } = useApp();
  const insets = useSafeAreaInsets();
  const [cv, setCv] = useState<CandidateCv | null>(null);

  useFocusEffect(
    useCallback(() => {
      emploi.myCv().then(setCv).catch(() => {});
    }, []),
  );

  const p = cv?.profile;
  const name = cv?.identity ? `${cv.identity.first_name} ${cv.identity.last_name}` : '';
  const open = !!state?.candidate?.open_to_opportunities;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="profile">
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: space.xl, gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <MaskUp>
              <Title size={30}>{name || 'Mon profil'}</Title>
            </MaskUp>
            {state?.candidate ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <LockIcon size={14} color={colors.muted} />
                <Small size={13.5}>Pour les recruteurs : Candidat·e {formatCandidateNumber(state.candidate.number)}</Small>
              </View>
            ) : null}
          </View>
          <IconButton testID="open-settings" label="Compte et réglages" onPress={() => router.push('/settings')}>
            <GearIcon size={20} />
          </IconButton>
        </View>

        <Rise delay={80}>
          <DiplomaCard />
        </Rise>

        {p ? (
          <Rise delay={140} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, padding: 18, gap: 10 }}>
            <Body weight="extrabold" size={19}>
              {p.target_role}
            </Body>
            <Small size={14}>
              {EXPERIENCE_BAND_LABELS[p.experience_band]} d’expérience · {p.contract_types.map((c) => CONTRACT_LABELS[c]).join(', ')} · {formatSalaryRange(p.salary_min_k, p.salary_max_k)}
            </Small>
            <Small size={14}>
              {p.search_city} et {p.search_radius_km} km autour · {p.remote_days_min ? remoteLabel(p.remote_days_min).toLowerCase() : 'télétravail indifférent'} · dès {formatMonth(p.available_from)}
            </Small>
            {cv?.skills.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                {cv.skills.map((s) => (
                  <View key={s} style={{ borderRadius: 999, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Small size={13} weight="bold" color={colors.text}>
                      {s}
                    </Small>
                  </View>
                ))}
              </View>
            ) : null}
          </Rise>
        ) : null}

        <Rise delay={200}>
          <SettingsGroup label="Mon CV">
            <SettingsRow first testID="row-cv" icon={<FileIcon size={18} color={colors.accent} />} title="Modifier mon CV" sub="Expériences, compétences, langues" onPress={() => router.push('/settings/cv')} />
            <SettingsRow testID="row-preview" icon={<EyeIcon size={18} color={colors.accent} />} title="Ce que voient les recruteurs" sub="Votre CV anonyme, avant le match" onPress={() => router.push({ pathname: '/settings/cv', params: { preview: '1' } })} />
            <SettingsRow testID="row-search" icon={<SlidersIcon size={18} color={colors.accent} />} title="Ma recherche" sub="Poste, zone, contrats, salaire" onPress={() => router.push('/settings/search')} />
          </SettingsGroup>
        </Rise>

        <Rise delay={260}>
          <SettingsGroup label="Visibilité">
            <SettingsRow
              first
              testID="row-visibility"
              icon={<BriefcaseIcon size={18} color={colors.accent} />}
              title="Ouvert·e aux opportunités"
              sub={open ? 'Activé : les recruteurs peuvent vous inviter' : 'Désactivé : seules vos candidatures sont vues'}
              onPress={() => router.push('/settings/visibility')}
              right={
                <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: open ? alpha(colors.accent, 0.1) : colors.bg }}>
                  <Small size={13} weight="bold" color={open ? colors.accent : colors.muted}>
                    {open ? 'Oui' : 'Non'}
                  </Small>
                </View>
              }
            />
          </SettingsGroup>
        </Rise>
      </ScrollView>
    </View>
  );
}
