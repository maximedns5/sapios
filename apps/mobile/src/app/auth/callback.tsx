import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { Button } from '@/components/Button';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { Wordmark } from '@/components/Wordmark';
import { completeOAuth, exchangeCode } from '@/lib/auth';
import { AppError, errorMessage } from '@/lib/errors';

/** Retour OAuth (Google) et lien magique : échange du code PKCE contre une session. */
export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        if (params.error || params.error_description) throw new AppError('unknown', params.error_description ?? params.error);
        if (params.code) await exchangeCode(params.code);
        else if (Platform.OS === 'web') await completeOAuth(window.location.href);
        else {
          const url = await Linking.getInitialURL();
          if (url) await completeOAuth(url);
        }
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
  }, [params.code, params.error, params.error_description]);
  return (
    <Screen tone="dark">
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24 }}>
        <Wordmark size={56} />
        {error ? (
          <View style={{ alignSelf: 'stretch', gap: 12 }}>
            <Notice title="Connexion impossible" message={error} />
            <Button label="Retour" onPress={() => router.replace('/sign-in')} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
