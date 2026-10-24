import { EMPLOI_LIMITS, LANGUAGE_LEVEL_LABELS, LANGUAGE_LEVELS, type CvExperience, type CvLanguage, type LanguageLevel } from '@sapios/shared';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { monthsLabel } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import { Button, IconButton } from './Button';
import { Checkbox, Segmented } from './Controls';
import { Field } from './Field';
import { CrossIcon, EditIcon, PlusIcon } from './Icons';
import { Body, Label, Small } from './Text';

/** Compétences : pastilles, ajout par saisie (Entrée), 10 au plus. */
export function SkillsField({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const label = draft.trim().slice(0, 40);
    if (!label || value.some((s) => s.toLowerCase() === label.toLowerCase()) || value.length >= EMPLOI_LIMITS.skillsMax) return;
    onChange([...value, label]);
    setDraft('');
  };
  return (
    <View style={{ gap: 12 }}>
      {value.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {value.map((s) => (
            <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.text, borderRadius: radius.pill, paddingLeft: 14, paddingRight: 4, minHeight: 38 }}>
              <Body size={14.5} weight="bold" color="#FFFFFF">
                {s}
              </Body>
              <IconButton label={`Retirer ${s}`} variant="plain" size={32} onPress={() => onChange(value.filter((x) => x !== s))}>
                <CrossIcon size={14} stroke={2.6} color="#FFFFFF" />
              </IconButton>
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field
            testID="skill-input"
            label="Ajouter une compétence"
            value={draft}
            onChangeText={setDraft}
            placeholder="Python, SQL, gestion de projet…"
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={add}
          />
        </View>
        <Button testID="skill-add" label="Ajouter" variant="secondary" size="md" disabled={!draft.trim() || value.length >= EMPLOI_LIMITS.skillsMax} onPress={add} />
      </View>
      <Small>
        {value.length} / {EMPLOI_LIMITS.skillsMax}. Écrivez-les comme dans les offres : ce sont elles qui comptent dans « Vous avez déjà ».
      </Small>
    </View>
  );
}

/** Langues : nom libre et niveau du cadre européen (A2 à C2). « Natif » n'existe pas : il renvoie à l'origine. */
export function LanguagesField({ value, onChange }: { value: CvLanguage[]; onChange: (v: CvLanguage[]) => void }) {
  const [language, setLanguage] = useState('');
  const [level, setLevel] = useState<LanguageLevel>('b2');
  const add = () => {
    const name = language.trim().slice(0, 30);
    if (name.length < 2 || value.some((l) => l.language.toLowerCase() === name.toLowerCase()) || value.length >= EMPLOI_LIMITS.languagesMax) return;
    onChange([...value, { language: name.charAt(0).toUpperCase() + name.slice(1), level }]);
    setLanguage('');
  };
  return (
    <View style={{ gap: 12 }}>
      {value.map((l) => (
        <View key={l.language} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 16, paddingLeft: 16, paddingRight: 6, minHeight: 52 }}>
          <Body weight="bold" size={15} style={{ flex: 1 }}>
            {l.language}
          </Body>
          <Small weight="semibold" color={colors.text}>
            {LANGUAGE_LEVEL_LABELS[l.level]}
          </Small>
          <IconButton label={`Retirer ${l.language}`} variant="plain" size={40} onPress={() => onChange(value.filter((x) => x.language !== l.language))}>
            <CrossIcon size={16} />
          </IconButton>
        </View>
      ))}
      {value.length < EMPLOI_LIMITS.languagesMax ? (
        <View style={{ gap: 10 }}>
          <Field testID="language-input" label="Ajouter une langue" value={language} onChangeText={setLanguage} placeholder="Anglais, espagnol…" maxLength={30} onSubmitEditing={add} />
          <Segmented testID="language-level" label="Niveau" options={LANGUAGE_LEVELS.map((v) => ({ value: v, label: v.toUpperCase() }))} value={level} onChange={setLevel} />
          <Small>{LANGUAGE_LEVEL_LABELS[level]}</Small>
          <Button testID="language-add" label="Ajouter cette langue" variant="secondary" size="md" disabled={language.trim().length < 2} onPress={add} icon={<PlusIcon size={18} />} />
        </View>
      ) : null}
    </View>
  );
}

function monthsBetween(start: string, end: string | null): number {
  const a = new Date(`${start.slice(0, 7)}-01T12:00:00`);
  const b = end ? new Date(`${end.slice(0, 7)}-01T12:00:00`) : new Date();
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth());
}

const MONTH = /^(\d{2})\/(\d{4})$/;

function toMonth(text: string): string | null {
  const m = MONTH.exec(text.trim());
  if (!m) return null;
  const month = Number(m[1]);
  if (month < 1 || month > 12) return null;
  return `${m[2]}-${m[1]}-01`;
}

function fromMonth(iso: string | null): string {
  return iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
}

