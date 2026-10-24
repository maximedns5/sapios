import type { MyApplicationDetail } from '@sapios/shared';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { SlotRow } from '@/components/ApplicationBits';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Controls';
import { CalendarIcon, CheckIcon, PinIcon, UserIcon } from '@/components/Icons';
import { haptic, MaskUp, PopIn, Rise, Shockwave, Spinner } from '@/components/motion';
import { useOverlay } from '@/components/Overlay';
import { Header, Screen } from '@/components/Screen';
import { Body, Eyebrow, Heading, Small, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';
import { addToCalendar } from '@/lib/calendar';
import { emploi } from '@/lib/emploi';
import { errorMessage } from '@/lib/errors';
import { formatSlot } from '@/lib/format';
import { back, openChat } from '@/lib/nav';
import { colors, radius } from '@/lib/theme';

const PREP = [
  'Relire l’offre et les missions',
  'Préparer deux exemples concrets de votre travail',
  'Noter vos questions sur l’équipe et le poste',
  'Vérifier le trajet ou le lien de visio',
];

/** Entretien : choisir parmi les créneaux proposés, puis la confirmation (calendrier, préparation). */
export default function Interview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refresh } = useApp();
  const { toast } = useOverlay();
  const [app, setApp] = useState<MyApplicationDetail | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [done, setDone] = useState<Record<number, boolean>>({});

  const load = useCallback(() => emploi.application(id).then(setApp).catch((e) => toast(errorMessage(e))), [id, toast]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const header = <Header onBack={() => back('/applications')} title="Entretien" />;
  if (!app) return <Screen header={header}>{<Spinner />}</Screen>;

  const accepted = app.slots.find((s) => s.status === 'accepted');
  const proposed = app.slots.filter((s) => s.status === 'proposed');
  const company = app.company.display_name;

  const confirm = async () => {
    if (!pick) return;
    try {
      await emploi.acceptSlot(pick);
      haptic.success();
      await Promise.all([load(), refresh()]);
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  if (!accepted) {
    return (
      <Screen scroll header={header} testID="interview-pick" footer={<Button testID="interview-confirm" label="Confirmer ce créneau" disabled={!pick} onPress={confirm} />}>
        <View style={{ gap: 16, paddingTop: 8 }}>
          <MaskUp>
            <Title size={28}>Choisissez un créneau</Title>
          </MaskUp>
          <Body secondary>
            {company} vous propose {proposed.length} créneau{proposed.length > 1 ? 'x' : ''} pour « {app.offer.title} ».
          </Body>
          {proposed.map((s) => (
            <SlotRow key={s.id} slot={s} selected={pick === s.id} onPress={() => setPick(s.id)} testID={`pick-${s.id}`} />
          ))}
          {proposed.length === 0 ? <Small>Aucun créneau en attente. Demandez-en d’autres dans la conversation.</Small> : null}
          <Button label="Aucun ne me convient : écrire" variant="ghost" onPress={() => openChat(id)} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll header={header} testID="interview-confirmed" footer={<Button testID="interview-calendar" label="Ajouter au calendrier" icon={<CalendarIcon size={18} color="#FFFFFF" />} onPress={() => addToCalendar(accepted, app.offer.title, company).catch((e) => toast(errorMessage(e)))} />}>
      <View style={{ gap: 20, paddingTop: 8 }}>
        <View style={{ alignItems: 'center', gap: 12 }}>
          <View style={{ width: 88, height: 88, alignItems: 'center', justifyContent: 'center' }}>
            <Shockwave size={88} color={colors.accent} delay={250} duration={900} />
            <PopIn duration={550}>
              <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                <CheckIcon size={36} stroke={2.8} color="#FFFFFF" />
              </View>
            </PopIn>
          </View>
          <Rise delay={200}>
            <Eyebrow align="center">Entretien confirmé</Eyebrow>
          </Rise>
          <MaskUp delay={260}>
            <Title size={26} align="center">
              {formatSlot(accepted.starts_at)}
            </Title>
          </MaskUp>
        </View>

        <Rise delay={360} style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <PinIcon size={18} color={colors.accent} />
            <Body size={15} style={{ flex: 1 }}>
              {accepted.mode === 'visio' ? 'En visio · le lien vous sera envoyé dans la conversation' : accepted.location ?? `Chez ${company}`}
            </Body>
          </View>
          {accepted.with_whom ? (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <UserIcon size={18} color={colors.accent} />
              <Body size={15} style={{ flex: 1 }}>
                Avec {accepted.with_whom} · {accepted.duration_min} min
              </Body>
            </View>
          ) : null}
        </Rise>

        <Rise delay={440} style={{ gap: 6 }}>
          <Heading size={17}>Pour préparer l’entretien</Heading>
          {PREP.map((label, i) => (
            <Checkbox key={label} testID={`prep-${i}`} checked={!!done[i]} onChange={(v) => setDone((d) => ({ ...d, [i]: v }))} label={label} />
          ))}
        </Rise>

        <Button label="Écrire à l’entreprise" variant="secondary" onPress={() => openChat(id)} />
      </View>
    </Screen>
  );
}
