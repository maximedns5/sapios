import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Rise } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { Wordmark } from '@/components/Wordmark';
import { useApp } from '@/lib/app-state';
import { errorMessage } from '@/lib/errors';

/** Écran de démarrage : le logo pendant que la session et l'état se chargent. */
export default function Index() {
  const { stateError, refresh, signOut, session } = useApp();
  return (
    <Screen testID="splash">
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 28 }}>
        <Wordmark size={48} />
        {stateError && session ? (
          <Rise style={{ alignSelf: 'stretch', gap: 10, marginTop: 24 }}>
            <Notice kind="error" title="Chargement impossible" message={errorMessage(stateError)} />
            <Button label="Réessayer" onPress={() => refresh()} />
            <Button label="Se déconnecter" variant="ghost" onPress={() => signOut()} />
          </Rise>
        ) : null}
      </View>
    </Screen>
  );
}
