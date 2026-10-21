import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { api } from './api';
import { AppError } from './errors';

/** Export RGPD : export_my_data → fichier JSON partagé (feuille de partage native, téléchargement sur le web). */
export async function exportMyData(): Promise<string> {
  const data = await api.exportData();
  const json = JSON.stringify(data, null, 2);
  const name = `sapios-export-${new Date().toISOString().slice(0, 10)}.json`;
  if (Platform.OS === 'web') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return name;
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(json);
  if (!(await Sharing.isAvailableAsync())) throw new AppError('unknown', 'partage indisponible');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Exporter mes données', UTI: 'public.json' });
  return name;
}
