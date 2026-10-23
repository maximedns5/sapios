import {
  levelLabel,
  MAX_ANSWERS,
  MAX_BOOKS,
  studyFieldLabel,
  THESIS_MAX_LENGTH,
  thesisLabel,
  type MemberNotice,
  type StudyField,
  type ThesisVisibility,
} from '@sapios/shared';
import * as Linking from 'expo-linking';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-state';
import { profileCompletion } from '@/lib/completion';
import { useCopy } from '@/lib/copy';
import { CONTACT_EMAIL } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { addBook, freeAnswerPosition, loadMyIntellect, loadOwnInstitution, promptText, removeBook, saveIntellectFlags, saveThesis, swapBooks, type MyIntellect } from '@/lib/intellect';
import { useLayout } from '@/lib/layout';
import { signedPhotoUrls } from '@/lib/media';
import { loadOwnProfile, loadPhotos, MAX_PHOTOS } from '@/lib/profile';
import { alpha, colors, radius, space } from '@/lib/theme';
import type { OwnProfile, Photo as PhotoRow } from '@/lib/types';
import { BookSearch } from './BookSearch';
import { Button, IconButton } from './Button';
import { Segmented, Switch } from './Controls';
import { SettingsGroup, SettingsRow } from './SettingsRow';
import { Field } from './Field';
import { AlertIcon, BookIcon, BuildingIcon, CalendarIcon, CapIcon, ChevronLeftIcon, ChevronRightIcon, CrossIcon, EditIcon, EyeIcon, GearIcon, MailIcon, PlusIcon, SparkIcon, VerifiedBadge } from './Icons';
import { MaskUp, Rise, useCountUp } from './motion';
import { useOverlay } from './Overlay';
import { Photo } from './Photo';
import { Body, Heading, Small, Title } from './Text';

const RING = 116;
const STROKE = 6;
const CIRC = 2 * Math.PI * (RING / 2 - STROKE / 2);

