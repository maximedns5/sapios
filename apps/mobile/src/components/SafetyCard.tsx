import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useCopy } from '@/lib/copy';
import { alpha, colors, radius } from '@/lib/theme';
import { IconButton, TextLink } from './Button';
import { CrossIcon, ShieldIcon } from './Icons';
import { Rise } from './motion';
import { Body } from './Text';

const key = (userId: string, matchId: string) => `sapios.safety-card.${userId}.${matchId}`;

/**
 * Rappel de sécurité épinglé en haut d'une conversation, une fois que les deux personnes ont écrit
 * (CGU art. 13.2). Masqué pour de bon, conversation par conversation (mémoire locale de l'appareil).
 */
export function SafetyCard({ userId, matchId, show }: { userId: string; matchId: string; show: boolean }) {
  const { t } = useCopy();
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(key(userId, matchId))
      .then((v) => alive && setDismissed(v === '1'))
      .catch(() => alive && setDismissed(false));
    return () => {
      alive = false;
    };
  }, [userId, matchId]);

  if (!show || dismissed !== false) return null;
  const dismiss = () => {
    setDismissed(true);
    AsyncStorage.setItem(key(userId, matchId), '1').catch(() => {});
  };

  return (
    <Rise distance={8} style={{ marginHorizontal: 16, marginTop: 8 }}>
      <View testID="safety-card" style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderRadius: radius.card, padding: 14, paddingRight: 6, backgroundColor: alpha(colors.accent, 0.07) }}>
        <View style={{ paddingTop: 2 }}>
          <ShieldIcon size={20} color={colors.accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Body weight="bold" size={15}>
            {t('safety.card.title')}
          </Body>
          <Body size={14} secondary style={{ lineHeight: 20 }}>
            {t('safety.card.body')}
          </Body>
          <TextLink testID="safety-card-more" label={t('safety.card.more')} size={14} color={colors.accent} onPress={() => router.push('/settings/safety')} />
        </View>
        <IconButton label="Masquer le rappel de sécurité" variant="plain" onPress={dismiss} testID="safety-card-dismiss">
          <CrossIcon size={16} color={colors.muted} />
        </IconButton>
      </View>
    </Rise>
  );
}
