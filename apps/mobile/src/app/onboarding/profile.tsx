import { EMPLOI_LIMITS, type ContractType, type CvExperience, type CvLanguage, type ExperienceBand } from '@sapios/shared';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { Segmented } from '@/components/Controls';
import { ExperiencesField, LanguagesField, LookingForField, SkillsField } from '@/components/CvFields';
import { Field } from '@/components/Field';
import { ArrowRightIcon, CheckIcon } from '@/components/Icons';
import { MaskUp, PopIn, Rise, Shockwave, SlideIn, Spinner } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { AvailabilityField, CityField, ContractsField, ExperienceField, RadiusField, RemoteField, SalaryField, type City } from '@/components/SearchFields';
import { StepHeader } from '@/components/StepHeader';
import { Body, Eyebrow, Label, Small, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';
import { emploi } from '@/lib/emploi';
import { errorMessage } from '@/lib/errors';
import { alpha, colors, ease } from '@/lib/theme';

type Step = 'role' | 'where' | 'contract' | 'salary' | 'rhythm' | 'experience' | 'skills' | 'more' | 'done';
const SEARCH: Step[] = ['role', 'where', 'contract', 'salary', 'rhythm', 'experience'];
const CV: Step[] = ['skills', 'more'];

/** Cercle décoratif d'accent qui grandit à chaque sous-étape. */
function Blob({ index }: { index: number }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withTiming(index, { duration: 900, easing: ease.out });
  }, [index, v]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -v.value * 6 }, { translateY: v.value * 8 }, { scale: 1 + v.value * 0.12 }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -90, right: -110, width: 280, height: 280, borderRadius: 140, backgroundColor: alpha(colors.accent, 0.1) }, style]} />;
}

