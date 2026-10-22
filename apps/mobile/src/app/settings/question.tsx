import { MAX_ANSWERS } from '@sapios/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { ProgressBar } from '@/components/Controls';
import { Field } from '@/components/Field';
import { CheckIcon } from '@/components/Icons';
import { MaskUp, Rise, Spinner, stagger } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { Header, Screen } from '@/components/Screen';
import { Body, Small, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';
import { useCopy } from '@/lib/copy';
import { errorMessage } from '@/lib/errors';
import { ANSWER_UI_MAX, deleteAnswer, loadMyIntellect, loadPromptKeys, promptText, saveAnswer, type MyAnswer } from '@/lib/intellect';
import { alpha, colors } from '@/lib/theme';

/**
 * Choisir une question puis y répondre (position 0 à 2) : la question choisie s'ouvre sur le champ de
 * réponse. Une question déjà utilisée ailleurs est grisée. Enregistrer, ou retirer la réponse.
 */
export default function QuestionScreen() {
  const { position: raw } = useLocalSearchParams<{ position?: string }>();
  const position = Math.min(Math.max(Number(raw ?? 0) || 0, 0), MAX_ANSWERS - 1);
  const { userId, refresh } = useApp();
  const { t } = useCopy();
  const { toast, confirm } = useOverlay();
  const [keys, setKeys] = useState<string[] | null>(null);
  const [answers, setAnswers] = useState<MyAnswer[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const current = answers.find((a) => a.position === position) ?? null;

  useEffect(() => {
    if (!userId) return;
    Promise.all([loadPromptKeys(), loadMyIntellect(userId)])
      .then(([k, mine]) => {
        setAnswers(mine.answers);
        const own = mine.answers.find((a) => a.position === position);
        // Une question désactivée depuis reste affichée pour la réponse qui l'utilise.
        setKeys(own && !k.includes(own.prompt_key) ? [own.prompt_key, ...k] : k);
        if (own) {
          setPicked(own.prompt_key);
          setText(own.answer);
        }
      })
      .catch((e) => setError(errorMessage(e)));
  }, [position, userId]);

  const used = useMemo(() => new Map(answers.filter((a) => a.position !== position).map((a) => [a.prompt_key, a])), [answers, position]);
  const valid = !!picked && text.trim().length > 0 && text.trim().length <= ANSWER_UI_MAX;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/account'));

  const save = async () => {
    if (!picked || !valid) return;
    setSaving(true);
    setError(null);
    try {
      await saveAnswer(position, picked, text);
      await refresh();
      toast('Réponse enregistrée.');
      back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!userId || !current) return;
    const ok = await confirm({ title: 'Retirer cette réponse ?', message: 'Les likes déjà reçus sur elle restent, mais elle disparaît de votre profil.', confirm: 'Retirer' });
    if (!ok) return;
    try {
      await deleteAnswer(userId, position);
      await refresh();
      toast('Réponse retirée.');
      back();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen
      scroll
      testID="question"
      header={<Header onBack={back} backLabel="Retour à mon profil" />}
      footer={
        <>
          <Button testID="answer-save" label="Enregistrer" disabled={!valid} loading={saving} onPress={save} />
          {current ? <Button testID="answer-delete" label="Retirer cette réponse" variant="danger" onPress={remove} /> : <Button label="Annuler" variant="ghost" onPress={back} />}
        </>
      }
    >
      <View style={{ gap: 8, paddingTop: 4 }}>
        <MaskUp>
          <Title size={30}>Choisissez une question</Title>
        </MaskUp>
        <Rise delay={120}>
          <Body muted size={15.5}>
            Une réponse courte, avec du caractère.
          </Body>
        </Rise>
      </View>
      {error ? <Notice kind="error" message={error} style={{ marginTop: 14 }} /> : null}
      {!keys && !error ? (
        <View style={{ paddingTop: 50, alignItems: 'center' }}>
          <Spinner />
        </View>
      ) : null}
      <View style={{ gap: 10, marginTop: 18 }} role="radiogroup" accessibilityLabel="Questions">
        {(keys ?? []).map((key, i) => {
          const label = promptText(t, key);
          const taken = used.has(key);
          const open = picked === key;
          return (
            <Rise key={key} delay={stagger(Math.min(i, 10), 160, 40)}>
              {open ? (
                <View style={{ borderWidth: 2, borderColor: colors.accent, backgroundColor: alpha(colors.accent, 0.05), borderRadius: 20, padding: 16, gap: 10 }} testID={`prompt-open-${key}`}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                      <CheckIcon size={13} stroke={3} color="#FFFFFF" />
                    </View>
                    <Body weight="bold" size={16} style={{ flex: 1 }}>
                      {label}
                    </Body>
                  </View>
                  <Field
                    testID="answer-text"
                    accessibilityLabel={label}
                    value={text}
                    onChangeText={setText}
                    placeholder="Une phrase suffit. Deux si elles sont bonnes."
                    multiline
                    maxLength={ANSWER_UI_MAX}
                    autoFocus
                  />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ProgressBar value={text.length / ANSWER_UI_MAX} label="Longueur de la réponse" height={4} />
                    <Small size={13} weight="semibold">
                      {text.length} / {ANSWER_UI_MAX}
                    </Small>
                  </View>
                  <Small>{t('intellect.sensitive')}</Small>
                </View>
              ) : (
                <Pressable
                  testID={`prompt-${key}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: false, disabled: taken }}
                  accessibilityLabel={taken ? `${label}, déjà choisie` : label}
                  disabled={taken}
                  onPress={() => {
                    setPicked(key);
                    if (current && current.prompt_key !== key && text === current.answer) setText('');
                  }}
                >
                  {({ pressed }) => (
                    <View style={{ minHeight: 60, borderRadius: 20, borderWidth: 1.5, borderColor: pressed ? colors.accent : colors.line, paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: taken ? 0.45 : 1, backgroundColor: colors.bg }}>
                      <Body weight="semibold" size={16} style={{ flex: 1 }}>
                        {label}
                      </Body>
                      {taken ? (
                        <Small size={12.5} weight="bold">
                          Déjà choisie
                        </Small>
                      ) : null}
                    </View>
                  )}
                </Pressable>
              )}
            </Rise>
          );
        })}
      </View>
    </Screen>
  );
}
