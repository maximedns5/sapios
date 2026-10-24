import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useAccountDeletion } from '@/components/AccountDeletion';
import { Switch } from '@/components/Controls';
import { BellIcon, DownloadIcon, FileIcon, LockIcon, LogoutIcon, MailIcon, ShieldIcon, TrashIcon } from '@/components/Icons';
import { LegalLinks } from '@/components/LegalLinks';
import { MaskUp, Rise } from '@/components/motion';
import { useOverlay } from '@/components/Overlay';
import { Header, Screen } from '@/components/Screen';
import { SettingsGroup, SettingsRow } from '@/components/SettingsRow';
import { Body, Small, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';
import { useCopy } from '@/lib/copy';
import { emploi } from '@/lib/emploi';
import { CONTACT_EMAIL } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { exportMyData } from '@/lib/exportData';
import { pushPermission, PUSH_SUPPORTED, registerForPush } from '@/lib/push';
import { colors } from '@/lib/theme';

/** Compte : pause, notifications, données (export, suppression), aide, session. */
export default function Settings() {
  const { state, userId, refresh, signOut } = useApp();
  const { toast, confirm } = useOverlay();
  const { t } = useCopy();
  const deleteAccount = useAccountDeletion();
  const [push, setPush] = useState<string>('unavailable');

  useEffect(() => {
    pushPermission().then(setPush);
  }, [userId]);

  const candidate = state?.candidate;

  const togglePause = async (active: boolean) => {
    try {
      await emploi.saveProfile({ paused: !active });
      await refresh();
      toast(active ? 'Recherche reprise : les offres reviennent.' : 'Recherche en pause : plus d’offres ni d’invitations.');
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  const enablePush = async () => {
    if (!userId) return;
    const res = await registerForPush(userId, true);
    setPush(await pushPermission());
    toast(res === 'registered' ? 'Vous serez prévenu·e des réponses.' : res === 'denied' ? 'Notifications refusées. Activez-les dans les réglages.' : 'Notifications indisponibles sur cet appareil.');
  };

  const exportData = async () => {
    try {
      await exportMyData();
      toast('Export prêt.');
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  return (
    <Screen scroll header={<Header onBack={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />} testID="settings">
      <View style={{ gap: 18, paddingTop: 4 }}>
        <MaskUp>
          <Title size={30}>Compte</Title>
        </MaskUp>

        {candidate ? (
          <Rise delay={60}>
            <SettingsGroup label="Recherche">
              <SettingsRow
                first
                testID="row-pause"
                icon={<LockIcon size={18} color={colors.accent} />}
                title="Recherche active"
                sub={candidate.paused ? 'En pause : ni offres ni invitations' : 'Vous voyez les offres et pouvez être invité·e'}
                right={<Switch testID="pause-switch" label="Recherche active" value={!candidate.paused} onChange={togglePause} />}
              />
            </SettingsGroup>
          </Rise>
        ) : null}

        {PUSH_SUPPORTED ? (
          <Rise delay={100}>
            <SettingsGroup label="Notifications">
              <SettingsRow
                first
                testID="row-push"
                icon={<BellIcon size={18} color={colors.accent} />}
                title="Notifications"
                sub={push === 'granted' ? 'Activées : réponses, messages, entretiens' : 'Désactivées'}
                onPress={push === 'granted' ? undefined : enablePush}
              />
            </SettingsGroup>
          </Rise>
        ) : null}

        <Rise delay={140}>
          <SettingsGroup label="Mes données">
            <SettingsRow first testID="row-export" icon={<DownloadIcon size={18} color={colors.accent} />} title="Exporter mes données" sub="CV, candidatures, messages, notes des recruteurs" onPress={exportData} />
            <SettingsRow testID="row-privacy" icon={<ShieldIcon size={18} color={colors.accent} />} title="Entreprises masquées" sub="Cacher votre profil à certaines entreprises" onPress={() => router.push('/settings/visibility')} />
            <SettingsRow testID="row-delete" icon={<TrashIcon size={18} color={colors.danger} />} title="Supprimer mon compte" danger onPress={deleteAccount} />
          </SettingsGroup>
        </Rise>

        <Rise delay={180}>
          <SettingsGroup label="Aide">
            <SettingsRow first icon={<MailIcon size={18} color={colors.accent} />} title="Nous écrire" sub={CONTACT_EMAIL} onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)} />
            <SettingsRow icon={<FileIcon size={18} color={colors.accent} />} title="Comment nous classons les offres" sub="Règles publiques, sans IA" onPress={() => confirm({ title: 'Comment nous classons les offres', message: t('emploi.ranking'), confirm: 'Compris', cancel: 'Fermer' })} />
          </SettingsGroup>
        </Rise>

        <Rise delay={220}>
          <SettingsGroup>
            <SettingsRow first testID="row-signout" icon={<LogoutIcon size={18} color={colors.text} />} title="Se déconnecter" onPress={() => signOut()} />
          </SettingsGroup>
        </Rise>

        <View style={{ gap: 6 }}>
          <LegalLinks />
          <Small size={13}>
            Sapios Emploi est gratuit pour les candidats. Aucune décision n’est prise par un algorithme : chaque réponse vient d’un recruteur.
          </Small>
          <Body muted size={13}>
            Version des conditions acceptée : {state?.terms.required_version ?? '—'}
          </Body>
        </View>
      </View>
    </Screen>
  );
}
