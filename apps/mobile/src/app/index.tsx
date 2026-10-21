import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Wordmark } from '@/components/Wordmark';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { Label } from '@/components/Text';
import { useApp } from '@/lib/app-state';
import { errorMessage } from '@/lib/errors';

/** Écran d'attente : logo révélé lettre à lettre pendant que la session et l'état se chargent. */
export default function Index() {
  const { stateError, refresh, signOut, session } = useApp();
  return (
    <Screen tone="dark" testID="splash">
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 28 }}>
        <Label style={{ opacity: 0.8 }}>Application de rencontre</Label>
        <Wordmark size={64} />
        {stateError && session ? (
          <View style={{ alignSelf: 'stretch', gap: 12, marginTop: 24 }}>
            <Notice title="État indisponible" message={errorMessage(stateError)} />
            <Button label="Réessayer" onPress={() => refresh()} />
            <Button label="Se déconnecter" variant="outline" onPress={() => signOut()} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
