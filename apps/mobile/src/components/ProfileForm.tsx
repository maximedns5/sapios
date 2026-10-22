import { GENDERS } from '@sapios/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppError, errorMessage } from '@/lib/errors';
import { AGE_MAX, AGE_MIN, GENDER_SENTENCE, loadOwnProfile, saveOwnProfile, SEEKING_LABEL } from '@/lib/profile';
import type { Gender } from '@/lib/types';
import { colors, radius } from '@/lib/theme';
import { Button } from './Button';
import { OptionCard, RangeSlider } from './Controls';
import { Field } from './Field';
import { LocateButton } from './LocateButton';
import { Spinner } from './motion';
import { Notice } from './Notice';
import { ChevronRightIcon } from './Icons';
import { Body, Heading, Small } from './Text';

const BIO_MAX = 500;

/**
 * Modification du profil public : prénom, genre, recherche, âge, ville, bio. `criteriaLink` : membre
 * qui voit la découverte, l'âge recherché se règle au seul endroit des critères.
 */
export function ProfileForm({
  userId,
  consentGiven,
  submitLabel,
  onSaved,
  criteriaLink,
}: {
  userId: string;
  consentGiven: boolean;
  submitLabel: string;
  onSaved: () => Promise<unknown> | void;
  criteriaLink?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [seeking, setSeeking] = useState<Gender[]>([]);
  const [ages, setAges] = useState<[number, number]>([25, 45]);
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOwnProfile(userId)
      .then((p) => {
        setDisplayName(p.display_name ?? '');
        setGender(p.gender);
        setSeeking(p.seeking_genders ?? []);
        setAges([p.age_min ?? AGE_MIN, Math.min(p.age_max ?? AGE_MAX, AGE_MAX)]);
        setBio(p.bio ?? '');
        setCity(p.city ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const save = async () => {
    setError(null);
    try {
      const name = displayName.trim();
      if (name.length < 1) throw new Error('Indiquez un prénom.');
      if (!gender) throw new Error('Indiquez votre genre.');
      if (consentGiven && seeking.length === 0) throw new Error('Indiquez qui vous aimeriez rencontrer.');
      if (!city.trim()) throw new Error('Indiquez votre ville.');
      await saveOwnProfile(userId, {
        display_name: name,
        gender,
        ...(consentGiven ? { seeking_genders: seeking } : {}),
        // Avec les critères, l'âge recherché s'enregistre là-bas : ne pas l'écraser ici.
        ...(criteriaLink ? {} : { age_min: Math.min(...ages), age_max: Math.max(...ages) }),
        bio: bio.trim(),
        city: city.trim(),
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof AppError ? errorMessage(e) : (e as Error).message);
    }
  };

  if (loading) {
    return (
      <View style={{ paddingVertical: 40, alignItems: 'center' }}>
        <Spinner />
      </View>
    );
  }

  return (
    <View style={{ gap: 26 }}>
      <Field testID="display-name" label="Prénom affiché" value={displayName} onChangeText={setDisplayName} placeholder="Camille" maxLength={40} autoCapitalize="words" />
      <View style={{ gap: 10 }} role="radiogroup" accessibilityLabel="Vous êtes">
        <Heading size={16}>Vous êtes</Heading>
        {GENDERS.map((g) => (
          <OptionCard key={g} testID={`gender-${g}`} label={GENDER_SENTENCE[g]} active={gender === g} onPress={() => setGender(g)} />
        ))}
      </View>
      {consentGiven ? (
        <View style={{ gap: 10 }}>
          <Heading size={16}>Vous aimeriez rencontrer</Heading>
          {GENDERS.map((g) => (
            <OptionCard
              key={g}
              multiple
              testID={`seeking-${g}`}
              label={SEEKING_LABEL[g]}
              active={seeking.includes(g)}
              onPress={() => setSeeking((s) => (s.includes(g) ? s.filter((x) => x !== g) : [...s, g]))}
            />
          ))}
        </View>
      ) : (
        <Notice title="Genres recherchés" message="Masqués : vous n’avez pas donné votre consentement pour cette donnée sensible." icon="lock" />
      )}
      {criteriaLink ? (
        <Pressable testID="age-criteria" accessibilityRole="link" accessibilityLabel={`Âge recherché : ${ages[0]} à ${ages[1]} ans. Modifier dans mes critères`} onPress={() => router.push('/criteria')}>
          {({ pressed }) => (
            <View style={{ backgroundColor: pressed ? colors.line : colors.surface, borderRadius: radius.card, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Small size={13}>Âge recherché</Small>
                <Body weight="bold">
                  {ages[0]} – {ages[1]} ans
                </Body>
                <Small>Se règle avec vos critères de découverte.</Small>
              </View>
              <ChevronRightIcon size={18} color={colors.muted} />
            </View>
          )}
        </Pressable>
      ) : (
        <RangeSlider testID="age-range" label="Âge recherché" min={AGE_MIN} max={AGE_MAX} low={ages[0]} high={ages[1]} onChange={(lo, hi) => setAges([lo, hi])} />
      )}
      <View style={{ gap: 6 }}>
        <Field testID="city" label="Ville" value={city} onChangeText={setCity} placeholder="Paris" autoCapitalize="words" maxLength={60} />
        <LocateButton />
      </View>
      <Field testID="bio" label="Bio" value={bio} onChangeText={setBio} placeholder="Thèse en cours, opinions tranchées sur les notes de bas de page." multiline maxLength={BIO_MAX} counter />
      {error ? <Notice testID="profile-error" kind="error" message={error} /> : null}
      <Button testID="profile-submit" label={submitLabel} onPress={save} />
    </View>
  );
}
