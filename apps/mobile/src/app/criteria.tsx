import {
  DISCOVERY_MAX_DISTANCE_KM,
  DISCOVERY_MIN_DISTANCE_KM,
  levelLabel,
  STUDY_FIELD_LABELS,
  STUDY_FIELDS,
  type DiscoveryPrefs,
  type DiscoverySort,
  type StudyField,
} from '@sapios/shared';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Button, TextLink } from '@/components/Button';
import { Chip, ChipRow, RangeSlider, Segmented, Switch, ValueSlider } from '@/components/Controls';
import { ChevronRightIcon } from '@/components/Icons';
import { LocateButton } from '@/components/LocateButton';
import { MaskUp, Rise, Spinner } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { Header, Screen } from '@/components/Screen';
import { Body, Heading, Small, Title } from '@/components/Text';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { resetFeed } from '@/lib/candidates';
import { useCopy } from '@/lib/copy';
import { errorMessage } from '@/lib/errors';
import { AGE_MAX, AGE_MIN } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { alpha, colors, radius } from '@/lib/theme';

/** Niveaux qui voient le feed (Bac+3 admis par lot, Bac+5, Bac+8). */
const LEVELS = [6, 7, 8];

function Tag({ strict }: { strict: boolean }) {
  return (
    <View style={{ borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: strict ? alpha(colors.accent, 0.1) : colors.surface }}>
      <Small size={12.5} weight="bold" color={strict ? colors.accent : colors.muted}>
        {strict ? 'Strict' : 'Préférence'}
      </Small>
    </View>
  );
}

