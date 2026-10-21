import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Notice } from '@/components/Notice';
import { Photo, useSignedUrls } from '@/components/Photo';
import { RevealLines } from '@/components/Reveal';
import { Body, Em, Label, Title } from '@/components/Text';
import { ToneProvider } from '@/components/Tone';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { describe, rememberCandidates } from '@/lib/candidates';
import { errorMessage } from '@/lib/errors';
import { SIDE_NAV, useLayout } from '@/lib/layout';
import { INK, PAPER, space } from '@/lib/theme';
import type { Candidate } from '@/lib/types';

/** « Qui m'a liké » : réservé aux paliers avec sees_likers (get_likers). */
export default function Likes() {
  const { state } = useApp();
  const insets = useSafeAreaInsets();
  const { width, wide } = useLayout();
  // Grand écran : quatre colonnes dans 1000 px, à côté de la navigation latérale.
  const cols = wide ? 4 : 2;
  const frame = wide ? 1000 : 560;
  const available = wide ? width - SIDE_NAV : width;
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urls = useSignedUrls((rows ?? []).map((r) => r.photo_paths?.[0]).filter((p): p is string => !!p));
  const cell = (Math.min(available, frame) - space.gutter * 2 - 12 * (cols - 1)) / cols;

  useFocusEffect(
    useCallback(() => {
      if (!state?.sees_likers) return;
      api
        .likers()
        .then((list) => {
          rememberCandidates(list);
          setRows(list);
          setError(null);
        })
        .catch((e) => setError(errorMessage(e)));
    }, [state?.sees_likers]),
  );

  return (
    <ToneProvider tone="light">
      <View style={{ flex: 1, backgroundColor: PAPER, paddingTop: insets.top + (wide ? 24 : 0) }} testID="likes">
        <FlatList
          key={`cols-${cols}`}
          data={rows ?? []}
          keyExtractor={(r) => r.id}
          numColumns={cols}
          columnWrapperStyle={{ gap: 12 }}
          style={{ width: '100%', maxWidth: frame, alignSelf: 'center' }}
          contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.xl, gap: 18 }}
          ListHeaderComponent={
            <View style={{ gap: 14, paddingTop: 14, paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Label>Qui vous a liké</Label>
                <Label>Accès illimité</Label>
              </View>
              <View>
                <RevealLines
                  lines={[
                    <Title key="a" size={44}>
                      On vous a
                    </Title>,
                    <Title key="b" size={44}>
                      <Em>remarqué.</Em>
                    </Title>,
                  ]}
                />
              </View>
              {!state?.sees_likers ? <Notice title="Réservé" message="Voir qui vous a liké est réservé à l’accès illimité (Bac+8)." /> : null}
              {error ? <Notice title="Erreur" message={error} /> : null}
              {rows === null && state?.sees_likers && !error ? <ActivityIndicator color={INK} /> : null}
              {rows?.length === 0 ? <Body>Personne pour l’instant. L’excellence intimide.</Body> : null}
            </View>
          }
          renderItem={({ item }) => {
            const path = item.photo_paths?.[0];
            return (
              <Pressable
                testID={`liker-${item.id}`}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/profile/[userId]', params: { userId: item.id, from: 'likers' } })}
                style={{ width: cell }}
              >
                {({ pressed, hovered }) => (
                  <View style={{ gap: 8, opacity: pressed || hovered ? 0.7 : 1 }}>
                    <Photo path={path} url={path ? urls[path] : ''} name={item.display_name} monogramSize={64} caption={false} style={{ width: cell, height: cell * 1.25, borderWidth: 1.5, borderColor: INK }} />
                    <Title size={22}>
                      {item.display_name}
                      {item.age != null ? <Em>, {item.age}</Em> : null}
                    </Title>
                    {describe(item) ? <Label size={9.5}>{describe(item)}</Label> : null}
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      </View>
    </ToneProvider>
  );
}
