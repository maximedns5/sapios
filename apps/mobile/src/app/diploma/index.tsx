import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, TextLink } from '@/components/Button';
import { ArrowIcon } from '@/components/Icons';
import { Notice } from '@/components/Notice';
import { Reveal, RevealLines } from '@/components/Reveal';
import { Rule, Screen, TopBar } from '@/components/Screen';
import { Body, Em, Label, Mono, Title } from '@/components/Text';
import { useTone } from '@/components/Tone';
import { useApp } from '@/lib/app-state';
import { CAMERA_AVAILABLE, formatBytes, pickFromCamera, pickFromLibrary, pickPdf, submitDiploma, type DiplomaPick, type SubmitStep } from '@/lib/diploma';
import { AppError, errorMessage } from '@/lib/errors';
import { loadLegalName } from '@/lib/profile';

const STEP_LABEL: Record<SubmitStep, string> = { convert: 'Conversion…', upload: 'Envoi…', submit: 'Soumission…' };

function Option({ title, hint, onPress, disabled, testID }: { title: string; hint: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  const { fg, bg } = useTone();
  return (
    <Pressable testID={testID} accessibilityRole="button" disabled={disabled} onPress={onPress}>
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 16,
            paddingHorizontal: 8,
            marginHorizontal: -8,
            backgroundColor: pressed ? fg : bg,
            opacity: disabled ? 0.35 : 1,
          }}
        >
          <View style={{ gap: 4, flex: 1 }}>
            <Title size={26} color={pressed ? bg : fg}>
              {title}
            </Title>
            <Label color={pressed ? bg : fg} style={{ opacity: 0.7 }}>
              {hint}
            </Label>
          </View>
          <ArrowIcon color={pressed ? bg : fg} />
        </View>
      )}
    </Pressable>
  );
}

/** Choix et envoi du diplôme (photo, caméra ou PDF). */
export default function DiplomaUpload() {
  const { userId, state, refresh } = useApp();
  const { fg, bg } = useTone();
  const [legalName, setLegalName] = useState<string | null>(null);
  const [pick, setPick] = useState<DiplomaPick | null>(null);
  const [step, setStep] = useState<SubmitStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canBack, setCanBack] = useState(false);

  useEffect(() => {
    if (userId) loadLegalName(userId).then(setLegalName);
    setCanBack(router.canGoBack());
  }, [userId]);

  const left = state?.submissions_left ?? 3;
  const hasTier = !!state?.tier;
  const blocked = left <= 0;

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
      await refresh();
      router.replace({ pathname: '/diploma/analysis', params: { submission: id, kind: pick.kind } });
    } catch (e) {
      setError(errorMessage(e instanceof AppError ? e : new AppError('unknown')));
    } finally {
      setStep(null);
    }
  };

  return (
    <Screen
      scroll
      testID="diploma-upload"
      header={
        <TopBar
          left={canBack ? { label: '← Retour', onPress: () => router.back() } : 'Étape 01 / 01'}
          right={{ label: 'Compte', onPress: () => router.push('/settings') }}
        />
      }
      footer={
        pick ? (
          <Button
            testID="diploma-send"
            label={step ? STEP_LABEL[step] : 'Envoyer pour analyse'}
            trailing={step ? undefined : '→'}
            loading={!!step}
            disabled={blocked}
            onPress={send}
          />
        ) : undefined
      }
    >
      <View style={{ gap: 22, paddingTop: 8 }}>
        <Reveal delay={100}>
          <Label>{hasTier ? 'Nouvelle tentative' : 'Vérification obligatoire'}</Label>
        </Reveal>
        <View>
          <RevealLines
            delay={160}
            lines={[
              <Title key="a" size={46}>
                {hasTier ? 'Faites mieux.' : 'Validez votre'}
              </Title>,
              <Title key="b" size={46}>
                <Em>{hasTier ? 'Diplôme supérieur.' : 'diplôme.'}</Em>
              </Title>,
            ]}
          />
        </View>
        <Body>
          Photo nette ou PDF de votre diplôme le plus élevé, 15 Mo maximum. Le nom inscrit doit correspondre à votre nom légal.
        </Body>
        <View style={{ borderWidth: 1.5, borderColor: fg, padding: 12, gap: 4 }}>
          <Label style={{ opacity: 0.7 }}>Titulaire attendu</Label>
          <Mono size={15}>{legalName ?? '—'}</Mono>
        </View>

        {pick ? (
          <View testID="diploma-picked" style={{ gap: 12 }}>
            <Label>Document choisi</Label>
            <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
              <View style={{ width: 72, height: 92, borderWidth: 1.5, borderColor: fg, backgroundColor: fg, alignItems: 'center', justifyContent: 'center' }}>
                {pick.kind === 'image' ? (
                  <Image source={{ uri: pick.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                ) : (
                  <Label color={bg}>PDF</Label>
                )}
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Body numberOfLines={1}>{pick.name}</Body>
                <Label style={{ opacity: 0.7 }}>
                  {pick.kind === 'image' ? 'Image · convertie en JPEG' : 'PDF'} · {formatBytes(pick.size)}
                </Label>
                <TextLink label="Changer" onPress={() => setPick(null)} />
              </View>
            </View>
          </View>
        ) : (
          <View>
            <Rule />
            <Option
              testID="diploma-camera"
              title="Photographier"
              hint={CAMERA_AVAILABLE ? 'Appareil photo' : 'Indisponible sur le web'}
              disabled={!CAMERA_AVAILABLE || blocked}
              onPress={() => choose(pickFromCamera)}
            />
            <Rule weight={1} />
            <Option testID="diploma-library" title="Choisir une image" hint="JPEG · PNG · WEBP · HEIC" disabled={blocked} onPress={() => choose(pickFromLibrary)} />
            <Rule weight={1} />
            <Option testID="diploma-pdf" title="Choisir un PDF" hint="PDF · 15 Mo max." disabled={blocked} onPress={() => choose(pickPdf)} />
            <Rule />
          </View>
        )}

        {error ? <Notice testID="diploma-error" title="Envoi refusé" message={error} /> : null}
        {blocked ? (
          <Notice title="Tentatives épuisées" message="Trois tentatives par période de 30 jours. Revenez plus tard." />
        ) : (
          <Label style={{ opacity: 0.7 }}>Tentatives restantes : {left} / 3</Label>
        )}
      </View>
    </Screen>
  );
}
