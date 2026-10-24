import { DIPLOMA_RETENTION_DAYS } from '@sapios/shared';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, IconButton, TextLink } from '@/components/Button';
import { ProgressBar } from '@/components/Controls';
import { DropTarget } from '@/components/DropTarget';
import { ArrowRightIcon, CameraIcon, CapIcon, CheckIcon, FileIcon, GearIcon, ImageIcon, LockIcon } from '@/components/Icons';
import { MaskUp, Rise, SlideIn } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { Header, Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { Body, Eyebrow, Heading, Small, Title } from '@/components/Text';
import { useApp } from '@/lib/app-state';
import { CAMERA_AVAILABLE, diplomaFromFile, formatBytes, pickAnyWeb, pickFromCamera, pickFromLibrary, pickPdf, submitDiploma, type DiplomaPick, type SubmitStep } from '@/lib/diploma';
import { AppError, errorMessage } from '@/lib/errors';
import { emploi } from '@/lib/emploi';
import { DIPLOMA_INTRO_KEY } from '@/lib/routing';
import { useCopy } from '@/lib/copy';
import { alpha, colors, radius } from '@/lib/theme';

const STEP: Record<SubmitStep, { label: string; value: number }> = {
  convert: { label: 'Préparation…', value: 0.3 },
  upload: { label: 'Envoi…', value: 0.65 },
  submit: { label: 'Transmission…', value: 0.92 },
};

function PromiseLine({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View style={{ marginTop: 2 }}>
        <CheckIcon size={18} stroke={2.6} color={colors.accent} />
      </View>
      <Body size={15} style={{ flex: 1, lineHeight: 21 }}>
        {text}
      </Body>
    </View>
  );
}

/**
 * Badge diplôme vérifié (facultatif) : choix du document, promesse de confidentialité, envoi suivi. Proposé
 * une fois à la fin de l'inscription (`?intro=1`, avec « Plus tard »), puis depuis le profil.
 */
export default function DiplomaUpload() {
  const { userId, state, refresh, markSeen } = useApp();
  const { intro } = useLocalSearchParams<{ intro?: string }>();
  const { t } = useCopy();
  const [legalName, setLegalName] = useState<string | null>(null);
  const [pick, setPick] = useState<DiplomaPick | null>(null);
  const [step, setStep] = useState<SubmitStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canBack, setCanBack] = useState(false);

  useEffect(() => {
    emploi
      .myIdentity()
      .then((i) => i && setLegalName(`${i.first_name} ${i.last_name}`))
      .catch(() => {});
    setCanBack(router.canGoBack());
  }, [userId]);

  const left = state?.submissions_left ?? 3;
  const hasBadge = !!state?.diploma;
  const sub = state?.latest_submission;
  const redo = sub?.status === 'rejected' || sub?.status === 'needs_more';
  const blocked = left <= 0;
  const first = !!intro && !hasBadge && !sub;

  /** « Plus tard » : l'invitation ne revient pas ; le badge reste disponible depuis le profil. */
  const skip = async () => {
    await markSeen(DIPLOMA_INTRO_KEY);
    router.replace('/offers');
  };

  const choose = async (fn: () => Promise<DiplomaPick | null>) => {
    setError(null);
    try {
      const file = await fn();
      if (file) setPick(file);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const send = async () => {
    if (!pick || !userId) return;
    setError(null);
    try {
      const id = await submitDiploma(userId, pick, setStep);
      await markSeen(DIPLOMA_INTRO_KEY);
      await refresh();
      router.replace({ pathname: '/diploma/analysis', params: { submission: id, kind: pick.kind, name: pick.name, size: pick.size != null ? String(pick.size) : '' } });
    } catch (e) {
      setError(e instanceof AppError && e.code === 'rate_limited' ? 'Trois tentatives par période de 30 jours : revenez plus tard.' : errorMessage(e instanceof AppError ? e : new AppError('unknown')));
    } finally {
      setStep(null);
    }
  };

  const header = first ? (
    <StepHeader step={5} fraction={pick ? 0.5 : 0} />
  ) : (
    <Header
      onBack={canBack ? () => router.back() : () => router.replace('/profile')}
      right={
        <IconButton label="Compte" onPress={() => router.push('/settings')}>
          <GearIcon size={20} />
        </IconButton>
      }
    />
  );

  const eyebrow = redo ? 'Nouvel envoi' : hasBadge ? 'Diplôme supérieur' : first ? 'Dernière étape, facultative' : 'Badge diplôme vérifié';
  const title = redo ? 'Un autre document' : hasBadge ? 'Un diplôme supérieur' : 'Vérifions votre diplôme';

  return (
    <Screen
      scroll
      testID="diploma-upload"
      header={header}
      footer={
        <>
          <Button
            testID="diploma-send"
            label={step ? STEP[step].label : 'Envoyer pour vérification'}
            loading={!!step}
            disabled={!pick || blocked}
            onPress={send}
            trailing={pick && !step ? <ArrowRightIcon size={20} color="#FFFFFF" stroke={2.4} /> : undefined}
          />
          <Small align="center" size={13}>
            {blocked ? 'Trois tentatives par période de 30 jours : revenez plus tard.' : `Tentatives restantes : ${left} / 3`}
          </Small>
          {first ? (
            <View style={{ alignItems: 'center' }}>
              <TextLink testID="diploma-skip" label="Plus tard" color={colors.muted} size={15} onPress={skip} />
            </View>
          ) : null}
        </>
      }
    >
      <View style={{ gap: 20, paddingTop: 20 }}>
        <View style={{ gap: 10 }}>
          <Rise>
            <Eyebrow>{eyebrow}</Eyebrow>
          </Rise>
          <MaskUp delay={80}>
            <Title size={34}>{title}</Title>
          </MaskUp>
          <Rise delay={200}>
            <Body muted>Le plus élevé que vous ayez. Il ajoute un badge « Diplôme vérifié » à votre CV anonyme ; sans lui, toutes les offres restent ouvertes.</Body>
          </Rise>
        </View>

        <Rise delay={280} style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 18, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <LockIcon size={18} color={colors.accent} stroke={2.2} />
            <Heading size={15.5}>Votre document reste privé</Heading>
          </View>
          <PromiseLine text={`Vérifié par notre équipe. ${t('review.delay')}`} />
          <PromiseLine text="Jamais montré aux entreprises : elles voient le badge, pas le document." />
          <PromiseLine text={`Supprimé ${DIPLOMA_RETENTION_DAYS} jours après la décision.`} />
        </Rise>

        {pick ? (
          <SlideIn>
            <View testID="diploma-picked" style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 14, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 52, height: 64, borderRadius: 10, backgroundColor: alpha(colors.accent, 0.1), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {pick.kind === 'image' ? <Image source={{ uri: pick.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : <FileIcon size={24} color={colors.accent} />}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Body weight="bold" size={15} numberOfLines={1}>
                    {pick.name}
                  </Body>
                  <Small>
                    {pick.kind === 'image' ? 'Image, convertie en JPEG' : 'PDF'} · {formatBytes(pick.size)}
                  </Small>
                </View>
                {step ? null : <Button label="Retirer" variant="ghost" size="md" onPress={() => setPick(null)} />}
              </View>
              {step ? <ProgressBar value={STEP[step].value} label="Envoi du diplôme" /> : <Small weight="semibold" color={colors.accent}>Prêt à envoyer</Small>}
            </View>
          </SlideIn>
        ) : (
          <Rise delay={360}>
            <DropTarget testID="diploma-drop" disabled={blocked} onFiles={([file]) => choose(() => diplomaFromFile(file))}>
              {(over) => (
                <View
                  style={{
                    borderWidth: 2,
                    borderStyle: 'dashed',
                    borderColor: over ? colors.accent : colors.disabled,
                    backgroundColor: over ? alpha(colors.accent, 0.06) : colors.bg,
                    borderRadius: radius.card,
                    paddingVertical: 22,
                    paddingHorizontal: 18,
                    alignItems: 'center',
                    gap: 12,
                    opacity: blocked ? 0.5 : 1,
                  }}
                >
                  <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: alpha(colors.accent, 0.1), alignItems: 'center', justifyContent: 'center' }}>
                    <CapIcon size={26} color={colors.accent} stroke={1.9} />
                  </View>
                  <Body weight="bold">{over ? 'Lâchez le fichier ici' : 'Ajoutez votre diplôme'}</Body>
                  {CAMERA_AVAILABLE ? (
                    <View style={{ alignSelf: 'stretch', gap: 8 }}>
                      <Button testID="diploma-camera" label="Photographier" variant="secondary" size="md" icon={<CameraIcon size={18} />} disabled={blocked} onPress={() => choose(pickFromCamera)} />
                      <Button testID="diploma-library" label="Choisir une image" variant="secondary" size="md" icon={<ImageIcon size={18} />} disabled={blocked} onPress={() => choose(pickFromLibrary)} />
                      <Button testID="diploma-pdf" label="Choisir un PDF" variant="secondary" size="md" icon={<FileIcon size={18} />} disabled={blocked} onPress={() => choose(pickPdf)} />
                    </View>
                  ) : (
                    <Button testID="diploma-library" label="Choisir un fichier" variant="secondary" size="md" disabled={blocked} onPress={() => choose(pickAnyWeb)} />
                  )}
                  <Small align="center" size={13}>
                    PDF, JPEG ou PNG, 15 Mo au plus.{CAMERA_AVAILABLE ? '' : ' Glisser-déposer accepté.'}
                  </Small>
                </View>
              )}
            </DropTarget>
          </Rise>
        )}

        <Small>
          Le nom inscrit doit être le vôtre{legalName ? ` : ${legalName}` : ''}.
        </Small>
        {error ? <Notice testID="diploma-error" kind="error" title="Envoi refusé" message={error} /> : null}
      </View>
    </Screen>
  );
}
