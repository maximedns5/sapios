import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, IconButton } from '@/components/Button';
import { ProgressBar } from '@/components/Controls';
import { CapIcon, CheckIcon, GearIcon } from '@/components/Icons';
import { Dots, PopIn, Rise, Ripple, ScanLine } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { Header, Screen } from '@/components/Screen';
import { Body, Heading, Small, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';
import { profileCompletion } from '@/lib/completion';
import { useCopy } from '@/lib/copy';
import { loadOwnProfile } from '@/lib/profile';
import { pushPermission, PUSH_SUPPORTED, registerForPush } from '@/lib/push';
import { colors, radius } from '@/lib/theme';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
  return today ? `Aujourd’hui, ${time}` : `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}, ${time}`;
}

function Step({ state, title, sub, last }: { state: 'done' | 'current' | 'todo'; title: string; sub?: React.ReactNode; last?: boolean }) {
  return (
    <View
      accessibilityState={{ selected: state === 'current' }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: last ? 0 : 1, borderColor: colors.line }}
    >
      <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
        {state === 'done' ? (
          <PopIn delay={500}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
              <CheckIcon size={16} stroke={3} color="#FFFFFF" />
            </View>
          </PopIn>
        ) : state === 'current' ? (
          <>
            <Ripple size={28} filled duration={1600} />
            <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: colors.accent, backgroundColor: '#FFFFFF' }} />
          </>
        ) : (
          <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.disabled }} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Body weight="bold" size={15.5} color={state === 'todo' ? colors.muted : colors.text}>
          {title}
        </Body>
        {sub}
      </View>
    </View>
  );
}

/** Attente du verdict : ce qui est fait, ce qui est en cours, le délai, et de quoi s'occuper. */
export default function Review() {
  const { t } = useCopy();
  const { state, userId, refresh, loadingState } = useApp();
  const [push, setPush] = useState<'granted' | 'denied' | 'undetermined' | 'unavailable'>('unavailable');
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const sub = state?.latest_submission;
  const completion = profileCompletion({ photos: state?.onboarding.photos_count ?? 0, bio });

  useEffect(() => {
    if (userId) loadOwnProfile(userId).then((p) => setBio(p.bio)).catch(() => {});
    pushPermission().then(setPush);
  }, [userId]);

  // Relève l'état toutes les 20 s tant que l'écran est affiché (la notification de verdict prend le relais).
  useFocusEffect(
    useCallback(() => {
      const id = setInterval(() => refresh(), 20000);
      return () => clearInterval(id);
    }, [refresh]),
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
      header={
        <Header
          right={
            <IconButton label="Compte" onPress={() => router.push('/settings')}>
              <GearIcon size={20} />
            </IconButton>
          }
        />
      }
    >
      <View style={{ gap: 22 }}>
        <View style={{ alignItems: 'center', gap: 18, paddingTop: 8 }}>
          <View style={{ width: 104, height: 104, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Ripple size={104} />
            <Ripple size={104} delay={1100} />
            <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: colors.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              <CapIcon size={46} color={colors.accent} stroke={1.8} />
              <ScanLine height={104} />
            </View>
          </View>
          <Rise delay={100}>
            <Title size={30} align="center">
              On vérifie votre diplôme
            </Title>
          </Rise>
          <Rise delay={200}>
            <Body secondary align="center">
              {t('review.delay')} {t('review.notice')}
            </Body>
          </Rise>
        </View>

        <Rise delay={300} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, paddingHorizontal: 20, paddingVertical: 4 }}>
          <View accessibilityRole="list" accessibilityLabel="Avancement">
            <Step state="done" title="Diplôme reçu" sub={<Small>{sub ? formatDate(sub.created_at) : '—'}</Small>} />
            <Step
              state="current"
              title="Relecture par notre équipe"
              sub={
                <View style={{ flexDirection: 'row' }}>
                  <Small>En cours</Small>
                  <Dots />
                </View>
              }
            />
            <Step state="todo" title="Verdict" last />
          </View>
        </Rise>

        <Rise delay={450} style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, gap: 12 }}>
          <Heading size={17}>En attendant, complétez votre profil</Heading>
          <Body size={14.5} secondary>
            Une bio et quelques photos de plus : de quoi donner envie de vous écrire, le jour venu.
          </Body>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ProgressBar value={completion.value} label="Profil complété" />
            <Body weight="bold" size={13.5}>
              {Math.round(completion.value * 100)} %
            </Body>
          </View>
          <Button testID="review-complete" label="Compléter mon profil" size="md" onPress={() => router.push('/settings/profile')} />
          <Button label="Mes photos" variant="ghost" size="md" onPress={() => router.push('/settings/photos')} />
        </Rise>

        <View style={{ gap: 8 }}>
          {PUSH_SUPPORTED && push !== 'granted' ? <Button testID="review-push" label="Me prévenir du verdict" variant="secondary" onPress={enablePush} /> : null}
          {pushMessage ? <Notice message={pushMessage} /> : null}
          <Button testID="review-refresh" label="Actualiser" variant="ghost" loading={loadingState} onPress={() => refresh()} />
          <Small align="center" size={13}>
            Tentatives restantes : {state?.submissions_left ?? '—'} / 3
          </Small>
        </View>
      </View>
    </Screen>
  );
}
