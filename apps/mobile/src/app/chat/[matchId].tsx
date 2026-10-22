import { useLocalSearchParams } from 'expo-router';

import { Conversation } from '@/components/Conversation';

/** Conversation plein écran. */
export default function Chat() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  return <Conversation key={matchId} matchId={matchId} />;
}
