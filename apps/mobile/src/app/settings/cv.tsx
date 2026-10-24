import { EMPLOI_LIMITS, type AnonymousCv, type CandidateCv, type CvExperience, type CvLanguage } from '@sapios/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AnonymousCvCard } from '@/components/AnonymousCvCard';
import { Button } from '@/components/Button';
import { Segmented, Switch } from '@/components/Controls';
import { ExperiencesField, LanguagesField, LookingForField, SkillsField } from '@/components/CvFields';
import { Field } from '@/components/Field';
import { MaskUp, Rise, Spinner } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { Header, Screen } from '@/components/Screen';
import { Body, Heading, Small, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';
import { emploi } from '@/lib/emploi';
import { errorMessage } from '@/lib/errors';
import { colors, radius } from '@/lib/theme';

const HIDDEN = ['Nom', 'Prénom', 'Photo', 'Âge', 'Genre', 'Adresse'];

/** Ce qui reste caché jusqu'au match, barré. */
function HiddenList() {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 16, gap: 10 }} accessibilityLabel={`Caché jusqu’au match : ${HIDDEN.join(', ')}`}>
      <Body weight="bold" size={15}>
        Caché jusqu’au match
      </Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {HIDDEN.map((h) => (
          <View key={h} style={{ borderRadius: 999, borderWidth: 1.5, borderColor: colors.disabled, paddingHorizontal: 12, paddingVertical: 5 }}>
            <Small size={13.5} weight="semibold" style={{ textDecorationLine: 'line-through' }}>
              {h}
            </Small>
          </View>
        ))}
      </View>
      <Small>Au match, l’entreprise découvre vos prénom et nom, rien d’autre. Vous n’avez jamais de photo à fournir.</Small>
    </View>
  );
}

/** Mon CV : éditeur (identité, compétences, langues, expériences, « Ce que je cherche ») et aperçu recruteur. */
export default function CvScreen() {
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const { state, refresh } = useApp();
  const { toast } = useOverlay();
  const [mode, setMode] = useState<'edit' | 'preview'>(preview ? 'preview' : 'edit');
  const [cv, setCv] = useState<CandidateCv | null>(null);
  const [anon, setAnon] = useState<AnonymousCv | null>(null);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [languages, setLanguages] = useState<CvLanguage[]>([]);
  const [experiences, setExperiences] = useState<CvExperience[]>([]);
  const [lookingFor, setLookingFor] = useState('');
  const [showInstitution, setShowInstitution] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    emploi
      .myCv()
      .then((c) => {
        setCv(c);
        setFirst(c.identity?.first_name ?? '');
        setLast(c.identity?.last_name ?? '');
        setSkills(c.skills);
        setLanguages(c.languages);
        setExperiences(c.experiences);
        setLookingFor(c.profile?.looking_for ?? '');
        setShowInstitution(!!c.profile?.show_institution);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(() => {
    if (mode === 'preview') emploi.myCvPreview().then(setAnon).catch((e) => setError(errorMessage(e)));
  }, [mode]);

  const save = async () => {
    setError(null);
    if (skills.length < EMPLOI_LIMITS.skillsMinForProfile) {
      setError('Gardez au moins trois compétences : elles font « Vous avez déjà » sur chaque offre.');
      return;
    }
    try {
      const identityChanged = cv?.identity && (first.trim() !== cv.identity.first_name || last.trim() !== cv.identity.last_name);
      if (identityChanged && first.trim() && last.trim()) await emploi.setIdentity(first.trim(), last.trim());
      await emploi.saveCv(experiences, skills, languages);
      await emploi.saveProfile({ looking_for: lookingFor.trim() || null, show_institution: showInstitution });
      await refresh();
      toast('CV enregistré.');
      setMode('preview');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const institution = state?.diploma?.institution ?? cv?.diploma?.institution ?? null;

  return (
    <Screen
      scroll
      testID="cv"
      header={<Header onBack={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />}
      footer={mode === 'edit' ? <Button testID="cv-save" label="Enregistrer mon CV" onPress={save} disabled={!cv} /> : undefined}
    >
      <View style={{ gap: 18, paddingTop: 4 }}>
        <MaskUp>
          <Title size={30}>Mon CV</Title>
        </MaskUp>
        <Segmented
          testID="cv-mode"
          label="Affichage du CV"
          options={[
            { value: 'edit', label: 'Modifier' },
            { value: 'preview', label: 'Vu par les recruteurs' },
          ]}
          value={mode}
          onChange={setMode}
        />
        {error ? <Notice kind="error" message={error} /> : null}
        {!cv ? (
          <Spinner />
        ) : mode === 'preview' ? (
          <Rise style={{ gap: 14 }}>
            <Body secondary>Avant le match, voici exactement ce qu’un recruteur voit de vous.</Body>
            {anon ? <AnonymousCvCard cv={anon} testID="cv-preview" /> : <Spinner />}
            <HiddenList />
          </Rise>
        ) : (
          <Rise style={{ gap: 24 }}>
            <View style={{ gap: 12 }}>
              <Heading size={18}>Identité</Heading>
              <Small>Comme sur votre diplôme. Révélée à l’entreprise au match seulement.</Small>
              <Field testID="cv-first-name" label="Prénom" value={first} onChangeText={setFirst} maxLength={40} autoCapitalize="words" />
              <Field testID="cv-last-name" label="Nom" value={last} onChangeText={setLast} maxLength={80} autoCapitalize="words" />
            </View>
            <View style={{ gap: 12 }}>
              <Heading size={18}>Compétences</Heading>
              <SkillsField value={skills} onChange={setSkills} />
            </View>
            <View style={{ gap: 12 }}>
              <Heading size={18}>Langues</Heading>
              <LanguagesField value={languages} onChange={setLanguages} />
            </View>
            <View style={{ gap: 12 }}>
              <Heading size={18}>Expériences</Heading>
              <Small>Le recruteur voit les deux plus récentes, en durée, jamais les dates.</Small>
              <ExperiencesField value={experiences} onChange={setExperiences} />
            </View>
            <LookingForField value={lookingFor} onChange={setLookingFor} />
            {institution ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.tile, padding: 14 }}>
                <View style={{ flex: 1 }}>
                  <Body weight="bold" size={15}>
                    Afficher mon établissement
                  </Body>
                  <Small>{institution}. Désactivé, le badge montre seulement le niveau et le domaine.</Small>
                </View>
                <Switch testID="show-institution" label="Afficher mon établissement" value={showInstitution} onChange={setShowInstitution} />
              </View>
            ) : null}
          </Rise>
        )}
      </View>
    </Screen>
  );
}
