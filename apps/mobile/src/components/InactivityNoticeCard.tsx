import type { InactivityNotice } from '@sapios/shared';
import { View } from 'react-native';

import { fill, useCopy } from '@/lib/copy';
import { alpha, colors, radius } from '@/lib/theme';
import { TextLink } from './Button';
import { ClockIcon } from './Icons';
import { Rise } from './motion';
import { Body } from './Text';

function day(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Avertissement d'inactivité, lu au retour du membre : le compte est conservé (AIPD section 7). */
export function InactivityNoticeCard({ notice, onAck }: { notice: InactivityNotice; onAck: () => void }) {
  const { t } = useCopy();
  return (
    <Rise distance={8}>
      <View testID="inactivity-notice" style={{ flexDirection: 'row', gap: 12, borderRadius: radius.card, padding: 16, backgroundColor: alpha(colors.accent, 0.07) }}>
        <View style={{ paddingTop: 2 }}>
          <ClockIcon size={20} color={colors.accent} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Body weight="bold" size={15.5}>
            {t('notice.inactivity.title')}
          </Body>
          <Body size={14.5} secondary style={{ lineHeight: 21 }}>
            {fill(t('notice.inactivity.body'), { date: day(notice.payload.delete_after) })}
          </Body>
          <TextLink testID="inactivity-ack" label="Compris" size={14.5} color={colors.accent} onPress={onAck} />
        </View>
      </View>
    </Rise>
  );
}
