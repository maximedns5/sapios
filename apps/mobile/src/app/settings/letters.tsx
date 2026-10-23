import type { MyReferral } from '@sapios/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Button, IconButton } from '@/components/Button';
import { WaxSeal } from '@/components/Community';
import { ArrowRightIcon, CapIcon, CopyIcon, LinkIcon, ShareIcon } from '@/components/Icons';
import { MaskUp, Rise, Spinner, stagger, useCountUp } from '@/components/motion';
import { Notice } from '@/components/Notice';
import { useOverlay } from '@/components/Overlay';
import { Header, Screen } from '@/components/Screen';
import { Body, Heading, Small, Title } from '@/components/Text';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { fill, useCopy } from '@/lib/copy';
import { errorMessage } from '@/lib/errors';
import { longDate } from '@/lib/events';
import { loadOwnProfile } from '@/lib/profile';
import { copyReferral, displayLink, myReferralLink, shareReferral } from '@/lib/referral';
import { alpha, colors, radius } from '@/lib/theme';

const back = () => (router.canGoBack() ? router.back() : router.replace('/account'));

/** Enveloppe pleine (lettre disponible) ou au trait (lettre utilisée). */
function Envelope({ full }: { full: boolean }) {
  return (
    <Svg width={26} height={20} viewBox="0 0 26 20">
      <Rect x={1} y={1} width={24} height={18} rx={4} fill={full ? colors.accent : 'none'} stroke={full ? colors.accent : colors.disabled} strokeWidth={1.6} />
      <Path d="M3 4l10 7 10-7" fill="none" stroke={full ? '#FFFFFF' : colors.disabled} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * « Mes lettres de recommandation » : le lien personnel, scellé à la cire ; partager ou copier. Un
 * compteur, jamais de nom : on ne sait ni qui a utilisé la lettre, ni son verdict.
 */
export default function Letters() {
  const { userId, state } = useApp();
  const { t } = useCopy();
  const { toast } = useOverlay();
  const [referral, setReferral] = useState<MyReferral | null>(null);
  const [name, setName] = useState('Vous');
  const [error, setError] = useState<string | null>(null);
  const [seal, setSeal] = useState(1);

  useFocusEffect(
    useCallback(() => {
      setError(null);
      api
        .myReferral()
        .then(setReferral)
        .catch((e) => setError(errorMessage(e)));
      if (userId) loadOwnProfile(userId).then((p) => p?.display_name && setName(p.display_name)).catch(() => {});
    }, [userId]),
  );

  const used = useCountUp(referral?.used ?? 0, { delay: 500, duration: 700, play: !!referral });
  const link = referral?.code ? myReferralLink(referral.code) : null;
  const eligible = !!referral?.eligible && !!link;
  const left = referral?.left ?? 0;
  const quota = referral?.quota ?? 0;

  const share = async () => {
    if (!link) return;
    setSeal((k) => k + 1);
    try {
      const res = await shareReferral(link, name);
      if (res === 'copied') toast('Lien copié. À qui l’envoyez-vous ?');
    } catch (e) {
      toast(errorMessage(e));
    }
  };
  const copy = async () => {
    if (!link) return;
    try {
      await copyReferral(link);
      toast('Lien copié');
    } catch {
      toast('Copie impossible. Sélectionnez le lien à la main.');
    }
  };

  return (
    <Screen scroll testID="letters" header={<Header onBack={back} />}>
      <View style={{ gap: 24, paddingTop: 4 }}>
        <View style={{ gap: 8 }}>
          <MaskUp>
            <Title size={32} accessibilityRole="header">
              {t('referral.title')}
            </Title>
          </MaskUp>
          <Rise delay={120}>
            <Body secondary size={16}>
              {t('referral.lead')}
            </Body>
          </Rise>
        </View>

        {error ? <Notice kind="error" message={error} /> : null}
        {!referral && !error ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <Spinner />
          </View>
        ) : null}

        {referral && !eligible ? (
          <Rise style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, gap: 8 }}>
            <Heading size={17}>Réservé aux membres admis</Heading>
            <Body secondary size={15}>
              Les lettres de recommandation sont ouvertes aux membres Bac+5 et Bac+8 qui ont accès à la découverte. {state?.can_browse ? '' : 'Elles s’ouvriront avec votre accès.'}
            </Body>
          </Rise>
        ) : null}

        {eligible && link ? (
          <>
            <Rise delay={200}>
              <View testID="letter-card" style={{ backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.line, borderRadius: 22, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 46, gap: 14, overflow: 'visible', boxShadow: '0px 14px 34px rgba(26,25,24,0.08)' }}>
                <Svg width="100%" height={40} viewBox="0 0 350 40" preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
                  <Path d="M0 0 L175 36 L350 0" fill="none" stroke="#E6E0D8" strokeWidth={1.5} />
                </Svg>
                <Small size={12} weight="bold" color={colors.accent} style={{ letterSpacing: 1.4, marginTop: 18 }}>
                  LETTRE DE RECOMMANDATION
                </Small>
                <Body weight="bold" size={17} style={{ lineHeight: 24, paddingRight: 70 }}>
                  {name} se porte garant·e de la personne qui ouvrira ce lien.
                </Body>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, maxWidth: '78%' }}>
                  <LinkIcon size={16} color={colors.accent} />
                  <Body size={13.5} weight="semibold" numberOfLines={1} selectable testID="letter-link">
                    {displayLink(link)}
                  </Body>
                </View>
              </View>
              <WaxSeal key={seal} size={84} delay={seal === 1 ? 650 : 60} style={{ position: 'absolute', right: 14, bottom: -18 }} />
            </Rise>

            <Rise delay={320} style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              <Button testID="letter-share" label="Partager ma lettre" icon={<ShareIcon size={20} color="#FFFFFF" />} onPress={share} style={{ flex: 1 }} disabled={left <= 0} />
              <IconButton testID="letter-copy" label="Copier le lien" size={56} onPress={copy} disabled={left <= 0}>
                <CopyIcon size={22} />
              </IconButton>
            </Rise>

            <Rise delay={420} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, padding: 20, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <Heading size={17} style={{ flex: 1 }} testID="letters-left">
                  {left > 0 ? `Il vous reste ${left} lettre${left > 1 ? 's' : ''} sur ${quota}` : `Vos ${quota} lettres sont parties`}
                </Heading>
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', gap: 4 }}>
                  {Array.from({ length: quota }, (_, i) => (
                    <Envelope key={i} full={i < left} />
                  ))}
                </View>
              </View>
              <Small size={14}>
                {quota} lettres par période de 30 jours.
                {referral.next_letter_at ? ` La prochaine se libère le ${longDate(referral.next_letter_at).replace(/^\S+ /, '')}.` : ''}
              </Small>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: 18, padding: 14 }}>
                <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                  <Body weight="extrabold" size={24} color={colors.accent} accessibilityLabel={`${referral.used}`}>
                    {used}
                  </Body>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Body weight="bold" size={15}>
                    {referral.used > 1 ? 'personnes ont utilisé votre lettre' : 'personne a utilisé votre lettre'}
                  </Body>
                  <Small size={13.5}>{t('referral.privacy')}</Small>
                </View>
              </View>
            </Rise>

            <Rise delay={520} style={{ gap: 12 }}>
              <Heading size={17}>Ce que vaut une lettre</Heading>
              {[
                { icon: <ArrowRightIcon size={18} color={colors.accent} />, text: 'Son dossier est examiné en premier.' },
                { icon: <CapIcon size={18} color={colors.accent} stroke={2} />, text: 'Son diplôme reste exigé, comme pour tout le monde.' },
                { icon: <ArrowRightIcon size={18} color={colors.accent} />, text: 'En liste d’attente, elle passe devant. Un peu.' },
              ].map((row, i) => (
                <Rise key={row.text} delay={stagger(i, 560)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: alpha(colors.accent, 0.08), alignItems: 'center', justifyContent: 'center' }}>{row.icon}</View>
                  <Body size={15} style={{ flex: 1 }}>
                    {row.text}
                  </Body>
                </Rise>
              ))}
            </Rise>
          </>
        ) : null}
      </View>
    </Screen>
  );
}
