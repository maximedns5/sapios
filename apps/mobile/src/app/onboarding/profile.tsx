import { GENDERS, STUDY_FIELD_LABELS, STUDY_FIELDS, type StudyField } from '@sapios/shared';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { Chip, ChipRow, OptionCard, RangeSlider } from '@/components/Controls';
import { Field } from '@/components/Field';
import { ArrowRightIcon, CheckIcon } from '@/components/Icons';
import { LocateButton } from '@/components/LocateButton';
import { MaskUp, PopIn, Rise, Shockwave, SlideIn, Spinner } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { Body, Eyebrow, Small, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';
import { errorMessage } from '@/lib/errors';
import { loadMyIntellect, saveIntellectFlags } from '@/lib/intellect';
import { AGE_MAX, AGE_MIN, GENDER_SENTENCE, loadOwnAge, loadOwnProfile, saveOwnProfile, SEEKING_LABEL, suggestedAgeRange } from '@/lib/profile';
import { alpha, colors, ease } from '@/lib/theme';
import type { Gender } from '@/lib/types';

const BIO_MAX = 500;
type Step = 'name' | 'gender' | 'seeking' | 'field' | 'where' | 'bio' | 'done';

/** Cercle décoratif d'accent qui grandit à chaque sous-étape. */
function Blob({ index }: { index: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withTiming(index, { duration: 900, easing: ease.out });
  }, [index, v]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -v.value * 6 }, { translateY: v.value * 8 }, { scale: 1 + v.value * 0.16 }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -90, right: -110, width: 280, height: 280, borderRadius: 140, backgroundColor: alpha(colors.accent, 0.1) }, style]} />;
}

function Intro({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <View style={{ gap: 10 }}>
      <SlideIn>
        <Eyebrow>{eyebrow}</Eyebrow>
      </SlideIn>
      <MaskUp delay={80}>
        <Title size={34}>{title}</Title>
      </MaskUp>
      {sub ? (
        <Rise delay={200}>
          <Body muted size={15.5}>
            {sub}
          </Body>
        </Rise>
      ) : null}
    </View>
  );
}

/**
 * Étape 3 : le profil, une question par écran (prénom, genre, recherche, domaine, ville et âge, bio),
 * puis une célébration avant les photos. Tout est enregistré d'un coup à la fin ; « retour » ne perd rien.
 */
