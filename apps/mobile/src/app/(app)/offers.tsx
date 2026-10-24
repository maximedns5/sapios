import type { OfferCard } from '@sapios/shared';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Button, IconButton, TextLink } from '@/components/Button';
import { EndOfOffers, FeedSkeleton, LoadError } from '@/components/FeedStates';
import { CrossIcon, SendIcon, SlidersIcon } from '@/components/Icons';
import { InactivityNoticeCard } from '@/components/InactivityNoticeCard';
import { haptic, MaskUp, Rise } from '@/components/motion';
import { OfferCardBody } from '@/components/OfferCard';
import { useOverlay } from '@/components/Overlay';
import { Body, Small, Title } from '@/components/Text';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { useCopy } from '@/lib/copy';
import { emploi, onApplied } from '@/lib/emploi';
import { errorCode, errorMessage } from '@/lib/errors';
import { colors, ease, radius, space } from '@/lib/theme';
import { useKeyboardShortcuts } from '@/lib/web';

type LoadFailure = { network: boolean; message: string };

/**
 * Découverte des offres : une carte à la fois (photo réelle du lieu, salaire, lieu, contrat, ce que vous avez
 * déjà). « Passer » l'écarte, « Postuler » ouvre la feuille de candidature. La carte s'en va du côté choisi.
 */
