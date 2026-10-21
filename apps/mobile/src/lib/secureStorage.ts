import * as SecureStore from 'expo-secure-store';

// SecureStore limite chaque valeur à ~2 Ko : la session Supabase est découpée en morceaux.
const CHUNK = 1800;
const countKey = (key: string) => `${key}.n`;
const partKey = (key: string, i: number) => `${key}.${i}`;

export const chunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const n = await SecureStore.getItemAsync(countKey(key));
    if (n === null) return null;
    const parts: string[] = [];
    for (let i = 0; i < Number(n); i++) {
      const part = await SecureStore.getItemAsync(partKey(key, i));
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const previous = Number((await SecureStore.getItemAsync(countKey(key))) ?? 0);
    const n = Math.ceil(value.length / CHUNK) || 1;
    for (let i = 0; i < n; i++) {
      await SecureStore.setItemAsync(partKey(key, i), value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    for (let i = n; i < previous; i++) await SecureStore.deleteItemAsync(partKey(key, i));
    await SecureStore.setItemAsync(countKey(key), String(n));
  },
  async removeItem(key: string): Promise<void> {
    const n = Number((await SecureStore.getItemAsync(countKey(key))) ?? 0);
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(partKey(key, i));
    await SecureStore.deleteItemAsync(countKey(key));
  },
};
