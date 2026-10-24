import { levelLabel } from '@sapios/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, IconButton } from '@/components/Button';
import { CapIcon, CheckIcon, GearIcon, VerifiedBadge } from '@/components/Icons';
import { Dots, MaskUp, PopIn, Rise, Ripple, ScanLine } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { Header, Screen } from '@/components/Screen';
import { Body, Small, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';
import { useCopy } from '@/lib/copy';
import { goToTab } from '@/lib/nav';
import { pushPermission, PUSH_SUPPORTED, registerForPush } from '@/lib/push';
import { isInReview } from '@/lib/types';
import { colors, radius } from '@/lib/theme';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const time = `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
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

/**
 * Relecture du diplôme : ce qui est fait, ce qui est en cours, le délai. Les offres restent ouvertes pendant
 * l'attente ; le badge s'ajoute au CV dès la validation.
 */
export default function Review() {
  const { t } = useCopy();
  const { state, userId, refresh, loadingState } = useApp();
  const [push, setPush] = useState<'granted' | 'denied' | 'undetermined' | 'unavailable'>('unavailable');
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const sub = state?.latest_submission;
  const inReview = isInReview(sub?.status);
  const diploma = state?.diploma;

  useEffect(() => {
    pushPermission().then(setPush);
  }, []);

  // Relève l'état toutes les 20 s tant que la relecture est en cours (la notification prend le relais).
  useFocusEffect(
    useCallback(() => {
      if (!inReview) return;
      const id = setInterval(() => refresh(), 20000);
      return () => clearInterval(id);
    }, [inReview, refresh]),
  );

  const enablePush = async () => {
    if (!userId) return;
    const res = await registerForPush(userId, true);
    setPush(await pushPermission());
    setPushMessage(res === 'registered' ? 'Vous serez prévenu·e de la réponse.' : res === 'denied' ? 'Notifications refusées. Activez-les dans les réglages.' : 'Notifications indisponibles sur cet appareil.');
  };

  const header = (
    <Header
      onBack={() => goToTab('/profile')}
      right={
        <IconButton label="Compte" onPress={() => router.push('/settings')}>
          <GearIcon size={20} />
        </IconButton>
      }
    />
  );

  if (!inReview && diploma) {
    return (
      <Screen header={header} testID="review-approved" footer={<Button label="Voir les offres" onPress={() => goToTab('/offers')} />}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 }}>
          <PopIn>
            <VerifiedBadge size={88} />
          </PopIn>
          <MaskUp delay={200}>
            <Title size={30} align="center">
              Diplôme vérifié · {levelLabel(diploma.level)}
            </Title>
          </MaskUp>
          <Rise delay={350}>
            <Body secondary align="center">
              Le badge apparaît maintenant sur votre CV anonyme. Il compte dans « Vous avez déjà » quand une offre demande ce niveau.
            </Body>
          </Rise>
        </View>
      </Screen>
    );
  }

  if (!inReview) {
    return (
      <Screen header={header} testID="review-refused" footer={<Button label="Envoyer un autre document" onPress={() => router.replace('/diploma')} disabled={(state?.submissions_left ?? 0) <= 0} />}>
        <View style={{ gap: 14, paddingTop: 24 }}>
          <MaskUp>
            <Title size={30}>{sub?.status === 'needs_more' ? 'Il manque une pièce' : 'Document non retenu'}</Title>
          </MaskUp>
          <Body secondary>{sub?.rejection_reason ?? 'Le document ne permet pas de vérifier le diplôme. Vous pouvez en envoyer un autre.'}</Body>
          <Notice message="Sans badge, toutes les offres restent ouvertes : le diplôme informe le recruteur, il ne ferme aucune porte." />
          <Button label="Voir les offres" variant="secondary" onPress={() => goToTab('/offers')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll header={header} testID="review" footer={<Button testID="review-offers" label="Voir les offres en attendant" onPress={() => goToTab('/offers')} />}>
      <View style={{ gap: 22, paddingTop: 4 }}>
        <View style={{ alignItems: 'center', gap: 16 }}>
          <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <CapIcon size={46} color={colors.accent} stroke={1.8} />
            <ScanLine height={104} />
          </View>
          <Title size={30} align="center">
            On vérifie votre diplôme
          </Title>
          <Body secondary align="center">
            {t('review.delay')} Vous pouvez postuler dès maintenant : le badge s’ajoutera à vos candidatures.
          </Body>
        </View>

        <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, paddingHorizontal: 20, paddingVertical: 4 }}>
          <Step state="done" title="Diplôme reçu" sub={<Small>{sub ? formatDate(sub.created_at) : '—'}</Small>} />
          <Step
            state="current"
            title="Relecture par notre équipe"
            sub={
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Small>En cours</Small>
                <Dots />
              </View>
            }
          />
          <Step state="todo" title="Badge sur votre CV" last />
        </View>

        <View style={{ gap: 6 }}>
          {PUSH_SUPPORTED && push !== 'granted' ? <Button testID="review-push" label="Me prévenir de la réponse" variant="secondary" onPress={enablePush} /> : null}
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
