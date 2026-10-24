import { APPLICATION_STATUS_LABELS_CANDIDATE, OPEN_STATUSES, type ApplicationStatus, type InterviewSlot, type MyApplication } from '@sapios/shared';
import { Pressable, View } from 'react-native';

import { daysLeft, endSentence, formatShortDate, formatSlot } from '@/lib/format';
import { alpha, colors, radius } from '@/lib/theme';
import { CalendarIcon, CheckIcon, ClockIcon, HomeIcon, LockIcon } from './Icons';
import { Ripple } from './motion';
import { Body, Small } from './Text';

/** Pastille de statut d'une candidature : pleine pour le match et l'entretien, en pointillés une fois close. */
export function StatusChip({ status, testID }: { status: ApplicationStatus; testID?: string }) {
  const label = APPLICATION_STATUS_LABELS_CANDIDATE[status];
  const strong = status === 'interested' || status === 'interview' || status === 'offer_made' || status === 'hired';
  const closed = status === 'rejected' || status === 'closed_no_response' || status === 'withdrawn';
  return (
    <View
      testID={testID}
      style={{
        alignSelf: 'flex-start',
        borderRadius: radius.pill,
        paddingHorizontal: 11,
        paddingVertical: 5,
        backgroundColor: strong ? colors.accent : status === 'seen' ? colors.surface : 'transparent',
        borderWidth: strong || status === 'seen' ? 0 : 1.5,
        borderStyle: closed ? 'dashed' : 'solid',
        borderColor: closed ? '#B8B2AB' : colors.disabled,
      }}
    >
      <Small size={13} weight="bold" color={strong ? '#FFFFFF' : closed ? colors.secondary : colors.text}>
        {label}
      </Small>
    </View>
  );
}

/**
 * Compte à rebours de la réponse garantie : barre qui se remplit entre l'envoi et l'échéance, date
 * d'échéance, jours restants. Montré tant que le recruteur n'a pas répondu.
 */
export function DueBar({ app }: { app: Pick<MyApplication, 'status' | 'created_at' | 'due_at' | 'seen_at'> }) {
  if (!(OPEN_STATUSES as readonly string[]).includes(app.status)) return null;
  const start = new Date(app.created_at).getTime();
  const end = new Date(app.due_at).getTime();
  const progress = Math.min(1, Math.max(0.04, (Date.now() - start) / Math.max(1, end - start)));
  const left = daysLeft(app.due_at);
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 8 }} accessibilityLabel={`Réponse garantie avant le ${formatShortDate(app.due_at)}, encore ${left} jour${left > 1 ? 's' : ''}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ClockIcon size={17} color={colors.accent} />
        <Body weight="bold" size={14.5}>
          Réponse garantie avant le {formatShortDate(app.due_at)}
        </Body>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: '#E2DDD7', overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(progress * 100)}%`, height: '100%', borderRadius: 3, backgroundColor: colors.accent }} />
      </View>
      <Small size={13}>
        {app.status === 'seen' ? 'Vue par l’entreprise' : 'Envoyée'} · encore {left} jour{left > 1 ? 's' : ''}
      </Small>
    </View>
  );
}

/** Explication d'une candidature close sans réponse : ce n'est pas un refus. */
export function ClosedNoResponse({ company, dueAt }: { company: string; dueAt: string }) {
  return (
    <View style={{ gap: 10 }}>
      <Body size={14.5} style={{ backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, lineHeight: 21 }}>
        {company} n’a pas répondu dans le délai promis, échu le {endSentence(formatShortDate(dueAt))} Ce n’est pas un refus : votre candidature est close, et ce retard compte dans le délai de réponse affiché de {company}.
      </Body>
      <AnonymityLine text="Votre CV reste anonyme, et vous pourrez postuler à ses prochaines offres." />
    </View>
  );
}

export function AnonymityLine({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <View style={{ marginTop: 2 }}>
        <LockIcon size={16} color={colors.accent} />
      </View>
      <Small size={13.5} color={colors.secondary} style={{ flex: 1 }}>
        {text}
      </Small>
    </View>
  );
}

/** Créneau d'entretien : choisissable (bouton radio), accepté (coche), ou décliné. */
export function SlotRow({ slot, selected, onPress, testID }: { slot: InterviewSlot; selected?: boolean; onPress?: () => void; testID?: string }) {
  const accepted = slot.status === 'accepted';
  const content = (pressed: boolean) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 18,
        borderWidth: 2,
        borderColor: selected || accepted ? colors.accent : colors.line,
        backgroundColor: selected || accepted ? alpha(colors.accent, 0.07) : pressed ? colors.surface : colors.bg,
        opacity: slot.status === 'declined' || slot.status === 'cancelled' ? 0.5 : 1,
      }}
    >
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: selected || accepted ? colors.accent : colors.surface, alignItems: 'center', justifyContent: 'center' }}>
        {selected || accepted ? <CheckIcon size={16} stroke={3} color="#FFFFFF" /> : slot.mode === 'visio' ? <CalendarIcon size={18} color={colors.muted} /> : <HomeIcon size={18} color={colors.muted} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Body weight="bold" size={15}>
          {formatSlot(slot.starts_at)}
        </Body>
        <Small size={13}>
          {slot.duration_min} min · {slot.mode === 'visio' ? 'en visio' : 'sur place'}
          {slot.with_whom ? ` · avec ${slot.with_whom}` : ''}
        </Small>
      </View>
    </View>
  );
  if (!onPress) return <View testID={testID}>{content(false)}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="radio" accessibilityState={{ checked: !!selected }} accessibilityLabel={`${formatSlot(slot.starts_at)}, ${slot.duration_min} minutes, ${slot.mode === 'visio' ? 'en visio' : 'sur place'}`} onPress={onPress}>
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}

/** Point qui pulse : réponse attendue bientôt. */
export function LiveDot() {
  return (
    <View style={{ width: 8, height: 8, alignItems: 'center', justifyContent: 'center' }}>
      <Ripple size={8} filled duration={1400} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
    </View>
  );
}