export default function OnboardingProfile() {
  const { userId, state, refresh } = useApp();
  const consent = !!state?.onboarding.consent_sensitive;
  const steps: Step[] = consent ? ['name', 'gender', 'seeking', 'field', 'where', 'bio'] : ['name', 'gender', 'field', 'where', 'bio'];
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [seeking, setSeeking] = useState<Gender[]>([]);
  const [field, setField] = useState<StudyField | null>(null);
  const [city, setCity] = useState('');
  const [ages, setAges] = useState<[number, number]>([25, 40]);
  const [suggested, setSuggested] = useState(false);
  const [bio, setBio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    Promise.all([loadOwnProfile(userId), loadOwnAge(userId), loadMyIntellect(userId).catch(() => null)])
      .then(([p, age, mine]) => {
        setField(mine?.studyField ?? null);
        setName(p.display_name ?? '');
        setGender(p.gender);
        setSeeking(p.seeking_genders ?? []);
        setCity(p.city ?? '');
        setBio(p.bio ?? '');
        const untouched = p.age_min === AGE_MIN && p.age_max === AGE_MAX;
        setAges(untouched && age ? suggestedAgeRange(age) : untouched ? [25, 40] : [p.age_min, p.age_max]);
        setSuggested(untouched && !!age);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  if (!userId || !state) return null;
  const step: Step = done ? 'done' : steps[index];
  const first = name.trim().split(/\s+/)[0] || 'vous';

  const valid = step === 'name' ? name.trim().length > 0 : step === 'gender' ? !!gender : step === 'seeking' ? seeking.length > 0 : step === 'where' ? city.trim().length > 0 : true;

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await saveOwnProfile(userId, {
        display_name: name.trim(),
        gender,
        ...(consent ? { seeking_genders: seeking } : {}),
        age_min: Math.min(...ages),
        age_max: Math.max(...ages),
        bio: bio.trim(),
        city: city.trim(),
      });
      if (field) await saveIntellectFlags(userId, { study_field: field });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (!valid) return;
    if (index < steps.length - 1) setIndex(index + 1);
    else save();
  };

  const fraction = done ? 1 : index / steps.length;

  return (
    <Screen
      scroll
      testID="onboarding-profile"
      backdrop={<Blob index={done ? steps.length : index} />}
      header={<StepHeader step={3} fraction={fraction} onBack={!done && index > 0 ? () => setIndex(index - 1) : undefined} />}
      footer={
        done ? (
          <Rise delay={750}>
            <Button testID="profile-done" label="Ajouter mes photos" onPress={() => refresh()} />
          </Rise>
        ) : (
          <Button
            testID="profile-next"
            label={index === steps.length - 1 ? (bio.trim() ? 'Enregistrer' : 'Passer et enregistrer') : step === 'field' && !field ? 'Passer' : 'Continuer'}
            disabled={!valid}
            loading={saving}
            onPress={next}
            trailing={valid ? <ArrowRightIcon size={20} color="#FFFFFF" stroke={2.4} /> : undefined}
          />
        )
      }
    >
      {loading ? (
        <View style={{ paddingTop: 80, alignItems: 'center' }}>
          <Spinner />
        </View>
      ) : (
        <View key={step} style={{ gap: 22, paddingTop: 28 }}>
          {step === 'name' ? (
            <>
              <Intro eyebrow="Faisons connaissance" title="Comment vous appelez-vous ?" sub="Votre prénom suffit. Le nom complet, on le garde pour nous." />
              <Rise delay={300}>
                <Field testID="display-name" big accessibilityLabel="Prénom affiché" value={name} onChangeText={setName} placeholder="Votre prénom" maxLength={40} autoCapitalize="words" autoComplete="given-name" autoFocus onSubmitEditing={next} />
              </Rise>
            </>
          ) : null}

          {step === 'gender' ? (
            <>
              <Intro eyebrow={`Ravis de vous rencontrer, ${first}.`} title="Vous êtes…" />
              <View role="radiogroup" accessibilityLabel="Vous êtes" style={{ gap: 10 }}>
                {GENDERS.map((g, i) => (
                  <Rise key={g} delay={180 + i * 70}>
                    <OptionCard testID={`gender-${g}`} label={GENDER_SENTENCE[g]} active={gender === g} onPress={() => setGender(g)} />
                  </Rise>
                ))}
              </View>
            </>
          ) : null}

          {step === 'seeking' ? (
            <>
              <Intro eyebrow="Question de cœur" title="Vous aimeriez rencontrer…" sub="Plusieurs choix possibles. Cette réponse reste confidentielle." />
              <View accessibilityLabel="Vous aimeriez rencontrer" style={{ gap: 10 }}>
                {GENDERS.map((g, i) => (
                  <Rise key={g} delay={260 + i * 70}>
                    <OptionCard
                      multiple
                      testID={`seeking-${g}`}
                      label={SEEKING_LABEL[g]}
                      active={seeking.includes(g)}
                      onPress={() => setSeeking((s) => (s.includes(g) ? s.filter((x) => x !== g) : [...s, g]))}
                    />
                  </Rise>
                ))}
              </View>
            </>
          ) : null}

          {step === 'field' ? (
            <>
              <Intro eyebrow="Ce qui vous anime" title="Votre domaine" sub="Celui de vos études. Il s’affiche sur votre profil et rapproche les esprits voisins. Modifiable plus tard." />
              <View role="radiogroup" accessibilityLabel="Votre domaine">
                <ChipRow>
                  {STUDY_FIELDS.map((f, i) => (
                    <Rise key={f} delay={200 + i * 35}>
                      <Chip radio testID={`field-${f}`} label={STUDY_FIELD_LABELS[f]} active={field === f} onPress={() => setField(field === f ? null : f)} />
                    </Rise>
                  ))}
                </ChipRow>
              </View>
            </>
          ) : null}

          {step === 'where' ? (
            <>
              <Intro eyebrow="Presque fini" title="Où, et avec qui ?" sub="Votre ville s’affiche sur votre profil. La position, si vous la partagez, sert seulement aux distances." />
              <Rise delay={250} style={{ gap: 8 }}>
                <Field testID="city" label="Ville" value={city} onChangeText={setCity} placeholder="Paris" autoCapitalize="words" autoComplete="postal-address-locality" maxLength={60} />
                <LocateButton />
              </Rise>
              <Rise delay={350} style={{ gap: 6 }}>
                <RangeSlider testID="age-range" label="Âge recherché" min={AGE_MIN} max={AGE_MAX} low={ages[0]} high={ages[1]} onChange={(lo, hi) => setAges([lo, hi])} />
                <Small>{suggested ? 'Proposé d’après votre âge. ' : ''}Modifiable à tout moment dans votre compte.</Small>
              </Rise>
            </>
          ) : null}

          {step === 'bio' ? (
            <>
              <Intro eyebrow="Dernière touche" title="En quelques mots" sub="Facultatif. Une phrase suffit : elle s’affichera sous votre première photo." />
              <Rise delay={250}>
                <Field
                  testID="bio"
                  label="Votre bio"
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Thèse en cours, opinions tranchées sur les notes de bas de page."
                  multiline
                  maxLength={BIO_MAX}
                  counter
                />
              </Rise>
              {error ? <Notice kind="error" testID="profile-error" message={error} /> : null}
            </>
          ) : null}

          {step === 'done' ? (
            <View style={{ alignItems: 'center', gap: 14, paddingTop: 40 }}>
              <View style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center' }}>
                <Shockwave size={96} color={colors.accent} delay={350} duration={900} />
                <PopIn delay={100} duration={600}>
                  <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <CheckIcon size={44} stroke={2.6} color="#FFFFFF" />
                  </View>
                </PopIn>
              </View>
              <MaskUp delay={450}>
                <Title size={34} align="center">
                  Parfait, {first}.
                </Title>
              </MaskUp>
              <Rise delay={600}>
                <Body secondary align="center">
                  Il ne reste que vos photos et votre diplôme. Deux minutes, promis.
                </Body>
              </Rise>
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
