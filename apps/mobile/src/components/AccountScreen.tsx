import { levelLabel } from '@sapios/shared';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { useCopy } from '@/lib/copy';
import { CONSENT_VERSION, CONTACT_EMAIL, SITE_URL } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { exportMyData } from '@/lib/exportData';
import { pushPermission, PUSH_SUPPORTED, registerForPush } from '@/lib/push';
import { IN_REVIEW } from '@/lib/routing';
import { alpha, colors, radius } from '@/lib/theme';
import { TIER_LABEL } from './AdmissionGrid';
import { Switch } from './Controls';
import { BellIcon, CapIcon, CheckIcon, DownloadIcon, EditIcon, EyeIcon, ImageIcon, LockIcon, LogoutIcon, MailIcon, ShieldIcon } from './Icons';
import { MaskUp, Ripple, Rise } from './motion';
import { useOverlay } from './Overlay';
import { Header, Screen } from './Screen';
import { SettingsGroup, SettingsRow } from './SettingsRow';
import { Body, Heading, Small, Title } from './Text';

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

/** État du diplôme : en relecture (étapes, pulsation) ou niveau validé (et diplôme supérieur possible). */
function DiplomaCard() {
  const { state } = useApp();
  const { t } = useCopy();
  if (!state) return null;
  const sub = state.latest_submission;
  const inReview = !!sub && (IN_REVIEW as readonly string[]).includes(sub.status);
  const canHigher = state.profile_status !== 'onboarding' && (state.level ?? 0) < 8 && state.submissions_left > 0 && !inReview;
  return (
    <View style={{ backgroundColor: inReview ? alpha(colors.accent, 0.07) : colors.surface, borderRadius: radius.card, padding: 18, gap: 14 }} testID="account-diploma">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          <CapIcon size={22} color={colors.accent} stroke={1.9} />
        </View>
        <View style={{ flex: 1 }}>
          <Body weight="bold" size={16}>
            {inReview ? 'Diplôme en relecture' : state.level ? `Niveau validé : ${levelLabel(state.level)}` : 'Aucun niveau validé'}
          </Body>
          <Small>{inReview && sub ? `Envoyé le ${formatDay(sub.created_at)}` : state.tier ? TIER_LABEL[state.tier] : 'Votre diplôme décide de votre accès'}</Small>
        </View>
        {inReview ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 }}>
            <View style={{ width: 8, height: 8, alignItems: 'center', justifyContent: 'center' }}>
              <Ripple size={8} filled duration={1400} />
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
            </View>
            <Body size={13} weight="bold" color={colors.accent}>
              En cours
            </Body>
          </View>
        ) : null}
      </View>
      {inReview ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityLabel="Reçu, relecture humaine en cours, verdict à venir">
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
              <CheckIcon size={12} stroke={3} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.accent }} />
            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 3, borderColor: colors.accent, backgroundColor: '#FFFFFF' }} />
            <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.disabled }} />
            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.disabled }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Small size={13}>Reçu</Small>
            <Small size={13} weight="bold" color={colors.text}>
              Relecture humaine
            </Small>
            <Small size={13}>Verdict</Small>
          </View>
          <Small>
            {t('review.delay')}
            {state.can_browse && state.level ? ` Vous gardez votre accès ${levelLabel(state.level)} en attendant.` : ''}
          </Small>
        </>
      ) : null}
      {canHigher ? (
        <Body weight="bold" size={14.5} color={colors.accent} onPress={() => router.push('/diploma')} accessibilityRole="link" testID="submit-higher">
          Soumettre un diplôme supérieur →
        </Body>
      ) : null}
    </View>
  );
}