/** Anneau de complétion autour de la photo principale, rempli en s'animant. */
function CompletionRing({ value, photo, name }: { value: number; photo?: { path: string; url?: string }; name: string }) {
  const pct = useCountUp(Math.round(value * 100), { delay: 250, duration: 1000 });
  return (
    <View style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={RING} height={RING} style={{ position: 'absolute' }}>
        <Circle cx={RING / 2} cy={RING / 2} r={RING / 2 - STROKE / 2} stroke={colors.line} strokeWidth={STROKE} fill="none" />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={RING / 2 - STROKE / 2}
          stroke={colors.accent}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${CIRC}`}
          strokeDashoffset={CIRC * (1 - pct / 100)}
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
      <View style={{ width: RING - 24, height: RING - 24, borderRadius: (RING - 24) / 2, overflow: 'hidden' }}>
        <Photo path={photo?.path} url={photo?.url} name={name} initialSize={36} style={{ flex: 1 }} accessibilityLabel="Votre photo principale" />
      </View>
      <View accessibilityRole="text" accessibilityLabel={`Profil complété à ${pct} %`} style={{ position: 'absolute', bottom: -6, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 2, borderWidth: 2, borderColor: '#FFFFFF' }}>
        <Body size={12.5} weight="extrabold" color="#FFFFFF" style={{ lineHeight: 17 }}>
          {pct} %
        </Body>
      </View>
    </View>
  );
}

function SectionTitle({ title, count }: { title: string; count?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Heading size={18}>{title}</Heading>
      {count ? <Small weight="bold">{count}</Small> : null}
    </View>
  );
}

/** Carte pointillée « ajouter » (photo, réponse). */
function AddCard({ title, sub, onPress, testID }: { title: string; sub: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`} onPress={onPress}>
      {({ pressed }) => (
        <View style={{ borderRadius: radius.card, padding: 18, borderWidth: 2, borderStyle: 'dashed', borderColor: pressed ? colors.accent : colors.disabled, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
            <PlusIcon size={18} stroke={2.6} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Body weight="bold">{title}</Body>
            <Small>{sub}</Small>
          </View>
        </View>
      )}
    </Pressable>
  );
}

/** Avis de retrait d'un texte : le motif (obligation de motivation), compris ou contesté. */
function RemovalNotice({ notice, onAck }: { notice: MemberNotice; onAck: () => void }) {
  const what = notice.payload.content_kind === 'answer' ? 'Une de vos réponses' : notice.payload.content_kind === 'book' ? 'Un livre de votre bibliothèque' : 'Votre phrase de thèse';
  return (
    <View testID="removal-notice" accessibilityRole="alert" style={{ backgroundColor: alpha(colors.danger, 0.06), borderRadius: radius.card, padding: 18, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <AlertIcon size={18} color={colors.danger} />
        <Body weight="bold" size={15.5} color={colors.danger}>
          {what} a été retiré{notice.payload.content_kind === 'answer' ? 'e' : ''}
        </Body>
      </View>
      <Body size={14.5} secondary style={{ lineHeight: 21 }}>
        « {notice.payload.excerpt} »
      </Body>
      <Body size={14.5}>
        <Body size={14.5} weight="bold">
          Motif :{' '}
        </Body>
        {notice.payload.reason}
      </Body>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <Button label="J’ai compris" size="md" onPress={onAck} style={{ flex: 1 }} />
        <Button
          label="Contester"
          size="md"
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Contestation d’un retrait de contenu')}&body=${encodeURIComponent(`Avis ${notice.id}\n\n`)}`)}
        />
      </View>
    </View>
  );
}

/**
 * « Mon profil » : son propre profil tel qu'il se construit, avec l'anneau de complétion. Photos,
 * réponses aux questions, bibliothèque, domaine et phrase de thèse, badges ; réglages du compte
 * derrière la roue crantée. `mode="stack"` : ouvert depuis l'attente du verdict (retour en haut).
 */
export function MyProfile({ mode = 'tab' }: { mode?: 'tab' | 'stack' }) {
  const { state, userId, refresh } = useApp();
  const { t } = useCopy();
  const { toast } = useOverlay();
  const insets = useSafeAreaInsets();
  const { columnWidth } = useLayout();
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [mine, setMine] = useState<MyIntellect | null>(null);
  const [institution, setInstitution] = useState<{ institution: string | null; field: StudyField | null }>({ institution: null, field: null });
  const [thesis, setThesis] = useState('');
  const [visibility, setVisibility] = useState<ThesisVisibility>('matches');
  const [busy, setBusy] = useState(false);
  // Communauté (lot 2) : lettres restantes, événements à venir.
  const [lettersLeft, setLettersLeft] = useState<number | null>(null);
  const [upcoming, setUpcoming] = useState<number | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    const next = await loadMyIntellect(userId).catch(() => null);
    if (next) {
      setMine(next);
      setThesis(next.thesis?.line ?? '');
      setVisibility(next.thesis?.visibility ?? 'matches');
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      loadOwnProfile(userId).then(setProfile).catch(() => {});
      loadPhotos(userId)
        .then(async (list) => {
          setPhotos(list);
          setUrls(await signedPhotoUrls(list.map((p) => p.storage_path)));
        })
        .catch(() => {});
      loadOwnInstitution(userId).then(setInstitution).catch(() => {});
      reload();
      if (state?.can_refer) api.myReferral().then((r) => setLettersLeft(r.eligible ? r.left : null)).catch(() => {});
      if (state?.can_browse)
        api
          .events()
          .then((list) => setUpcoming(list.filter((e) => (e.my_status === 'registered' || e.my_status === 'waitlisted') && Date.parse(e.ends_at) > Date.now()).length))
          .catch(() => {});
    }, [reload, userId, state?.can_refer, state?.can_browse]),
  );

  const run = async (action: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await action();
      await reload();
      refresh();
      if (done) toast(done);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!state) return null;
  const name = profile?.display_name ?? 'Vous';
  const answers = mine?.answers ?? [];
  const books = mine?.books ?? [];
  const field = mine?.studyField ?? null;
  const completion = profileCompletion({ photos: photos.length, bio: profile?.bio, answers: answers.filter((a) => a.moderation_status !== 'rejected').length, books: books.length, field: !!field, thesis: !!mine?.thesis });
  const tile = (columnWidth - space.gutter * 2 - 20) / 3;
  const main = photos[0];
  const meta = [state.level ? `${levelLabel(state.level)} validé` : null, profile?.city || null].filter(Boolean).join(' · ');
  const free = freeAnswerPosition(answers);
  const thesisDirty = (mine?.thesis?.line ?? '') !== thesis.trim();
  const notices = (state.notices ?? []).filter((n): n is MemberNotice => n.kind === 'content_removed');

  const header =
    mode === 'stack' ? (
      <View style={{ height: 60, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton label="Retour" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} testID="header-back">
          <ChevronLeftIcon />
        </IconButton>
        <IconButton label="Compte et réglages" onPress={() => router.push('/settings')} testID="open-settings">
          <GearIcon size={20} />
        </IconButton>
      </View>
    ) : (
      <View style={{ height: 64, paddingLeft: space.gutter, paddingRight: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <MaskUp>
          <Title size={30}>Mon profil</Title>
        </MaskUp>
        <IconButton label="Compte et réglages" onPress={() => router.push('/settings')} testID="open-settings">
          <GearIcon size={20} />
        </IconButton>
      </View>
    );

  const section = (delay: number, children: ReactNode) => (
    <Rise delay={delay} style={{ gap: 12 }}>
      {children}
    </Rise>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="account">
      {header}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.xl + (mode === 'stack' ? insets.bottom : 0), gap: 26 }}>
        {mode === 'stack' ? (
          <MaskUp>
            <Title size={30}>Mon profil</Title>
          </MaskUp>
        ) : null}

        {notices.map((n) => (
          <RemovalNotice key={n.id} notice={n} onAck={() => run(() => api.ackNotice(n.id))} />
        ))}

        <Rise style={{ flexDirection: 'row', alignItems: 'center', gap: 18, paddingTop: 6 }}>
          <CompletionRing value={completion.value} photo={main ? { path: main.storage_path, url: urls[main.storage_path] } : undefined} name={name} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Body weight="extrabold" size={22} numberOfLines={1} style={{ flexShrink: 1 }}>
                {name}
              </Body>
              {state.level ? <VerifiedBadge size={20} /> : null}
            </View>
            {meta ? <Small size={14}>{meta}</Small> : null}
            <Body weight="semibold" size={14} color={colors.accent} style={{ marginTop: 4 }} testID="completion-next">
              {completion.next ?? 'Profil complet. Bravo.'}
            </Body>
          </View>
        </Rise>

        {state.can_refer || state.can_browse ? (
          <Rise delay={60} style={{ gap: 12 }}>
            <SectionTitle title="Communauté" />
            <SettingsGroup label="Communauté">
              {state.can_refer ? (
                <SettingsRow
                  first
                  testID="open-letters"
                  icon={<MailIcon size={18} color={colors.accent} />}
                  title="Recommander quelqu’un"
                  sub={lettersLeft != null ? `${lettersLeft} lettre${lettersLeft > 1 ? 's' : ''} disponible${lettersLeft > 1 ? 's' : ''}` : 'Vos lettres de recommandation'}
                  onPress={() => router.push('/settings/letters')}
                />
              ) : null}
              {state.can_browse ? (
                <SettingsRow
                  first={!state.can_refer}
                  testID="open-events"
                  icon={<CalendarIcon size={18} color={colors.accent} />}
                  title="Mes événements"
                  sub={upcoming ? `${upcoming} inscription${upcoming > 1 ? 's' : ''} à venir` : 'Agenda, billets et inscriptions'}
                  onPress={() => router.push('/events')}
                />
              ) : null}
            </SettingsGroup>
          </Rise>
        ) : null}

        {section(
          80,
          <>
            <SectionTitle title="Mes photos" count={`${photos.length} / ${MAX_PHOTOS}`} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {[...photos, ...(photos.length < MAX_PHOTOS ? [null] : [])].map((p, i) =>
                p ? (
                  <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Photo ${i + 1}${i === 0 ? ', principale' : ''}. Gérer mes photos`} onPress={() => router.push('/settings/photos')}>
                    <Photo path={p.storage_path} url={urls[p.storage_path]} name={name} initialSize={28} style={{ width: tile, height: tile * (4 / 3), borderRadius: 16 }} />
                  </Pressable>
                ) : (
                  <Pressable key={`add-${i}`} accessibilityRole="button" accessibilityLabel="Ajouter une photo" onPress={() => router.push('/settings/photos')}>
                    <View style={{ width: tile, height: tile * (4 / 3), borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.disabled, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                        <PlusIcon size={16} stroke={2.6} color="#FFFFFF" />
                      </View>
                    </View>
                  </Pressable>
                ),
              )}
            </View>
          </>,
        )}

        {section(
          140,
          <>
            <SectionTitle title="Mes réponses" count={`${answers.length} / ${MAX_ANSWERS}`} />
            {answers.map((a) => {
              const removed = a.moderation_status === 'rejected';
              const label = promptText(t, a.prompt_key);
              return (
                <View key={a.id} testID={`my-answer-${a.position}`} style={{ backgroundColor: removed ? colors.surfaceSoft : colors.surface, borderRadius: radius.card, padding: 18, flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Small weight="semibold" size={13.5}>
                      {label}
                    </Small>
                    <Body weight="bold" size={17} color={removed ? colors.muted : colors.text} style={{ lineHeight: 24 }}>
                      {a.answer}
                    </Body>
                    {removed ? (
                      <Small weight="bold" color={colors.danger}>
                        Retirée par la modération : invisible pour les autres
                      </Small>
                    ) : null}
                  </View>
                  <IconButton
                    label={`Modifier la réponse « ${label} »`}
                    variant="floating"
                    size={40}
                    onPress={() => router.push({ pathname: '/settings/question', params: { position: String(a.position) } })}
                  >
                    <EditIcon size={17} />
                  </IconButton>
                </View>
              );
            })}
            {free != null ? (
              <AddCard
                testID="add-answer"
                title="Ajouter une réponse"
                sub={answers.length === MAX_ANSWERS - 1 ? 'Plus qu’une question pour compléter ce bloc.' : 'Une question, une réponse courte, avec du caractère.'}
                onPress={() => router.push({ pathname: '/settings/question', params: { position: String(free) } })}
              />
            ) : null}
            <Small>{t('intellect.sensitive')}</Small>
          </>,
        )}

        {section(
          200,
          <>
            <SectionTitle title="Ma bibliothèque" count={`${books.length} / ${MAX_BOOKS}`} />
            {books.length ? (
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 4 }} accessibilityRole="list">
                {books.map((b, i) => (
                  <View key={b.id} testID={`my-book-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
                    <BookIcon size={18} color={colors.accent} />
                    <View style={{ flex: 1 }}>
                      <Body weight="bold" size={15.5} color={b.moderation_status === 'rejected' ? colors.muted : colors.text}>
                        {b.title}
                      </Body>
                      {b.author ? <Small>{b.author}</Small> : null}
                      {b.moderation_status === 'rejected' ? (
                        <Small weight="bold" color={colors.danger}>
                          Retiré par la modération
                        </Small>
                      ) : null}
                    </View>
                    {i > 0 && b.moderation_status !== 'rejected' && books[i - 1].moderation_status !== 'rejected' ? (
                      <IconButton label={`Remonter « ${b.title} »`} variant="plain" size={40} disabled={busy} onPress={() => userId && run(() => swapBooks(userId, books, books[i - 1], b))}>
                        <View style={{ transform: [{ rotate: '-90deg' }] }}>
                          <ChevronRightIcon size={18} color={colors.muted} />
                        </View>
                      </IconButton>
                    ) : null}
                    <IconButton label={`Retirer « ${b.title} »`} variant="plain" size={40} disabled={busy} onPress={() => userId && run(() => removeBook(userId, b.id))}>
                      <CrossIcon size={17} color={colors.muted} />
                    </IconButton>
                  </View>
                ))}
              </View>
            ) : (
              <Small>{t('library.empty')}</Small>
            )}
            {books.length < MAX_BOOKS ? (
              <BookSearch
                disabled={busy}
                onAdd={async (book) => {
                  let saved = false;
                  await run(async () => {
                    await addBook(books, book.title, book.author, book.olWorkId);
                    saved = true;
                  });
                  return saved;
                }}
              />
            ) : (
              <Small weight="bold" color={colors.accent}>
                Bibliothèque complète.
              </Small>
            )}
          </>,
        )}

        {section(
          260,
          <>
            <SectionTitle title="Domaine et thèse" />
            <Pressable testID="edit-field" accessibilityRole="button" accessibilityLabel={`Domaine : ${studyFieldLabel(field) ?? 'non renseigné'}. Modifier`} onPress={() => router.push('/settings/field')}>
              {({ pressed }) => (
                <View style={{ backgroundColor: pressed ? colors.line : colors.surface, borderRadius: radius.card, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <CapIcon size={20} color={colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Small size={13}>Domaine</Small>
                    <Body weight="bold">{studyFieldLabel(field) ?? 'À renseigner'}</Body>
                  </View>
                  {field && institution.field === field ? (
                    <View style={{ backgroundColor: '#FFFFFF', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Small size={12.5} weight="bold" color={colors.accent}>
                        Vérifié
                      </Small>
                    </View>
                  ) : null}
                  <ChevronRightIcon size={18} color={colors.muted} />
                </View>
              )}
            </Pressable>
            <Field
              testID="thesis"
              label={`${thesisLabel(state.level)} en une phrase`}
              placeholder="Le sujet, en une phrase"
              value={thesis}
              onChangeText={setThesis}
              maxLength={THESIS_MAX_LENGTH}
              counter
              multiline
              style={{ minHeight: 64 }}
            />
            <View style={{ gap: 8 }}>
              <Body weight="semibold" size={14.5}>
                Qui voit cette phrase ?
              </Body>
              <Segmented
                testID="thesis-visibility"
                label="Qui voit cette phrase ?"
                value={visibility}
                onChange={(v) => {
                  setVisibility(v);
                  if (mine?.thesis && userId && !thesisDirty) run(() => saveThesis(userId, mine.thesis!.line, v), v === 'everyone' ? 'Visible par tous les membres.' : 'Visible après un match.');
                }}
                options={[
                  { value: 'matches', label: 'Après un match' },
                  { value: 'everyone', label: 'Tous les membres' },
                ]}
              />
            </View>
            {thesisDirty ? (
              <Button testID="thesis-save" label={thesis.trim() ? 'Enregistrer la phrase' : 'Retirer la phrase'} size="md" disabled={busy} onPress={() => (userId ? run(() => saveThesis(userId, thesis, visibility), thesis.trim() ? 'Phrase enregistrée.' : 'Phrase retirée.') : undefined)} />
            ) : null}
            <Small>{t('intellect.thesis_warning')}</Small>
          </>,
        )}

        {section(
          320,
          <>
            <SectionTitle title="Badges" />
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, paddingHorizontal: 16 }}>
              {institution.institution ? (
                <View style={{ paddingVertical: 14, gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <BuildingIcon size={20} color={colors.accent} />
                    <Body weight="bold" size={15} style={{ flex: 1 }}>
                      Afficher mon établissement
                    </Body>
                    <Switch
                      testID="toggle-institution"
                      label={`Afficher « ${institution.institution} · vérifié » sur mon profil`}
                      value={!!mine?.showInstitution}
                      disabled={busy}
                      onChange={(v) => userId && run(() => saveIntellectFlags(userId, { show_institution: v }))}
                    />
                  </View>
                  <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, opacity: mine?.showInstitution ? 1 : 0.55 }}>
                    <BuildingIcon size={15} />
                    <Small size={13.5} weight="semibold" color={colors.text}>
                      {institution.institution} · vérifié
                    </Small>
                  </View>
                  <Small>Désactivé par défaut. L’établissement vient de votre diplôme vérifié ; l’afficher reste votre choix.</Small>
                </View>
              ) : null}
              <View style={{ paddingVertical: 14, gap: 10, borderTopWidth: institution.institution ? 1 : 0, borderColor: colors.line }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <SparkIcon size={20} color={colors.accent} />
                  <Body weight="bold" size={15} style={{ flex: 1 }}>
                    « {t('quiz.badge')} »
                  </Body>
                  <Switch testID="toggle-quiz" label={`Afficher « ${t('quiz.badge')} » sur mon profil`} value={!!mine?.showQuizBadge} disabled={busy} onChange={(v) => userId && run(() => saveIntellectFlags(userId, { show_quiz_badge: v }))} />
                </View>
                <Pressable accessibilityRole="button" onPress={() => router.push('/settings/test')} testID="open-test">
                  {({ pressed }) => (
                    <Body weight="bold" size={14.5} color={colors.accent} style={{ opacity: pressed ? 0.6 : 1 }}>
                      Passer le test d’admission →
                    </Body>
                  )}
                </Pressable>
              </View>
            </View>
          </>,
        )}

        {section(
          380,
          <>
            <SectionTitle title="En quelques mots" />
            <Pressable accessibilityRole="button" accessibilityLabel={profile?.bio ? 'Modifier ma bio' : 'Écrire ma bio'} onPress={() => router.push('/settings/profile')}>
              {({ pressed }) =>
                profile?.bio ? (
                  <View style={{ backgroundColor: pressed ? colors.line : colors.surface, borderRadius: radius.card, padding: 20, flexDirection: 'row', gap: 12 }}>
                    <Body weight="bold" size={18} style={{ flex: 1, lineHeight: 25 }}>
                      {profile.bio}
                    </Body>
                    <EditIcon size={18} color={colors.muted} />
                  </View>
                ) : (
                  <View style={{ borderRadius: radius.card, padding: 18, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.disabled, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                      <PlusIcon size={18} stroke={2.6} color="#FFFFFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Body weight="bold">Écrire ma bio</Body>
                      <Small>Une phrase suffit. Elle s’affiche entre vos photos.</Small>
                    </View>
                  </View>
                )
              }
            </Pressable>
          </>,
        )}

        {section(
          440,
          <>
            <SectionTitle title="Mes repères" />
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, paddingHorizontal: 18, paddingVertical: 4 }}>
              {[
                ['Ville', profile?.city || '—'],
                ['Âge recherché', profile ? `${profile.age_min} – ${profile.age_max} ans` : '—'],
              ].map(([k, v], i) => (
                <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
                  <Small size={14.5} weight="semibold">
                    {k}
                  </Small>
                  <Body size={15} weight="bold">
                    {v}
                  </Body>
                </View>
              ))}
            </View>
            <Button label="Modifier mon profil" variant="secondary" icon={<EditIcon size={18} />} onPress={() => router.push('/settings/profile')} />
            {state.can_browse ? (
              <Button testID="open-criteria" label="Mes critères de découverte" variant="secondary" onPress={() => router.push('/criteria')} />
            ) : null}
            {userId && state.can_browse ? (
              <Button label="Voir mon profil comme les autres" variant="ghost" icon={<EyeIcon size={18} color={colors.muted} />} onPress={() => router.push({ pathname: '/profile/[userId]', params: { userId, from: 'self' } })} />
            ) : null}
          </>,
        )}
      </ScrollView>
    </View>
  );
}