/** Formulaire d'une expérience (ajout ou modification). Les dates restent privées : le recruteur voit une durée. */
function ExperienceForm({ initial, onSave, onCancel }: { initial?: CvExperience; onSave: (e: CvExperience) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [employer, setEmployer] = useState(initial?.employer ?? '');
  const [hidden, setHidden] = useState(initial?.employer_hidden ?? false);
  const [start, setStart] = useState(fromMonth(initial?.start_month ?? null));
  const [current, setCurrent] = useState(initial ? initial.end_month == null : false);
  const [end, setEnd] = useState(fromMonth(initial?.end_month ?? null));
  const [summary, setSummary] = useState(initial?.summary ?? '');
  const startIso = toMonth(start);
  const endIso = current ? null : toMonth(end);
  const ok = title.trim().length >= 2 && employer.trim().length >= 1 && !!startIso && (current || (!!endIso && endIso >= startIso));
  return (
    <View testID="experience-form" style={{ borderWidth: 1.5, borderColor: colors.accent, borderRadius: radius.card, padding: 16, gap: 12 }}>
      <Field testID="exp-title" label="Intitulé du poste" value={title} onChangeText={setTitle} maxLength={80} placeholder="Data analyst en alternance" />
      <Field testID="exp-employer" label="Employeur" value={employer} onChangeText={setEmployer} maxLength={80} />
      <Checkbox testID="exp-hidden" checked={hidden} onChange={setHidden} label="Masquer le nom de l’employeur aux recruteurs (il apparaîtra « Employeur masqué »)" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field testID="exp-start" label="Début (MM/AAAA)" value={start} onChangeText={setStart} placeholder="09/2025" keyboardType="numbers-and-punctuation" maxLength={7} />
        </View>
        {current ? null : (
          <View style={{ flex: 1 }}>
            <Field testID="exp-end" label="Fin (MM/AAAA)" value={end} onChangeText={setEnd} placeholder="09/2026" keyboardType="numbers-and-punctuation" maxLength={7} />
          </View>
        )}
      </View>
      <Checkbox testID="exp-current" checked={current} onChange={setCurrent} label="Poste actuel" />
      <Field testID="exp-summary" label="En une phrase (facultatif)" value={summary} onChangeText={setSummary} maxLength={300} multiline counter />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="Annuler" variant="ghost" size="md" onPress={onCancel} />
        <Button
          testID="exp-save"
          label="Enregistrer l’expérience"
          size="md"
          style={{ flex: 1 }}
          disabled={!ok}
          onPress={() =>
            onSave({ id: initial?.id, title: title.trim(), employer: employer.trim(), employer_hidden: hidden, start_month: startIso!, end_month: endIso, summary: summary.trim() || null })
          }
        />
      </View>
      {!ok && start && !startIso ? <Small color={colors.danger}>Date au format MM/AAAA, par exemple 09/2025.</Small> : null}
    </View>
  );
}

/** Expériences : liste (plus récente en premier), ajout et modification en place. */
export function ExperiencesField({ value, onChange }: { value: CvExperience[]; onChange: (v: CvExperience[]) => void }) {
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const sorted = [...value].sort((a, b) => (b.end_month ?? '9999').localeCompare(a.end_month ?? '9999') || b.start_month.localeCompare(a.start_month));
  const save = (e: CvExperience, index: number | 'new') => {
    const next = index === 'new' ? [...sorted, e] : sorted.map((x, i) => (i === index ? e : x));
    onChange(next);
    setEditing(null);
  };
  return (
    <View style={{ gap: 10 }}>
      {sorted.map((e, i) =>
        editing === i ? (
          <ExperienceForm key={`edit-${i}`} initial={e} onSave={(x) => save(x, i)} onCancel={() => setEditing(null)} />
        ) : (
          <View key={`${e.title}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 18, padding: 14 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Body weight="bold" size={15}>
                {e.title}
              </Body>
              <Small>
                {e.employer_hidden ? `${e.employer} (masqué)` : e.employer} · {monthsLabel(monthsBetween(e.start_month, e.end_month))}
                {e.end_month ? '' : ', en cours'}
              </Small>
            </View>
            <IconButton label={`Modifier ${e.title}`} variant="plain" size={40} onPress={() => setEditing(i)}>
              <EditIcon size={18} />
            </IconButton>
            <IconButton label={`Retirer ${e.title}`} variant="plain" size={40} onPress={() => onChange(sorted.filter((_, j) => j !== i))}>
              <CrossIcon size={16} />
            </IconButton>
          </View>
        ),
      )}
      {editing === 'new' ? (
        <ExperienceForm onSave={(x) => save(x, 'new')} onCancel={() => setEditing(null)} />
      ) : sorted.length < EMPLOI_LIMITS.experiencesMax ? (
        <Pressable testID="experience-add" accessibilityRole="button" onPress={() => setEditing('new')}>
          {({ pressed }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: pressed ? colors.accent : colors.disabled }}>
              <PlusIcon size={18} color={colors.accent} />
              <Body weight="bold" size={15} color={colors.accent}>
                Ajouter une expérience
              </Body>
            </View>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

/** « Ce que je cherche dans mon prochain poste » : une phrase, montrée au recruteur. */
export function LookingForField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Field
        testID="looking-for"
        label="Ce que je cherche dans mon prochain poste"
        value={value}
        onChangeText={onChange}
        maxLength={EMPLOI_LIMITS.lookingForMax}
        multiline
        counter
        placeholder="Une équipe qui décide avec des chiffres, pas avec des intuitions."
      />
      <Small>Évitez tout ce qui permettrait de vous reconnaître : nom, âge, situation familiale.</Small>
    </View>
  );
}

/** Rappel compact, utilisé dans les étapes d'inscription. */
export function SectionLabel({ children }: { children: string }) {
  return <Label style={{ marginTop: 6 }}>{children}</Label>;
}

