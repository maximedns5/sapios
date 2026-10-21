import { levelLabel } from '@sapios/shared';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { CONSENT_VERSION, CONTACT_EMAIL } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { exportMyData } from '@/lib/exportData';
import { useLayout } from '@/lib/layout';
import { loadOwnProfile } from '@/lib/profile';
import { pushPermission, PUSH_SUPPORTED, registerForPush } from '@/lib/push';
import { PAPER, space } from '@/lib/theme';
import { Choice } from './Controls';
import { ArrowIcon } from './Icons';
import { useOverlay } from './Overlay';
import { Reveal } from './Reveal';
import { Rule, TopBar } from './Screen';
import { Body, Em, Label, Title } from './Text';
import { ToneProvider, useTone } from './Tone';

const TIER_LABEL: Record<string, string> = { unlimited: 'Accès illimité', standard: 'Accès toléré', waitlist: 'Liste d’attente', refused: 'Refusé' };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 28 }}>
      <Label style={{ marginBottom: 10, opacity: 0.6 }}>{title}</Label>
      <Rule />
      {children}
    </View>
  );
}

function Row({ title, hint, onPress, testID, danger }: { title: string; hint?: string; onPress?: () => void; testID?: string; danger?: boolean }) {
  const { fg, bg } = useTone();
  return (
    <>
      <Pressable testID={testID} accessibilityRole="button" disabled={!onPress} onPress={onPress}>
        {({ pressed, hovered }) => {
          const inv = pressed || hovered || danger;
          return (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 14,
                paddingHorizontal: danger ? 12 : 0,
                marginTop: danger ? 10 : 0,
                backgroundColor: inv ? fg : bg,
                gap: 12,
              }}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <Title size={22} color={inv ? bg : fg}>
                  {title}
                </Title>
                {hint ? (
                  <Label size={9.5} color={inv ? bg : fg} style={{ opacity: 0.7 }}>
                    {hint}
                  </Label>
                ) : null}
              </View>
              {onPress ? <ArrowIcon color={inv ? bg : fg} /> : null}
            </View>
          );
        }}
      </Pressable>
      {danger ? null : <Rule weight={1} />}
    </>
  );
}

