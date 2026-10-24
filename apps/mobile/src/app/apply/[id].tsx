import { EMPLOI_LIMITS, type AnonymousCv, type OfferDetail } from '@sapios/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AnonymousCvCard } from '@/components/AnonymousCvCard';
import { Button } from '@/components/Button';
import { Chip, ChipRow } from '@/components/Controls';
import { Field } from '@/components/Field';
import { CheckIcon, SendIcon } from '@/components/Icons';
import { haptic, MaskUp, PopIn, Rise, Shockwave, Spinner } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { Backdrop, SheetFrame } from '@/components/Overlay';
import { Body, Small, Title } from '@/components/Text';
import { emploi, notifyApplied } from '@/lib/emploi';
import { errorCode, errorMessage } from '@/lib/errors';
import { formatShortDate } from '@/lib/format';
import { goToTab } from '@/lib/nav';
import { findTarget, offerTargets } from '@/lib/targets';
import { colors } from '@/lib/theme';

/**
 * Feuille « Postuler » : ce que l'entreprise verra (CV anonyme), un point de l'offre auquel répondre et un mot
 * de 140 caractères, tous deux facultatifs. Puis la confirmation, avec la date de réponse garantie.
 */
export default function Apply() {
  const params = useLocalSearchParams<{ id: string; title?: string; company?: string; target?: string }>();
  const [offer, setOffer] = useState<OfferDetail | null>(null);
  const [cv, setCv] = useState<AnonymousCv | null>(null);
  const [target, setTarget] = useState<string | null>(params.target ?? null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ due: string } | null>(null);

  useEffect(() => {
    emploi.offer(params.id).then(setOffer).catch((e) => setError(errorMessage(e)));
    emploi.myCvPreview().then(setCv).catch(() => {});
  }, [params.id]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/offers'));
  const company = offer?.company.display_name ?? params.company ?? 'L’entreprise';
  const title = offer?.title ?? params.title ?? '';
  const chosen = offer ? findTarget(offer, target) : null;

  const send = async () => {
    setError(null);
    try {
      const res = await emploi.apply(params.id, note, target);
      haptic.success();
      setSent({ due: res.due_at });
      notifyApplied(params.id);
    } catch (e) {
      const code = errorCode(e);
      if (code === 'already_applied') {
        notifyApplied(params.id);
        setError(errorMessage(e));
      } else if (code === 'invalid_target') {
        setTarget(null);
        setError(errorMessage(e));
      } else setError(errorMessage(e));
    }
  };

  return (
    <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]} testID="apply-sheet">
      <Backdrop onPress={close} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SheetFrame>
          {sent ? (
            <View style={{ alignItems: 'center', gap: 12, paddingVertical: 12 }} testID="apply-sent">
              <View style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center' }}>
                <Shockwave size={96} color={colors.accent} delay={250} duration={900} />
                <PopIn duration={600}>
                  <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <CheckIcon size={40} stroke={2.8} color="#FFFFFF" />
                  </View>
                </PopIn>
              </View>
              <MaskUp delay={300}>
                <Title size={28} align="center">
                  Candidature envoyée
                </Title>
              </MaskUp>
              <Rise delay={450}>
                <Body secondary align="center">
                  {company} voit votre CV anonyme. Réponse au plus tard le {formatShortDate(sent.due)}.
                </Body>
              </Rise>
              <Rise delay={550} style={{ alignSelf: 'stretch', gap: 6, marginTop: 6 }}>
                <Button testID="apply-track" label="Suivre mes candidatures" onPress={() => goToTab('/applications')} />
                <Button testID="apply-continue" label="Continuer à explorer" variant="ghost" onPress={close} />
              </Rise>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 640 }} contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
              <View style={{ gap: 2 }}>
                <Title size={26}>Postuler</Title>
                <Small size={14}>
                  {title}
                  {title ? ' · ' : ''}
                  {company}
                </Small>
              </View>

              <View style={{ gap: 8 }}>
                <Small size={12} weight="bold" color={colors.muted} style={{ letterSpacing: 1 }}>
                  CE QUE {company.toUpperCase()} VERRA
                </Small>
                {cv ? <AnonymousCvCard cv={cv} compact testID="apply-preview" /> : <Spinner />}
              </View>

              {offer ? (
                <View style={{ gap: 10 }}>
                  <Body weight="bold" size={15}>
                    Répondre à un point (facultatif)
                  </Body>
                  <ChipRow>
                    {offerTargets(offer).map((t) => (
                      <Chip key={t.key} testID={`target-${t.key}`} radio label={t.label} active={target === t.key} onPress={() => setTarget(target === t.key ? null : t.key)} />
                    ))}
                  </ChipRow>
                  {chosen ? (
                    <View style={{ borderLeftWidth: 3, borderColor: colors.accent, backgroundColor: colors.surfaceSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                      <Body size={14.5} weight="semibold" style={{ lineHeight: 20 }}>
                        « {chosen.quote} »
                      </Body>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <Field
                testID="apply-note"
                label="Un mot pour le recruteur"
                value={note}
                onChangeText={setNote}
                maxLength={EMPLOI_LIMITS.noteMax}
                multiline
                counter
                placeholder="Pourquoi ce poste, en une phrase."
              />
              <Small>
                Réponse garantie sous {offer?.response_days ?? 7} jours. Sans réponse à temps, la candidature est close, jamais refusée à votre place.
              </Small>
              {offer && !offer.can_apply ? (
                <Notice testID="apply-closed" message={offer.my_application ? 'Vous avez déjà postulé à cette offre.' : 'Cette offre n’accepte plus de candidatures.'} />
              ) : null}
              {error ? <Notice kind="error" testID="apply-error" message={error} /> : null}
              <View style={{ gap: 4 }}>
                <Button testID="apply-send" label="Envoyer ma candidature" disabled={!offer || !offer.can_apply} onPress={send} icon={<SendIcon size={18} color="#FFFFFF" />} />
                <Button label="Annuler" variant="ghost" onPress={close} />
              </View>
            </ScrollView>
          )}
        </SheetFrame>
      </KeyboardAvoidingView>
    </View>
  );
}