/** Compte : diplôme, réglages, données et session. La suppression du compte reste discrète. */
export function AccountScreen() {
  const { state, userId, refresh, signOut } = useApp();
  const { confirm, toast } = useOverlay();
  const [push, setPush] = useState<string>('unavailable');

  useEffect(() => {
    pushPermission().then(setPush);
  }, [userId]);

  if (!state) return null;
  const active = state.profile_status === 'active' || state.profile_status === 'paused';
  const consent = state.onboarding.consent_sensitive;

  const togglePause = async (visible: boolean) => {
    try {
      await api.setPaused(!visible);
      await refresh();
      toast(visible ? 'Profil de nouveau visible.' : 'Profil en pause. Vous disparaissez de la découverte.');
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  const revoke = async () => {
    const ok = await confirm({
      label: 'Donnée sensible',
      title: 'Retirer votre consentement ?',
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
      title: 'Supprimer votre compte ?',
      message: 'Profil, photos, diplômes, conversations et jetons de notification seront effacés. C’est irréversible.',
      confirm: 'Continuer',
      destructive: true,
    });
    if (!first) return;
    const second = await confirm({
      label: 'Dernière confirmation',
      title: 'Vraiment ?',
      message: 'Même un Bac+8 ne pourra pas le restaurer.',
      confirm: 'Supprimer définitivement',
      destructive: true,
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
    <Screen scroll testID="settings" header={<Header onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />}>
      <View style={{ gap: 22, paddingTop: 4 }}>
        <MaskUp>
          <Title size={30}>Compte</Title>
        </MaskUp>
        <Rise delay={80}>
          <DiplomaCard />
        </Rise>

        {active ? (
          <Rise delay={140} style={{ gap: 10 }}>
            <Heading size={16}>Profil</Heading>
            <SettingsGroup>
              <SettingsRow first testID="edit-profile" icon={<EditIcon size={18} color={colors.accent} />} title="Modifier mon profil" sub="Prénom, âge recherché, ville, bio" onPress={() => router.push('/settings/profile')} />
              <SettingsRow testID="edit-photos" icon={<ImageIcon size={18} color={colors.accent} />} title="Mes photos" sub={`${state.onboarding.photos_count} / 6`} onPress={() => router.push('/settings/photos')} />
              <SettingsRow
                icon={<EyeIcon size={18} color={colors.accent} />}
                title="Visibilité"
                sub={state.profile_status === 'active' ? 'Visible dans la découverte' : 'En pause : vous n’apparaissez plus'}
                right={<Switch testID="visibility" label="Visible dans la découverte" value={state.profile_status === 'active'} onChange={togglePause} />}
              />
            </SettingsGroup>
          </Rise>
        ) : null}

        <Rise delay={200} style={{ gap: 10 }}>
          <Heading size={16}>Données et confidentialité</Heading>
          <SettingsGroup>
            <SettingsRow
              first
              testID={consent ? 'revoke-consent' : 'give-consent'}
              icon={<LockIcon size={18} color={colors.accent} />}
              title="Donnée sensible"
              sub={consent ? 'Consentement donné · le retirer' : 'Pas de consentement · le donner'}
              onPress={consent ? revoke : () => router.push('/settings/consent')}
            />
            {PUSH_SUPPORTED ? (
              <SettingsRow
                icon={<BellIcon size={18} color={colors.accent} />}
                title={push === 'granted' ? 'Notifications activées' : 'Activer les notifications'}
                sub="Match, message, verdict"
                onPress={push === 'granted' ? undefined : enablePush}
              />
            ) : null}
            <SettingsRow testID="export-data" icon={<DownloadIcon size={18} color={colors.accent} />} title="Exporter mes données" sub="Fichier JSON complet" onPress={exportData} />
            <SettingsRow icon={<ShieldIcon size={18} color={colors.accent} />} title="Politique de confidentialité" onPress={() => Linking.openURL(`${SITE_URL}/confidentialite`)} />
            <SettingsRow icon={<MailIcon size={18} color={colors.accent} />} title="Contacter l’éditeur" sub={CONTACT_EMAIL} onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)} />
          </SettingsGroup>
        </Rise>

        <Rise delay={260} style={{ gap: 10 }}>
          <SettingsGroup>
            <SettingsRow first testID="sign-out" icon={<LogoutIcon size={18} color={colors.text} />} title="Se déconnecter" onPress={() => signOut()} />
          </SettingsGroup>
          <Body testID="delete-account" weight="semibold" size={14.5} color={colors.danger} align="center" onPress={deleteAccount} accessibilityRole="button" style={{ paddingVertical: 12 }}>
            Supprimer mon compte
          </Body>
        </Rise>

        <View style={{ gap: 4, paddingBottom: 8 }}>
          <Small align="center" size={13}>
            Sapios décline toute responsabilité en cas de coup de foudre pour un titulaire de BTS. Les sentiments ne sont pas vérifiés.
          </Small>
          <Small align="center" size={13} weight="semibold">
            L’amour est aveugle. Nous, non.
          </Small>
        </View>
      </View>
    </Screen>
  );
}
