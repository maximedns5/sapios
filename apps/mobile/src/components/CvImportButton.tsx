import type { CvExperience, CvLanguage, ExperienceBand } from '@sapios/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { CV_ACCEPT, readCvFile } from '@/lib/cvImport';
import { cvImportStore, type CvImportApply } from '@/lib/cvImportStore';
import { errorMessage } from '@/lib/errors';
import { colors, radius } from '@/lib/theme';
import { pickWebFiles } from '@/lib/webFiles';
import { Button } from './Button';
import { FileIcon, LockIcon } from './Icons';
import { Notice } from './Notice';
import { Small } from './Text';

type Props = {
  current: { skills: string[]; languages: CvLanguage[]; experiences: CvExperience[] };
  currentRole?: string | null;
  currentBand?: ExperienceBand | null;
  showDiplomaLink?: boolean;
  onApply: (apply: CvImportApply) => void;
  testID?: string;
};

/**
 * « Importer mon CV (PDF ou Word) » : lit le fichier sur l'appareil, puis ouvre la relecture. Rien n'est
 * enregistré : l'écran appelant reçoit les éléments gardés et les enregistre avec son propre bouton.
 */
export function CvImportButton({ current, currentRole = null, currentBand = null, showDiplomaLink = false, onApply, testID = 'cv-import' }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (Platform.OS !== 'web') return null;

  const pick = async () => {
    setError(null);
    const [file] = await pickWebFiles(CV_ACCEPT);
    if (!file) return;
    setBusy(true);
    try {
      const reader = await import('@sapios/shared/cv-import');
      const result = await readCvFile(file);
      cvImportStore.set({ result, reader, current, currentRole, currentBand, showDiplomaLink, onApply });
      router.push('/settings/cv-import');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 10, backgroundColor: colors.surface, borderRadius: radius.card, padding: 16 }}>
      <Button testID={testID} label="Importer mon CV (PDF ou Word)" variant="secondary" size="md" loading={busy} onPress={pick} icon={<FileIcon size={18} />} />
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <LockIcon size={16} color={colors.muted} />
        <Small style={{ flex: 1 }}>
          Votre fichier est lu sur cet appareil et n’est jamais envoyé ni gardé. Vous relisez tout avant d’ajouter quoi que ce soit.
        </Small>
      </View>
      {error ? <Notice kind="error" testID={`${testID}-error`} message={error} /> : null}
    </View>
  );
}
