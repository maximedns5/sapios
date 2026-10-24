import { OFFER_REPORT_REASON_LABELS, OFFER_REPORT_REASONS, type OfferReportReason } from '@sapios/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { OptionCard } from '@/components/Controls';
import { Field } from '@/components/Field';
import { MaskUp, Rise } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { Header, Screen } from '@/components/Screen';
import { Body, Eyebrow, Title } from '@/components/Text';
import { emploi } from '@/lib/emploi';
import { errorMessage } from '@/lib/errors';

/** Signaler une offre : motif, précisions facultatives. Chaque signalement est lu par une personne de l'équipe. */
export default function ReportOffer() {
  const { offerId, title } = useLocalSearchParams<{ offerId: string; title?: string }>();
  const { toast } = useOverlay();
  const [reason, setReason] = useState<OfferReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/offers'));

  const send = async () => {
    if (!reason) return;
    setError(null);
    try {
      await emploi.reportOffer(offerId, reason, details);
      toast('Merci. Une personne de l’équipe va examiner cette offre.');
      close();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen
      scroll
      testID="report-offer"
      header={<Header onBack={close} backLabel="Fermer" />}
      footer={<Button testID="report-send" label="Envoyer le signalement" disabled={!reason} onPress={send} />}
    >
      <View style={{ gap: 18, paddingTop: 8 }}>
        <View style={{ gap: 8 }}>
          <Rise>
            <Eyebrow>Signaler une offre</Eyebrow>
          </Rise>
          <MaskUp delay={80}>
            <Title size={30}>{title ? `« ${title} »` : 'Qu’est-ce qui ne va pas ?'}</Title>
          </MaskUp>
          <Rise delay={180}>
            <Body muted>L’entreprise n’est pas prévenue de votre signalement. Nous vous répondrons si nous retirons l’offre.</Body>
          </Rise>
        </View>
        <Rise delay={260} style={{ gap: 10 }}>
          {OFFER_REPORT_REASONS.map((r) => (
            <OptionCard key={r} testID={`report-${r}`} label={OFFER_REPORT_REASON_LABELS[r]} active={reason === r} onPress={() => setReason(r)} />
          ))}
        </Rise>
        <Field testID="report-details" label="Précisions (facultatif)" value={details} onChangeText={setDetails} multiline maxLength={1000} counter placeholder="Ce qui vous a alerté, en quelques mots." />
        {error ? <Notice kind="error" message={error} /> : null}
      </View>
    </Screen>
  );
}