function Intro({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <View style={{ gap: 10 }}>
      <SlideIn>
        <Eyebrow>{eyebrow}</Eyebrow>
      </SlideIn>
      <MaskUp delay={80}>
        <Title size={32}>{title}</Title>
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
 * Étapes 3 et 4 : la recherche (poste, ville, rayon, contrats, salaire, rythme, expérience), enregistrée d'un
 * coup, puis le CV (compétences, langues, « Ce que je cherche »). Une question par écran ; « retour » ne perd
 * rien. Une inscription interrompue reprend au CV si la recherche est déjà enregistrée.
 */
export default function OnboardingProfile() {
  const { refresh } = useApp();
  const [step, setStep] = useState<Step>('role');
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState('');
  const [city, setCity] = useState<City | null>(null);
  const [radius, setRadius] = useState(20);
  const [contracts, setContracts] = useState<ContractType[]>(['cdi']);
  const [salary, setSalary] = useState<[number, number]>([38, 46]);
  const [remote, setRemote] = useState(0);
  const [available, setAvailable] = useState<string | null>(null);
  const [experience, setExperience] = useState<ExperienceBand | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [languages, setLanguages] = useState<CvLanguage[]>([]);
  const [experiences, setExperiences] = useState<CvExperience[]>([]);
  const [lookingFor, setLookingFor] = useState('');
  const [authorized, setAuthorized] = useState<'yes' | 'no' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    emploi
      .myCv()
      .then((cv) => {
        const p = cv.profile;
        setSkills(cv.skills ?? []);
        setLanguages(cv.languages ?? []);
        setExperiences(cv.experiences ?? []);
        if (!p) return;
        setRole(p.target_role);
        setCity({ city: p.search_city, postcode: p.search_postcode, lat: p.search_lat, lng: p.search_lng });
        setRadius(p.search_radius_km);
        setContracts(p.contract_types);
        setSalary([p.salary_min_k, p.salary_max_k]);
        setRemote(p.remote_days_min);
        setAvailable(p.available_from);
        setExperience(p.experience_band);
        setLookingFor(p.looking_for ?? '');
        setAuthorized(p.work_authorization ? 'yes' : 'no');
        // Recherche déjà enregistrée : on reprend au CV.
        setStep('skills');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const inSearch = SEARCH.includes(step);
  const list = inSearch ? SEARCH : CV;
  const index = Math.max(0, list.indexOf(step));
  const headerStep = inSearch ? 3 : 4;
  const fraction = step === 'done' ? 1 : index / list.length;

  const valid =
    step === 'role'
      ? role.trim().length >= 2
      : step === 'where'
        ? !!city
        : step === 'contract'
          ? contracts.length > 0
          : step === 'experience'
            ? !!experience
            : step === 'skills'
              ? skills.length >= EMPLOI_LIMITS.skillsMinForProfile
              : step === 'more'
                ? authorized != null
                : true;

  const saveSearch = async () => {
    if (!city || !experience) return;
    await emploi.saveProfile({
      target_role: role.trim().slice(0, 80),
      search_city: city.city,
      search_postcode: city.postcode,
      search_lat: city.lat,
      search_lng: city.lng,
      search_radius_km: radius,
      contract_types: contracts,
      salary_min_k: salary[0],
      salary_max_k: salary[1],
      remote_days_min: remote,
      available_from: available,
      experience_band: experience,
    });
  };

  const saveCv = async () => {
    await emploi.saveCv(experiences, skills, languages);
    await emploi.saveProfile({ looking_for: lookingFor.trim() || null, work_authorization: authorized === 'yes' });
  };

  const next = async () => {
    if (!valid) return;
    setError(null);
    const at = list.indexOf(step);
    try {
      if (step === 'experience') {
        setSaving(true);
        await saveSearch();
        setStep('skills');
        return;
      }
      if (step === 'more') {
        setSaving(true);
        await saveCv();
        setStep('done');
        setTimeout(() => refresh(), 1600);
        return;
      }
      setStep(list[at + 1]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const back = () => {
    setError(null);
    if (step === 'skills') setStep('experience');
    else if (index > 0) setStep(list[index - 1]);
  };

  const label = step === 'experience' ? 'Enregistrer ma recherche' : step === 'more' ? 'Terminer mon CV' : 'Continuer';
  const firstStep = step === 'role';

  return (
    <Screen
      scroll
      testID={`onboarding-${step}`}
      header={<StepHeader step={headerStep} fraction={fraction} onBack={!firstStep && step !== 'done' ? back : undefined} />}
      backdrop={<Blob index={SEARCH.indexOf(step) >= 0 ? SEARCH.indexOf(step) : SEARCH.length + CV.indexOf(step)} />}
      footer={
        step === 'done' ? undefined : (
          <Button
            testID="onboarding-next"
            label={label}
            loading={saving}
            disabled={!valid}
            onPress={next}
            trailing={<ArrowRightIcon size={20} color={valid ? '#FFFFFF' : colors.muted} stroke={2.4} />}
          />
        )
      }
    >
      {loading ? (
        <View style={{ paddingTop: 60, alignItems: 'center' }}>
          <Spinner />
        </View>
      ) : (
        <View key={step} style={{ gap: 22, paddingTop: 20 }}>
          {step === 'role' ? (
            <>
              <Intro eyebrow="Votre recherche" title="Quel poste visez-vous ?" sub="L’intitulé que vous chercheriez sur un site d’emploi. Il ouvre votre CV." />
              <Rise delay={250}>
                <Field testID="target-role" big value={role} onChangeText={setRole} placeholder="Data analyst" maxLength={80} autoFocus returnKeyType="next" onSubmitEditing={next} accessibilityLabel="Poste visé" />
              </Rise>
            </>
          ) : null}

          {step === 'where' ? (
            <>
              <Intro eyebrow="Votre recherche" title="Où cherchez-vous ?" sub="Le centre de votre zone. Les offres affichées sont dans ce rayon ; votre adresse n’est jamais demandée." />
              <Rise delay={250} style={{ gap: 22 }}>
                <CityField value={city} onChange={setCity} />
                <RadiusField value={radius} onChange={setRadius} />
              </Rise>
            </>
          ) : null}

          {step === 'contract' ? (
            <>
              <Intro eyebrow="Votre recherche" title="Quels contrats ?" sub="Plusieurs choix possibles." />
              <Rise delay={250}>
                <ContractsField value={contracts} onChange={setContracts} />
              </Rise>
            </>
          ) : null}

          {step === 'salary' ? (
            <>
              <Intro eyebrow="Votre recherche" title="Quel salaire visez-vous ?" sub="Chaque offre affiche sa fourchette. La vôtre aide le recruteur à voir si vous êtes d’accord dès le départ." />
              <Rise delay={250}>
                <SalaryField min={salary[0]} max={salary[1]} onChange={(a, b) => setSalary([a, b])} />
              </Rise>
            </>
          ) : null}

          {step === 'rhythm' ? (
            <>
              <Intro eyebrow="Votre recherche" title="Votre rythme" />
              <Rise delay={200} style={{ gap: 22 }}>
                <RemoteField value={remote} onChange={setRemote} />
                <View style={{ gap: 10 }}>
                  <Label>Disponible</Label>
                  <AvailabilityField value={available} onChange={setAvailable} />
                </View>
              </Rise>
            </>
          ) : null}

          {step === 'experience' ? (
            <>
              <Intro eyebrow="Votre recherche" title="Combien d’années d’expérience ?" sub="Montrées en tranche, jamais en dates : c’est plus juste, et cela ne dit rien de votre âge." />
              <Rise delay={250}>
                <ExperienceField value={experience} onChange={setExperience} />
              </Rise>
              {error ? <Notice kind="error" testID="profile-error" message={error} /> : null}
            </>
          ) : null}

          {step === 'skills' ? (
            <>
              <Intro eyebrow="Votre CV" title="Vos compétences" sub="Trois au moins. Ce sont elles qui remplissent « Vous avez déjà » sur chaque offre." />
              <Rise delay={250}>
                <SkillsField value={skills} onChange={setSkills} />
              </Rise>
            </>
          ) : null}

          {step === 'more' ? (
            <>
              <Intro eyebrow="Votre CV" title="Derniers détails" sub="Les langues et les expériences sont facultatives ; vous les compléterez quand vous voudrez." />
              <Rise delay={200} style={{ gap: 22 }}>
                <View style={{ gap: 10 }}>
                  <Label>Êtes-vous autorisé·e à travailler en France ?</Label>
                  <Segmented
                    testID="work-authorization"
                    label="Autorisation de travailler en France"
                    options={[
                      { value: 'yes', label: 'Oui' },
                      { value: 'no', label: 'Pas encore' },
                    ]}
                    value={authorized ?? ('' as 'yes')}
                    onChange={setAuthorized}
                  />
                  <Small>La seule question administrative que nous posons. Votre nationalité n’est jamais demandée.</Small>
                </View>
                <LookingForField value={lookingFor} onChange={setLookingFor} />
                <View style={{ gap: 10 }}>
                  <Label>Langues</Label>
                  <LanguagesField value={languages} onChange={setLanguages} />
                </View>
                <View style={{ gap: 10 }}>
                  <Label>Expériences</Label>
                  <ExperiencesField value={experiences} onChange={setExperiences} />
                </View>
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
                <Title size={32} align="center">
                  Votre CV est prêt.
                </Title>
              </MaskUp>
              <Rise delay={600}>
                <Body secondary align="center">
                  Anonyme jusqu’au match. Place aux offres.
                </Body>
              </Rise>
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
