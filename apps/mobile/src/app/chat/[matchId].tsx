import { Redirect, useLocalSearchParams } from 'expo-router';

import { Conversation } from '@/components/Conversation';
import { useLayout } from '@/lib/layout';

/** Conversation plein écran sur téléphone ; sur grand écran, elle s'ouvre dans la colonne de « Messages ». */
export default function Chat() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { wide } = useLayout();
  if (wide && matchId) return <Redirect href={{ pathname: '/messages', params: { m: matchId } }} />;
  return <Conversation key={matchId} matchId={matchId} />;
}
