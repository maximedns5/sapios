import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { ScanCard, type DiplomaContent } from '@/components/DiplomaCard';
import { Notice } from '@/components/Notice';
import { RevealLines } from '@/components/Reveal';
import { Rule, Screen, TopBar } from '@/components/Screen';
import { Body, Em, Label, Mono, Title } from '@/components/Text';
import { useTone } from '@/components/Tone';
import { useApp } from '@/lib/app-state';
import { useCopy } from '@/lib/copy';
import { loadLegalName } from '@/lib/profile';
import { pushPermission, PUSH_SUPPORTED, registerForPush } from '@/lib/push';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Reçu',
  processing: 'Extraction',
  needs_review: 'En revue',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Attente du verdict : la soumission est en file, puis en revue humaine. */
export default function Review() {
  const { t } = useCopy();
  const { state, userId, refresh, loadingState } = useApp();
  const { fg, bg } = useTone();
  const [legal, setLegal] = useState<string | null>(null);
  const [push, setPush] = useState<'granted' | 'denied' | 'undetermined' | 'unavailable'>('unavailable');
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const sub = state?.latest_submission;

  useEffect(() => {
    if (userId) loadLegalName(userId).then(setLegal);
    pushPermission().then(setPush);
  }, [userId]);

  // Relève l'état toutes les 20 s tant que l'écran est affiché (la notification de verdict prend le relais).
  useFocusEffect(
    useCallback(() => {
      const id = setInterval(() => refresh(), 20000);
      return () => clearInterval(id);
    }, [refresh]),
  );

  const content = useMemo<DiplomaContent>(
    () => ({
      issuer: 'Sapios · Comité d’admission',
      number: `N° ${(sub?.id ?? '0042').slice(0, 4).toUpperCase()}`,
      kicker: 'Document soumis',
      degree: 'DIPLÔME',
      lines: [`Titulaire : ${legal ?? '—'}`, 'Mention : en attente'],
      seal: 'S·A·P',
      signatory: 'Le comité d’admission',
    }),
    [legal, sub?.id],
  );

  const enablePush = async () => {
    if (!userId) return;
    const res = await registerForPush(userId, true);
    setPush(await pushPermission());
    setPushMessage(res === 'registered' ? 'Vous serez prévenu du verdict.' : res === 'denied' ? 'Notifications refusées. Activez-les dans les réglages.' : 'Notifications indisponibles sur cet appareil.');
  };

  return (
    <Screen
      scroll
      testID="review"
      header={<TopBar left="Étape 02 / 02" right={{ label: 'Compte', onPress: () => router.push('/settings') }} />}
      footer={
        <>
          {PUSH_SUPPORTED && push !== 'granted' ? <Button testID="review-push" label="Me prévenir du verdict" onPress={enablePush} /> : null}
          <Button testID="review-refresh" label="Actualiser" variant="outline" loading={loadingState} onPress={() => refresh()} />
        </>
      }
    >
      <View style={{ gap: 22, paddingTop: 8 }}>
        <Label>En revue</Label>
        <View>
          <RevealLines
            lines={[
              <Title key="a" size={44}>
                Votre dossier
              </Title>,
              <Title key="b" size={44}>
                <Em>est relu.</Em>
              </Title>,
            ]}
          />
        </View>
        <ScanCard content={content} loop delay={600} />
        <View>
          {[
            ['Soumis le', sub ? formatDate(sub.created_at) : '—'],
            ['Statut', sub ? STATUS_LABEL[sub.status] ?? sub.status : '—'],
            ['Tentatives restantes', `${state?.submissions_left ?? '—'} / 3`],
          ].map(([k, v], i) => (
            <View key={k}>
              <Rule weight={1} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 }}>
                <Label style={{ opacity: 0.7 }}>{k}</Label>
                {i === 1 ? (
                  <View style={{ backgroundColor: fg, paddingHorizontal: 8, paddingVertical: 3 }} testID="review-status">
                    <Label color={bg}>{v}</Label>
                  </View>
                ) : (
                  <Mono size={13}>{v}</Mono>
                )}
              </View>
            </View>
          ))}
          <Rule weight={1} />
        </View>
        <Body>{t('scan.pending')}</Body>
        {!PUSH_SUPPORTED ? (
          <Label size={9} style={{ opacity: 0.6 }}>
            Notifications push indisponibles sur le web : revenez sur cette page.
          </Label>
        ) : null}
        {pushMessage ? <Notice outline message={pushMessage} /> : null}
      </View>
    </Screen>
  );
}
