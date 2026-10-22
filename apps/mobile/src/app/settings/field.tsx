import { STUDY_FIELD_LABELS, STUDY_FIELDS, type StudyField } from '@sapios/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { OptionCard } from '@/components/Controls';
import { MaskUp, Rise, Spinner, stagger } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { Header, Screen } from '@/components/Screen';
import { Body, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';
import { errorMessage } from '@/lib/errors';
import { loadMyIntellect, loadOwnInstitution, saveIntellectFlags } from '@/lib/intellect';

/** Domaine d'études affiché sur le profil (un seul). Celui du diplôme vérifié est signalé. */
export default function FieldScreen() {
  const { userId, refresh } = useApp();
  const { toast } = useOverlay();
  const [field, setField] = useState<StudyField | null>(null);
  const [verified, setVerified] = useState<StudyField | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/account'));

  useEffect(() => {
    if (!userId) return;
    Promise.all([loadMyIntellect(userId), loadOwnInstitution(userId)])
      .then(([mine, access]) => {
        setField(mine.studyField);
        setVerified(access.field);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [userId]);

  const save = async () => {
    if (!userId) return;
    try {
      await saveIntellectFlags(userId, { study_field: field });
      await refresh();
      toast('Domaine enregistré.');
      back();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen scroll testID="field" header={<Header onBack={back} />} footer={<Button testID="field-save" label="Enregistrer" disabled={loading} onPress={save} />}>
      <View style={{ gap: 8, paddingTop: 4 }}>
        <MaskUp>
          <Title size={30}>Votre domaine</Title>
        </MaskUp>
        <Rise delay={120}>
          <Body muted size={15.5}>
            Celui de vos études. Il s’affiche sur votre profil et rapproche les esprits voisins.
          </Body>
        </Rise>
      </View>
      {error ? <Notice kind="error" message={error} style={{ marginTop: 14 }} /> : null}
      {loading ? (
        <View style={{ paddingTop: 50, alignItems: 'center' }}>
          <Spinner />
        </View>
      ) : (
        <View role="radiogroup" accessibilityLabel="Domaine d’études" style={{ gap: 10, marginTop: 18 }}>
          {STUDY_FIELDS.map((f, i) => (
            <Rise key={f} delay={stagger(i, 160, 35)}>
              <OptionCard testID={`field-${f}`} label={STUDY_FIELD_LABELS[f]} hint={verified === f ? 'Celui de votre diplôme vérifié' : undefined} active={field === f} onPress={() => setField(f)} />
            </Rise>
          ))}
        </View>
      )}
    </Screen>
  );
}