export default function Offers() {
  const { state, refresh } = useApp();
  const { t } = useCopy();
  const overlay = useOverlay();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const reduced = useReducedMotion();
  const [queue, setQueue] = useState<OfferCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const seenIds = useRef(new Set<string>());
  const fetching = useRef(false);
  const busy = useRef(false);
  const out = useSharedValue(0);
  const side = useSharedValue(1);
  const paused = !!state?.candidate?.paused;

  const load = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const rows = await emploi.feed(20);
      setFailure(null);
      setQueue((q) => {
        const known = new Set(q.map((o) => o.id));
        return [...q, ...rows.filter((r) => !known.has(r.id) && !seenIds.current.has(r.id))];
      });
    } catch (e) {
      setFailure({ network: errorCode(e) === 'network', message: errorMessage(e) });
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const current = queue[0];

  // Nouvelle carte affichée : l'animation de sortie repart de zéro.
  useEffect(() => {
    out.value = 0;
    busy.current = false;
  }, [current?.id, out]);

  const commitPass = useCallback(
    async (offer: OfferCard) => {
      seenIds.current.add(offer.id);
      setQueue((q) => q.filter((o) => o.id !== offer.id));
      if (queue.length <= 4) load();
      try {
        await emploi.pass(offer.id);
      } catch (e) {
        if (errorCode(e) !== 'not_found') overlay.toast(errorMessage(e));
      }
    },
    [load, overlay, queue.length],
  );

  const pass = useCallback(() => {
    const offer = queue[0];
    if (!offer || busy.current) return;
    busy.current = true;
    haptic.selection();
    side.value = -1;
    if (reduced) {
      commitPass(offer);
      return;
    }
    out.value = withTiming(1, { duration: 300, easing: ease.in }, (done) => {
      if (done) scheduleOnRN(commitPass, offer);
    });
  }, [commitPass, out, queue, reduced, side]);

  /** Postuler : la feuille s'ouvre ; la carte ne part qu'une fois la candidature envoyée. */
  const apply = useCallback(
    (target?: string) => {
      const offer = queue[0];
      if (!offer) return;
      router.push({ pathname: '/apply/[id]', params: { id: offer.id, title: offer.title, company: offer.company.display_name, ...(target ? { target } : {}) } });
    },
    [queue],
  );

  // Candidature envoyée depuis la feuille : la carte part vers la droite, la suivante monte.
  const commitApplied = useCallback(
    (offerId: string) => {
      seenIds.current.add(offerId);
      setQueue((q) => q.filter((o) => o.id !== offerId));
      if (queue.length <= 4) load();
    },
    [load, queue.length],
  );
  useEffect(
    () =>
      onApplied((offerId) => {
        if (queue[0]?.id !== offerId || reduced) {
          commitApplied(offerId);
          return;
        }
        busy.current = true;
        side.value = 1;
        out.value = withTiming(1, { duration: 320, easing: ease.in }, (done) => {
          if (done) scheduleOnRN(commitApplied, offerId);
        });
      }),
    [commitApplied, out, queue, reduced, side],
  );

  const leaving = useAnimatedStyle(() => ({
    opacity: 1 - out.value,
    transform: [{ translateX: side.value * out.value * 140 }, { rotate: `${side.value * out.value * 6}deg` }, { scale: 1 - out.value * 0.04 }],
  }));

  // Clavier : ← passer, → postuler (onglet affiché, aucune saisie en cours).
  const shortcuts = useMemo(() => ({ ArrowLeft: () => pass(), ArrowRight: () => apply() }), [apply, pass]);
  useKeyboardShortcuts(shortcuts, isFocused && !!current && !paused && !loading);

  const inactivity = state?.notices.find((n) => n.kind === 'inactivity_warning');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="offers">
      <View style={{ minHeight: 64, paddingLeft: space.gutter, paddingRight: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Title size={30}>Offres</Title>
          {!loading && !paused && queue.length ? (
            <Small size={14}>
              {queue.length} offre{queue.length > 1 ? 's' : ''} pour vous
            </Small>
          ) : null}
        </View>
        <IconButton testID="open-search" label="Ma recherche : zone, contrats, salaire" onPress={() => router.push('/settings/search')}>
          <SlidersIcon size={20} />
        </IconButton>
      </View>

      {inactivity && inactivity.kind === 'inactivity_warning' ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <InactivityNoticeCard notice={inactivity} onAck={() => api.ackNotice(inactivity.id).then(() => refresh()).catch(() => {})} />
        </View>
      ) : null}

      {loading ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
          <FeedSkeleton />
        </View>
      ) : paused ? (
        <PausedState />
      ) : current ? (
        <>
          <Animated.View style={[{ flex: 1 }, leaving]}>
            <ScrollView key={current.id} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 24 }}>
              <Rise duration={450} distance={24}>
                <OfferCardBody
                  offer={current}
                  footer={
                    <View style={{ alignItems: 'flex-start' }}>
                      <TextLink testID="open-offer" label="Voir l’offre complète →" color={colors.accent} onPress={() => router.push({ pathname: '/offer/[id]', params: { id: current.id } })} />
                    </View>
                  }
                />
              </Rise>
            </ScrollView>
          </Animated.View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.bg }}>
            <IconButton testID="pass" label={`Passer l’offre ${current.title}`} accessibilityHint="Raccourci clavier : flèche gauche" variant="floating" size={56} onPress={pass}>
              <CrossIcon size={22} stroke={2.4} color={colors.text} />
            </IconButton>
            <Button
              testID="apply"
              label="Postuler"
              style={{ flex: 1 }}
              accessibilityHint="Raccourci clavier : flèche droite"
              onPress={() => apply()}
              icon={<SendIcon size={19} color="#FFFFFF" />}
            />
          </View>
        </>
      ) : failure ? (
        <View style={{ paddingHorizontal: space.gutter }}>
          <LoadError
            network={failure.network}
            message={failure.message}
            onRetry={() => {
              setFailure(null);
              return load();
            }}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.xl }}>
          <EndOfOffers
            text={t('emploi.feed.empty')}
            onRefresh={() => {
              setLoading(true);
              load();
            }}
          />
          <RankingNote />
        </ScrollView>
      )}
    </View>
  );
}

/** « Comment nous classons » : règles publiques, sans IA ni mise en avant payante. */
function RankingNote() {
  const { t } = useCopy();
  return (
    <View style={{ marginTop: 18, backgroundColor: colors.surface, borderRadius: radius.card, padding: 16, gap: 6 }} testID="ranking-note">
      <Body weight="bold" size={15}>
        Comment nous classons les offres
      </Body>
      <Small size={13.5}>{t('emploi.ranking')}</Small>
    </View>
  );
}

function PausedState() {
  const { refresh } = useApp();
  const { toast } = useOverlay();
  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: 12, paddingHorizontal: space.gutter }} testID="offers-paused">
      <MaskUp>
        <Title size={30}>Vous faites une pause.</Title>
      </MaskUp>
      <Rise delay={150}>
        <Body secondary>Vous ne voyez plus d’offres et les recruteurs ne peuvent plus vous inviter. Vos candidatures en cours continuent.</Body>
      </Rise>
      <Rise delay={250}>
        <Button
          label="Reprendre"
          onPress={async () => {
            try {
              await emploi.saveProfile({ paused: false });
              await refresh();
            } catch (e) {
              toast(errorMessage(e));
            }
          }}
        />
      </Rise>
    </View>
  );
}