function Section({ title, strict, children, delay }: { title: string; strict?: boolean; children: ReactNode; delay: number }) {
  return (
    <Rise delay={delay} style={{ gap: 12, paddingVertical: 18, borderTopWidth: 1, borderColor: colors.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <Heading size={18}>{title}</Heading>
        {strict != null ? <Tag strict={strict} /> : null}
      </View>
      {children}
    </Rise>
  );
}

/**
 * Critères de découverte : âge et distance filtrent (stricts) ; niveaux et domaines font remonter, ou
 * filtrent si l'on coche « uniquement » ; ordre par activité ou par affinités. Le nombre de profils
 * correspondants se met à jour en direct. Un seul endroit pour l'âge recherché.
 */
export default function Criteria() {
  const { userId } = useApp();
  const { t } = useCopy();
  const { toast } = useOverlay();
  const [prefs, setPrefs] = useState<DiscoveryPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ages, setAges] = useState<[number, number]>([25, 40]);
  const [distance, setDistance] = useState(50);
  const [levels, setLevels] = useState<number[]>([]);
  const [strictLevels, setStrictLevels] = useState(false);
  const [fields, setFields] = useState<StudyField[]>([]);
  const [strictFields, setStrictFields] = useState(false);
  const [sort, setSort] = useState<DiscoverySort>('activity');
  const [count, setCount] = useState<number | null>(null);
  const [located, setLocated] = useState(true);
  const [explain, setExplain] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api
      .discoveryPrefs()
      .then((p) => {
        setPrefs(p);
        setAges([Math.max(AGE_MIN, p.age_min), Math.min(AGE_MAX, p.age_max)]);
        setDistance(p.max_distance_km);
        setLevels(p.levels);
        setStrictLevels(p.strict_levels);
        setFields(p.fields);
        setStrictFields(p.strict_fields);
        setSort(p.sort);
      })
      .catch((e) => setError(errorMessage(e)));
    if (userId) {
      supabase
        .from('profiles')
        .select('location')
        .eq('id', userId)
        .single()
        .then(({ data }) => setLocated(!!(data as { location: unknown } | null)?.location));
    }
  }, [userId]);

  // Nombre de profils correspondants, recalculé 400 ms après le dernier réglage.
  useEffect(() => {
    if (!prefs) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api
        .countDiscovery({ maxDistanceKm: distance, ageMin: ages[0], ageMax: ages[1], levels, strictLevels, fields, strictFields })
        .then((c) => setCount(c.matching))
        .catch(() => setCount(null));
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [prefs, distance, ages, levels, strictLevels, fields, strictFields]);

  const reset = () => {
    if (!prefs) return;
    setDistance(prefs.default_distance_km);
    setLevels([]);
    setStrictLevels(false);
    setFields([]);
    setStrictFields(false);
    setSort('activity');
  };

  const apply = async () => {
    try {
      await api.setDiscoveryPrefs({ maxDistanceKm: distance, ageMin: ages[0], ageMax: ages[1], levels, strictLevels, fields, strictFields, sort });
      resetFeed();
      toast('Critères enregistrés.');
      if (router.canGoBack()) router.back();
      else router.replace('/feed');
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <Screen
      scroll
      testID="criteria"
      header={
        <Header
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/feed'))}
          backLabel="Fermer"
          right={prefs ? <TextLink label="Réinitialiser" testID="criteria-reset" onPress={reset} color={colors.muted} size={15} /> : null}
        />
      }
      footer={
        prefs ? (
          <>
            <Body align="center" size={14.5} secondary accessibilityLiveRegion="polite" testID="criteria-count">
              {count == null ? ' ' : count === 0 ? 'Aucun profil ne correspond pour l’instant' : `Environ ${count} profil${count > 1 ? 's' : ''} correspondent`}
            </Body>
            <Button testID="criteria-apply" label="Appliquer" onPress={apply} />
          </>
        ) : null
      }
    >
      <MaskUp>
        <Title size={32}>Vos critères</Title>
      </MaskUp>
      {error ? <Notice kind="error" message={error} style={{ marginTop: 16 }} /> : null}
      {!prefs && !error ? (
        <View style={{ paddingTop: 60, alignItems: 'center' }}>
          <Spinner />
        </View>
      ) : null}
      {prefs ? (
        <View style={{ marginTop: 14 }}>
          <Section title="Âge" strict delay={60}>
            <RangeSlider testID="criteria-age" label="Âge recherché" min={AGE_MIN} max={AGE_MAX} low={ages[0]} high={ages[1]} onChange={(lo, hi) => setAges([lo, hi])} />
          </Section>

          <Section title="Distance" strict delay={120}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Body weight="extrabold" size={22} testID="criteria-distance-value">
                {distance} km
              </Body>
              <Small>autour de vous</Small>
            </View>
            <ValueSlider
              testID="criteria-distance"
              label="Distance maximale"
              min={DISCOVERY_MIN_DISTANCE_KM}
              max={DISCOVERY_MAX_DISTANCE_KM}
              step={5}
              value={distance}
              onChange={setDistance}
              format={(v) => `${v} km`}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Small size={13}>{DISCOVERY_MIN_DISTANCE_KM} km</Small>
              <Small size={13}>{DISCOVERY_MAX_DISTANCE_KM} km</Small>
            </View>
            {!located ? (
              <View style={{ gap: 6 }}>
                <Small>Sans votre position, la distance ne filtre rien.</Small>
                <LocateButton />
              </View>
            ) : null}
          </Section>

          <Section title="Niveaux" strict={strictLevels} delay={180}>
            <ChipRow>
              {LEVELS.map((l) => (
                <Chip key={l} testID={`criteria-level-${l}`} label={levelLabel(l)} active={levels.includes(l)} onPress={() => setLevels((s) => toggle(s, l))} />
              ))}
            </ChipRow>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <Body size={15} style={{ flex: 1 }}>
                Uniquement ces niveaux
              </Body>
              <Switch testID="criteria-strict-levels" label="Uniquement ces niveaux" value={strictLevels} disabled={!levels.length} onChange={setStrictLevels} />
            </View>
          </Section>

          <Section title="Domaines" strict={strictFields} delay={240}>
            <Small size={14}>Ceux que vous choisissez passent en premier. Les autres restent visibles : l’amour interdisciplinaire a ses chances.</Small>
            <ChipRow>
              {STUDY_FIELDS.map((f) => (
                <Chip key={f} testID={`criteria-field-${f}`} label={STUDY_FIELD_LABELS[f]} active={fields.includes(f)} onPress={() => setFields((s) => toggle(s, f))} />
              ))}
            </ChipRow>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <Body size={15} style={{ flex: 1 }}>
                Uniquement ces domaines
              </Body>
              <Switch testID="criteria-strict-fields" label="Uniquement ces domaines" value={strictFields} disabled={!fields.length} onChange={setStrictFields} />
            </View>
          </Section>

          <Section title="Ordre des profils" delay={300}>
            <Segmented
              testID="criteria-sort"
              label="Ordre des profils"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'activity', label: 'Activité récente' },
                { value: 'affinity', label: 'Affinités' },
              ]}
            />
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: explain }} onPress={() => setExplain((v) => !v)} testID="criteria-explain">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
                <Body weight="bold" size={15} color={colors.accent}>
                  Comment nous choisissons vos profils
                </Body>
                <View style={{ transform: [{ rotate: explain ? '90deg' : '0deg' }] }}>
                  <ChevronRightIcon size={16} color={colors.accent} />
                </View>
              </View>
            </Pressable>
            {explain ? (
              <Rise>
                <Small size={14} style={{ lineHeight: 20 }}>
                  {t('feed.ranking')} Le tri « Activité récente » n’utilise pas vos goûts : c’est votre droit d’opposition au profilage.
                </Small>
              </Rise>
            ) : null}
          </Section>
        </View>
      ) : null}
    </Screen>
  );
}

