import { EMPLOI_LIMITS, EXPERIENCE_BAND_LABELS, LANGUAGE_LEVEL_LABELS, LANGUAGE_LEVELS, type CvExperience, type LanguageLevel } from '@sapios/shared';
import type { CvImportResult, ImportedExperience } from '@sapios/shared/cv-import';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button, IconButton, TextLink } from '@/components/Button';
import { Checkbox, Chip, ChipRow, Segmented } from '@/components/Controls';
import { ExperienceForm } from '@/components/CvFields';
import { Field } from '@/components/Field';
import { CapIcon, EditIcon, LockIcon } from '@/components/Icons';
import { MaskUp, Rise } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { Header, Screen } from '@/components/Screen';
import { Body, Eyebrow, Heading, Small, Title } from '@/components/Text';
import { parisToday } from '@/lib/cvImport';
import { cvImportStore, type CvImportApply, type PendingImport } from '@/lib/cvImportStore';
import { monthsLabel } from '@/lib/format';
import { alpha, colors, radius } from '@/lib/theme';

const FORMAT_LABELS: Record<CvImportResult['format'], { title: string; note: string }> = {
  europass: { title: 'CV Europass', note: 'Lu en entier depuis ses données Europass.' },
  linkedin: { title: 'Export LinkedIn', note: 'Lu en entier : vérifiez tout de même chaque ligne.' },
  generic: { title: 'CV', note: 'Lu par règles fixes, sans IA : à vérifier ligne à ligne.' },
};

type ExpItem = { exp: CvExperience; approximate: boolean; checked: boolean; editing: boolean };
type LangItem = { language: string; level: LanguageLevel | null; checked: boolean; existing: boolean };

function toCvExperience(e: ImportedExperience): CvExperience {
  return { title: e.title, employer: e.employer, employer_hidden: false, start_month: e.start_month, end_month: e.end_month, summary: e.summary };
}

function valid(e: CvExperience): boolean {
  return e.title.trim().length >= 2 && e.employer.trim().length >= 1 && /^\d{4}-\d{2}-01$/.test(e.start_month) && (e.end_month == null || e.end_month >= e.start_month);
}

function monthsBetween(start: string, end: string | null, today: string): number {
  const toIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
  return Math.max(0, toIndex(end ?? today) - toIndex(start));
}

const key = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/** Relecture d'un CV importé : rien n'est ajouté sans votre accord, rien n'est enregistré ici. */
export default function CvImportReview() {
  const [pending] = useState<PendingImport | null>(() => cvImportStore.get());
  const close = () => {
    cvImportStore.clear();
    if (router.canGoBack()) router.back();
    else router.replace('/settings/cv');
  };
  if (!pending) {
    return (
      <Screen scroll header={<Header onBack={close} />}>
        <View style={{ gap: 16, paddingTop: 12 }}>
          <Title size={28}>Import interrompu</Title>
          <Body secondary>La page a été rechargée : par sécurité, le CV lu n’a été gardé nulle part. Relancez l’import depuis Mon CV.</Body>
          <Button label="Revenir à mon CV" onPress={close} />
        </View>
      </Screen>
    );
  }
  return <Review pending={pending} onClose={close} />;
}

