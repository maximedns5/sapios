import * as Location from 'expo-location';
import { GENDERS } from '@sapios/shared';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { api } from '@/lib/api';
import { AppError, errorMessage } from '@/lib/errors';
import { GENDER_LABEL, loadOwnProfile, saveOwnProfile, SEEKING_LABEL } from '@/lib/profile';
import type { Gender } from '@/lib/types';
import { Button } from './Button';
import { Choice, ChoiceRow, Stepper } from './Controls';
import { Field } from './Field';
import { CheckIcon } from './Icons';
import { Notice } from './Notice';
import { Label, Mono } from './Text';
import { useTone } from './Tone';

const BIO_MAX = 500;

/** Formulaire de profil public (onboarding et modification). */
export function ProfileForm({
  userId,
  consentGiven,
  submitLabel,
  onSaved,
}: {
  userId: string;
  consentGiven: boolean;
  submitLabel: string;
  onSaved: () => Promise<unknown> | void;
}) {
  const { fg } = useTone();
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [seeking, setSeeking] = useState<Gender[]>([]);
  const [ageMin, setAgeMin] = useState(25);
  const [ageMax, setAgeMax] = useState(45);
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [located, setLocated] = useState<'idle' | 'busy' | 'done' | 'denied'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOwnProfile(userId)
      .then((p) => {
        setDisplayName(p.display_name ?? '');
        setGender(p.gender);
        setSeeking(p.seeking_genders ?? []);
        if (p.age_min) setAgeMin(p.age_min);
        if (p.age_max) setAgeMax(p.age_max);
        setBio(p.bio ?? '');
        setCity(p.city ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const locate = async () => {
    setError(null);
    setLocated('busy');
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setLocated('denied');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      // Arrondi à 0,01° (~1 km) avant l'envoi : la position précise ne quitte pas l'appareil.
      const round = (v: number) => Math.round(v * 100) / 100;
      await api.setLocation(round(pos.coords.latitude), round(pos.coords.longitude));
      setLocated('done');
    } catch (e) {
      setLocated('idle');
      setError(e instanceof AppError ? errorMessage(e) : 'Position indisponible. Réessayez ou passez cette étape.');
    }
  };

  const save = async () => {
    setError(null);
    try {
      const name = displayName.trim();
      if (name.length < 1) throw new Error('Indiquez un prénom.');
      if (!gender) throw new Error('Indiquez votre genre.');
      if (consentGiven && seeking.length === 0) throw new Error('Indiquez qui vous recherchez.');
      if (!city.trim()) throw new Error('Indiquez votre ville.');
      await saveOwnProfile(userId, {
        display_name: name,
        gender,
        ...(consentGiven ? { seeking_genders: seeking } : {}),
        age_min: Math.min(ageMin, ageMax),
        age_max: Math.max(ageMin, ageMax),
        bio: bio.trim(),
        city: city.trim(),
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof AppError ? errorMessage(e) : (e as Error).message);
    }
  };

  if (loading) return <ActivityIndicator color={fg} style={{ marginTop: 40 }} />;

  return (
    <View style={{ gap: 26 }}>
      <Field testID="display-name" label="Prénom affiché" value={displayName} onChangeText={setDisplayName} placeholder="Camille" maxLength={40} autoCapitalize="words" />
      <View style={{ gap: 8 }}>
        <Label>Je suis</Label>
        <ChoiceRow>
          {GENDERS.map((g) => (
            <Choice key={g} testID={`gender-${g}`} label={GENDER_LABEL[g]} active={gender === g} onPress={() => setGender(g)} />
          ))}
        </ChoiceRow>
      </View>
      {consentGiven ? (
        <View style={{ gap: 8 }}>
          <Label>Je cherche</Label>
          <ChoiceRow>
            {GENDERS.map((g) => (
              <Choice
                key={g}
                testID={`seeking-${g}`}
                label={SEEKING_LABEL[g]}
                active={seeking.includes(g)}
                onPress={() => setSeeking((s) => (s.includes(g) ? s.filter((x) => x !== g) : [...s, g]))}
              />
            ))}
          </ChoiceRow>
        </View>
      ) : (
        <Notice outline title="Genres recherchés" message="Masqué : vous n’avez pas donné votre consentement pour cette donnée sensible." />
      )}
      <View style={{ gap: 8 }}>
        <Label>Âge recherché</Label>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Stepper testID="age-min" label="De" value={ageMin} min={18} max={ageMax} onChange={setAgeMin} />
          <Stepper testID="age-max" label="À" value={ageMax} min={ageMin} max={99} onChange={setAgeMax} />
        </View>
      </View>
      <Field
        testID="bio"
        label="Bio"
        value={bio}
        onChangeText={setBio}
        placeholder="Thèse en cours, opinions tranchées sur les notes de bas de page."
        multiline
        maxLength={BIO_MAX}
        counter
      />
      <Field testID="city" label="Ville" value={city} onChangeText={setCity} placeholder="Paris" autoCapitalize="words" maxLength={60} />
      <View style={{ gap: 8 }}>
        <Label>Localisation</Label>
        {located === 'done' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: fg, padding: 14 }}>
            <CheckIcon size={18} />
            <Mono size={12}>Position enregistrée, arrondie à 1 km</Mono>
          </View>
        ) : (
          <Button
            testID="locate"
            label={located === 'busy' ? 'Localisation…' : 'Utiliser ma position'}
            trailing="~1 km"
            variant="outline"
            loading={located === 'busy'}
            onPress={locate}
          />
        )}
        {located === 'denied' ? (
          <Notice title="Permission refusée" message="Sans position, les distances ne s’affichent pas. Vous pourrez l’activer plus tard dans les réglages." />
        ) : (
          <Label size={9} style={{ opacity: 0.55 }}>
            Jamais exposée précisément : les autres voient « à 3 km ».
          </Label>
        )}
      </View>
      {error ? <Notice testID="profile-error" title="Erreur" message={error} /> : null}
      <Button testID="profile-submit" label={submitLabel} trailing="→" onPress={save} />
    </View>
  );
}