/** Compte : pause, diplôme, consentement, export, suppression, déconnexion. */
export function AccountScreen({ standalone }: { standalone?: boolean }) {
  const { state, userId, refresh, signOut } = useApp();
  const { confirm, toast } = useOverlay();
  const insets = useSafeAreaInsets();
  const { wide, column } = useLayout();
  const [name, setName] = useState<string | null>(null);
  const [push, setPush] = useState<string>('unavailable');

  useEffect(() => {
    if (userId) loadOwnProfile(userId).then((p) => setName(p.display_name)).catch(() => {});
    pushPermission().then(setPush);
  }, [userId, state?.profile_status]);

  if (!state) return null;
  const active = state.profile_status === 'active' || state.profile_status === 'paused';
  const consent = state.onboarding.consent_sensitive;

  const togglePause = async (paused: boolean) => {
    try {
      await api.setPaused(paused);
      await refresh();
      toast(paused ? 'Profil en pause. Vous disparaissez de la découverte.' : 'Profil de nouveau visible.');
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  const revoke = async () => {
    const ok = await confirm({
      label: 'Donnée sensible',
      title: 'Retirer votre consentement ?',
      message: 'Vos genres recherchés seront effacés et votre profil retiré de la découverte jusqu’à un nouveau consentement.',
      confirm: 'Retirer',
    });
    if (!ok) return;
    try {
      await api.setConsent(false, CONSENT_VERSION);
      await refresh();
      toast('Consentement retiré.');
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  const exportData = async () => {
    try {
      const file = await exportMyData();
      toast(`Export prêt : ${file}`);
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  const deleteAccount = async () => {
    const first = await confirm({
      label: 'Suppression définitive',
      title: 'Supprimer votre compte ?',
      message: 'Profil, photos, diplômes, conversations et jetons de notification seront effacés. C’est irréversible.',
      confirm: 'Continuer',
    });
    if (!first) return;
    const second = await confirm({
      label: 'Dernière confirmation',
      title: 'Vraiment ?',
      message: 'Même un Bac+8 ne pourra pas le restaurer.',
      confirm: 'Supprimer définitivement',
      typeToConfirm: 'SUPPRIMER',
    });
    if (!second) return;
    try {
      await api.deleteAccount();
      await signOut({ local: true });
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  const enablePush = async () => {
    if (!userId) return;
    const res = await registerForPush(userId, true);
    setPush(await pushPermission());
    toast(res === 'registered' ? 'Notifications activées.' : res === 'denied' ? 'Notifications refusées dans les réglages.' : 'Notifications indisponibles sur cet appareil.');
  };

  return (
    <ToneProvider tone="light">
      <View style={{ flex: 1, backgroundColor: PAPER, paddingTop: insets.top + (wide ? 24 : 0) }} testID="account">
        <View style={{ width: '100%', maxWidth: column, alignSelf: 'center', flex: 1 }}>
          {standalone ? <TopBar left={{ label: '← Retour', onPress: () => (router.canGoBack() ? router.back() : router.replace('/')) }} right="Compte" /> : null}
          <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: standalone ? 4 : 14, paddingBottom: insets.bottom + space.xl }}>
            {!standalone ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
                <Label>Compte</Label>
                <Label>Sapios®</Label>
              </View>
            ) : null}
            <Reveal>
              <Title size={44}>{name ?? 'Vous'}</Title>
            </Reveal>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <Badge text={state.level ? levelLabel(state.level) : 'Niveau en attente'} solid />
              {state.tier ? <Badge text={TIER_LABEL[state.tier] ?? state.tier} /> : null}
              {state.profile_status === 'paused' ? <Badge text="En pause" /> : null}
            </View>

            {active ? (
              <Section title="Profil">
                <Row testID="edit-profile" title="Modifier mon profil" hint="Prénom, genre, âge, bio, ville" onPress={() => router.push('/settings/profile')} />
                <Row testID="edit-photos" title="Mes photos" hint={`${state.onboarding.photos_count} / 6`} onPress={() => router.push('/settings/photos')} />
              </Section>
            ) : null}

            {active ? (
              <Section title="Visibilité">
                <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 14 }}>
                  <Choice flex testID="status-active" label="Visible" active={state.profile_status === 'active'} onPress={() => state.profile_status !== 'active' && togglePause(false)} />
                  <Choice flex testID="status-paused" label="En pause" active={state.profile_status === 'paused'} onPress={() => state.profile_status !== 'paused' && togglePause(true)} />
                </View>
                <Rule weight={1} />
              </Section>
            ) : null}

            <Section title="Diplôme">
              <Row title={state.level ? `Niveau validé : ${levelLabel(state.level)}` : 'Aucun niveau validé'} hint={`Tentatives restantes : ${state.submissions_left} / 3`} />
              {state.profile_status !== 'onboarding' && (state.level ?? 0) < 8 && state.submissions_left > 0 ? (
                <Row testID="submit-higher" title="Soumettre un diplôme supérieur" hint="Photo ou PDF" onPress={() => router.push('/diploma')} />
              ) : null}
            </Section>

            {PUSH_SUPPORTED ? (
              <Section title="Notifications">
                <Row title={push === 'granted' ? 'Notifications activées' : 'Activer les notifications'} hint="Match, message, verdict" onPress={push === 'granted' ? undefined : enablePush} />
              </Section>
            ) : (
              <Section title="Notifications">
                <Row title="Dans l’app, pas de push" hint="Bandeau, compteur sur Messages et dans le titre de l’onglet" />
              </Section>
            )}

            <Section title="Donnée sensible">
              <Row title={consent ? 'Consentement donné' : 'Consentement non donné'} hint="Genres recherchés — art. 9 RGPD" />
              {consent ? (
                <Row testID="revoke-consent" title="Retirer mon consentement" hint="Révocable à tout moment" onPress={revoke} />
              ) : (
                <Row testID="give-consent" title="Donner mon consentement" hint="Nécessaire pour la découverte" onPress={() => router.push('/settings/consent')} />
              )}
            </Section>

            <Section title="Mes données">
              <Row testID="export-data" title="Exporter mes données" hint="Fichier JSON complet" onPress={exportData} />
              <Row title="Contacter l’éditeur" hint={CONTACT_EMAIL} onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)} />
            </Section>

            <Section title="Session">
              <Row testID="sign-out" title="Se déconnecter" onPress={() => signOut()} />
              <Row testID="delete-account" title="Supprimer mon compte" hint="Définitif, double confirmation" onPress={deleteAccount} danger />
            </Section>

            <Body size={12} style={{ marginTop: 28, opacity: 0.55 }}>
              Sapios décline toute responsabilité en cas de coup de foudre pour un titulaire de BTS. Les sentiments ne sont pas vérifiés.
            </Body>
            <Title size={18} style={{ marginTop: 8, opacity: 0.55 }}>
              <Em>L’amour est aveugle. Nous, non.</Em>
            </Title>
          </ScrollView>
        </View>
      </View>
    </ToneProvider>
  );
}

function Badge({ text, solid }: { text: string; solid?: boolean }) {
  const { fg, bg } = useTone();
  return (
    <View style={{ borderWidth: 1.5, borderColor: fg, backgroundColor: solid ? fg : bg, paddingHorizontal: 8, paddingVertical: 4 }}>
      <Label size={10} color={solid ? bg : fg}>
        {text}
      </Label>
    </View>
  );
}