function Review({ pending, onClose }: { pending: PendingImport; onClose: () => void }) {
  const { confirm, toast } = useOverlay();
  const { result, reader, current } = pending;
  const today = useMemo(() => parisToday(), []);

  // Compétences : déjà au CV (grisées), puis cochées dans l'ordre jusqu'à 10 au total.
  const currentSkillKeys = new Set(current.skills.map(key));
  const newSkills = result.skills.filter((s) => !currentSkillKeys.has(key(s.label)));
  const [skillOn, setSkillOn] = useState<Record<string, boolean>>(() => {
    const room = Math.max(0, EMPLOI_LIMITS.skillsMax - current.skills.length);
    return Object.fromEntries(newSkills.map((s, i) => [s.label, i < room]));
  });
  const [langs, setLangs] = useState<LangItem[]>(() => {
    const have = new Set(current.languages.map((l) => key(l.language)));
    return result.languages.map((l) => ({ language: l.language, level: l.level, checked: !have.has(key(l.language)), existing: have.has(key(l.language)) }));
  });
  const [exps, setExps] = useState<ExpItem[]>(() =>
    result.experiences.map((e) => {
      const exp = toCvExperience(e);
      return { exp, approximate: e.approximate, checked: valid(exp), editing: false };
    }),
  );
  const [role, setRole] = useState(result.target_role ?? '');
  const [roleOn, setRoleOn] = useState(!!result.target_role && !pending.currentRole);
  const [bandOn, setBandOn] = useState(!!result.experience_band && !pending.currentBand);

  const pickedSkills = newSkills.filter((s) => skillOn[s.label]).map((s) => s.label);
  const skillRoom = EMPLOI_LIMITS.skillsMax - current.skills.length - pickedSkills.length;
  const pickedLangs = langs.filter((l) => l.checked && !l.existing);
  const pickedExps = exps.filter((e) => e.checked);
  const blocking = pickedLangs.some((l) => !l.level) || pickedExps.some((e) => !valid(e.exp)) || exps.some((e) => e.editing);
  const count = pickedSkills.length + pickedLangs.length + pickedExps.length + (roleOn ? 1 : 0) + (bandOn ? 1 : 0);

  const showRole = !!result.target_role && key(result.target_role) !== key(pending.currentRole ?? '');
  const showBand = !!result.experience_band && result.experience_band !== pending.currentBand;

  const apply = async (mode: 'add' | 'replace') => {
    if (mode === 'replace') {
      const ok = await confirm({
        title: 'Remplacer votre CV ?',
        message: 'Les compétences, langues et expériences actuelles seront remplacées par celles que vous avez cochées, rubrique par rubrique. Rien n’est enregistré tant que vous n’avez pas validé votre CV.',
        confirm: 'Remplacer',
        destructive: true,
      });
      if (!ok) return;
    }
    const imported = {
      skills: pickedSkills,
      languages: pickedLangs.map((l) => ({ language: l.language, level: l.level as LanguageLevel })),
      experiences: pickedExps.map((e) => ({ ...e.exp, title: e.exp.title.trim(), employer: e.exp.employer.trim() })),
    };
    const parts = reader.mergeCv(current, imported, mode);
    const profile: CvImportApply['profile'] = {};
    if (roleOn && role.trim().length >= 2) profile.target_role = role.trim().slice(0, 80);
    if (bandOn && result.experience_band) profile.experience_band = result.experience_band;
    pending.onApply({ parts, profile });
    toast('Importé. Vérifiez, puis enregistrez votre CV.');
    onClose();
  };

  const fmt = FORMAT_LABELS[result.format];
  const ignored = result.ignored.map((c) => reader.CV_IGNORED_LABELS[c]);
  const nothing = !result.skills.length && !result.languages.length && !result.experiences.length && !result.target_role;

  return (
    <Screen
      scroll
      testID="cv-import-review"
      header={<Header onBack={onClose} backLabel="Annuler l’import" />}
      footer={
        nothing ? (
          <Button label="Revenir à mon CV" onPress={onClose} />
        ) : (
          <View style={{ gap: 8 }}>
            {blocking ? <Small color={colors.danger}>Complétez ou décochez les éléments signalés.</Small> : null}
            <Button testID="cv-import-add" label={count ? `Ajouter à mon CV (${count})` : 'Ajouter à mon CV'} disabled={blocking || !count} onPress={() => apply('add')} />
            <Button testID="cv-import-replace" label="Remplacer mon CV" variant="ghost" size="md" disabled={blocking || !count} onPress={() => apply('replace')} />
          </View>
        )
      }
    >
      <View style={{ gap: 22, paddingTop: 4 }}>
        <MaskUp>
          <Title size={30}>Vérifiez avant d’ajouter</Title>
        </MaskUp>
        <Rise style={{ gap: 12 }}>
          <View testID="cv-import-format" style={{ backgroundColor: alpha(colors.accent, 0.08), borderRadius: radius.tile, padding: 14, gap: 2 }}>
            <Body weight="bold" size={15} color={colors.accent}>
              {fmt.title}
            </Body>
            <Small>{fmt.note}</Small>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <LockIcon size={16} color={colors.muted} />
            <Small style={{ flex: 1 }} testID="cv-import-local">
              Votre fichier reste sur votre appareil : rien n’a été envoyé.
            </Small>
          </View>
          <Notice
            testID="cv-import-ignored"
            title="Ce que nous avons ignoré"
            message={
              ignored.length
                ? `${ignored.join(', ')}. Nous ne les lisons jamais : le recruteur ne voit ni votre nom ni votre photo avant le match.`
                : 'Nous ne lisons jamais votre nom, photo, âge, adresse, nationalité, situation familiale, email ni téléphone.'
            }
          />
          {result.warnings.map((w) => (
            <Notice key={w} kind={w === 'no_text' ? 'error' : 'info'} icon="alert" message={reader.CV_WARNING_LABELS[w]} testID={`cv-import-warning-${w}`} />
          ))}
        </Rise>

        {showRole || showBand ? (
          <View style={{ gap: 12 }}>
            <Heading size={18}>Votre recherche</Heading>
            {showRole ? (
              <View style={{ gap: 8 }}>
                <Checkbox testID="cv-import-role" checked={roleOn} onChange={setRoleOn} label={pending.currentRole ? `Remplacer le poste visé (${pending.currentRole})` : 'Poste visé'} />
                {roleOn ? <Field testID="cv-import-role-input" label="Poste visé" value={role} onChangeText={setRole} maxLength={80} /> : null}
              </View>
            ) : null}
            {showBand && result.experience_band ? (
              <Checkbox
                testID="cv-import-band"
                checked={bandOn}
                onChange={setBandOn}
                label={`Expérience : ${EXPERIENCE_BAND_LABELS[result.experience_band]}${pending.currentBand ? ` (au lieu de ${EXPERIENCE_BAND_LABELS[pending.currentBand]})` : ''}`}
              />
            ) : null}
          </View>
        ) : null}

        {result.skills.length ? (
          <View style={{ gap: 12 }}>
            <Heading size={18}>Compétences</Heading>
            <ChipRow>
              {result.skills.map((s) => {
                const already = currentSkillKeys.has(key(s.label));
                const on = already || !!skillOn[s.label];
                return (
                  <Chip
                    key={s.label}
                    testID={`cv-import-skill-${key(s.label)}`}
                    label={already ? `${s.label} · déjà au CV` : s.label}
                    active={on}
                    disabled={already || (!on && skillRoom <= 0)}
                    onPress={() => setSkillOn((m) => ({ ...m, [s.label]: !m[s.label] }))}
                  />
                );
              })}
            </ChipRow>
            <Small>
              {current.skills.length + pickedSkills.length} / {EMPLOI_LIMITS.skillsMax} compétences au CV. Celles écrites telles quelles dans votre CV sont gardées mot pour mot.
            </Small>
          </View>
        ) : null}

        {langs.length ? (
          <View style={{ gap: 12 }}>
            <Heading size={18}>Langues</Heading>
            {langs.map((l, i) => (
              <View key={l.language} style={{ gap: 8, backgroundColor: colors.surface, borderRadius: 16, padding: 14 }}>
                <Checkbox
                  testID={`cv-import-lang-${key(l.language)}`}
                  checked={l.checked && !l.existing}
                  onChange={(v) => setLangs((ls) => ls.map((x, j) => (j === i ? { ...x, checked: v } : x)))}
                  label={l.existing ? `${l.language} · déjà au CV, niveau inchangé` : l.language}
                />
                {l.checked && !l.existing ? (
                  <View style={{ gap: 6 }}>
                    <Segmented
                      testID={`cv-import-lang-level-${key(l.language)}`}
                      label={`Niveau en ${l.language}`}
                      options={LANGUAGE_LEVELS.map((v) => ({ value: v, label: v.toUpperCase() }))}
                      value={l.level ?? ('' as LanguageLevel)}
                      onChange={(v) => setLangs((ls) => ls.map((x, j) => (j === i ? { ...x, level: v } : x)))}
                    />
                    <Small color={l.level ? colors.secondary : colors.danger}>{l.level ? LANGUAGE_LEVEL_LABELS[l.level] : 'Niveau absent du CV : choisissez-le.'}</Small>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {exps.length ? (
          <View style={{ gap: 12 }}>
            <Heading size={18}>Expériences</Heading>
            <Small>Le recruteur voit les deux plus récentes, en durée, jamais les dates.</Small>
            {exps.map((item, i) =>
              item.editing ? (
                <ExperienceForm
                  key={`edit-${i}`}
                  initial={item.exp}
                  onCancel={() => setExps((xs) => xs.map((x, j) => (j === i ? { ...x, editing: false } : x)))}
                  onSave={(e) => setExps((xs) => xs.map((x, j) => (j === i ? { exp: e, approximate: false, checked: true, editing: false } : x)))}
                />
              ) : (
                <View key={`exp-${i}`} testID={`cv-import-exp-${i}`} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.surface, borderRadius: 18, padding: 14 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Checkbox
                      testID={`cv-import-exp-check-${i}`}
                      checked={item.checked}
                      onChange={(v) => setExps((xs) => xs.map((x, j) => (j === i ? { ...x, checked: v } : x)))}
                      label={`${item.exp.title || 'Intitulé à compléter'} · ${item.exp.employer || 'employeur à compléter'}`}
                    />
                    <Small style={{ paddingLeft: 40 }}>
                      {item.exp.start_month.slice(5, 7)}/{item.exp.start_month.slice(0, 4)} – {item.exp.end_month ? `${item.exp.end_month.slice(5, 7)}/${item.exp.end_month.slice(0, 4)}` : 'aujourd’hui'} ·{' '}
                      {monthsLabel(monthsBetween(item.exp.start_month, item.exp.end_month, today))}
                    </Small>
                    {item.exp.summary ? (
                      <Small style={{ paddingLeft: 40 }} numberOfLines={3}>
                        {item.exp.summary}
                      </Small>
                    ) : null}
                    {item.approximate ? (
                      <Small style={{ paddingLeft: 40 }} weight="semibold" color={colors.accent}>
                        Mois à préciser : votre CV ne donne que l’année.
                      </Small>
                    ) : null}
                    {item.checked && !valid(item.exp) ? (
                      <Small style={{ paddingLeft: 40 }} weight="semibold" color={colors.danger}>
                        À compléter avant d’ajouter.
                      </Small>
                    ) : null}
                  </View>
                  <IconButton label={`Modifier ${item.exp.title || 'cette expérience'}`} variant="plain" size={40} onPress={() => setExps((xs) => xs.map((x, j) => (j === i ? { ...x, editing: true } : x)))}>
                    <EditIcon size={18} />
                  </IconButton>
                </View>
              ),
            )}
            {current.experiences.length + pickedExps.length > EMPLOI_LIMITS.experiencesMax ? (
              <Small color={colors.danger}>Au-delà de {EMPLOI_LIMITS.experiencesMax} expériences, les dernières ne seront pas ajoutées.</Small>
            ) : null}
          </View>
        ) : null}

        {result.education_hints.length ? (
          <View style={{ gap: 10 }}>
            <Heading size={18}>Formation détectée</Heading>
            <Small>Votre CV ne garde pas de rubrique « Formation » : seul le badge du diplôme vérifié est montré aux recruteurs.</Small>
            {result.education_hints.map((h, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <CapIcon size={18} color={colors.muted} />
                <Small style={{ flex: 1 }}>{[h.degree, h.school, h.years].filter(Boolean).join(' · ')}</Small>
              </View>
            ))}
            {pending.showDiplomaLink ? (
              <TextLink
                testID="cv-import-diploma"
                label="Faire vérifier mon diplôme"
                onPress={() => {
                  cvImportStore.clear();
                  router.replace('/diploma');
                }}
              />
            ) : null}
          </View>
        ) : null}

        {nothing ? <Eyebrow>Rien à ajouter depuis ce fichier.</Eyebrow> : null}
      </View>
    </Screen>
  );
}
