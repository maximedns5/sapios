import { likedAnswer, likedPhoto, thesisLabel, type AffinityReason, type LikedItem, type ProfileView, type StudyField } from '@sapios/shared';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { describe } from '@/lib/candidates';
import { useCopy } from '@/lib/copy';
import { affinityChip, affinitySentences, levelAndField, promptText } from '@/lib/intellect';
import { useLayout } from '@/lib/layout';
import { alpha, colors, radius, shadow } from '@/lib/theme';
import type { Candidate } from '@/lib/types';
import { BookIcon, BuildingIcon, CapIcon, ChatIcon, HeartIcon, SparkIcon, VerifiedBadge } from './Icons';
import { haptic, Sparks, usePop } from './motion';
import { Photo, useSignedUrls } from './Photo';
import { Body, Small, Title } from './Text';

/** Profil affiché (carte de découverte ou fiche), normalisé depuis get_feed ou get_profile. */
export type ProfileData = {
  id: string;
  display_name: string;
  age: number | null;
  city: string | null;
  distance_km: number | null;
  bio: string | null;
  level: number | null;
  study_field: StudyField | null;
  field_verified: boolean;
  institution: string | null;
  quiz_badge: boolean;
  /** `id` absent tant que la fiche complète n'est pas chargée : le cœur aime alors tout le profil. */
  photos: { id?: string; path: string }[];
  /** `position` absente (aperçu du feed) : pas de like ciblé possible. */
  answers: { position?: number; prompt_key: string; answer: string }[];
  books: { title: string; author: string | null }[];
  thesis: string | null;
  reasons: AffinityReason[];
};

export function profileFromCandidate(c: Candidate): ProfileData {
  return {
    id: c.id,
    display_name: c.display_name,
    age: c.age,
    city: c.city,
    distance_km: c.distance_km,
    bio: c.bio,
    level: c.level ?? null,
    study_field: c.study_field ?? null,
    field_verified: !!c.field_verified,
    institution: c.institution ?? null,
    quiz_badge: !!c.quiz_badge,
    photos: (c.photo_paths ?? []).map((path) => ({ path })),
    answers: c.preview_answer && c.preview_prompt_key ? [{ prompt_key: c.preview_prompt_key, answer: c.preview_answer }] : [],
    books: [],
    thesis: null,
    reasons: c.affinity_reasons ?? [],
  };
}

export function profileFromView(v: ProfileView, fallback?: Candidate): ProfileData {
  return {
    id: v.id,
    display_name: v.display_name ?? fallback?.display_name ?? 'Membre',
    age: v.age ?? fallback?.age ?? null,
    city: v.city ?? fallback?.city ?? null,
    distance_km: v.distance_km ?? fallback?.distance_km ?? null,
    bio: v.bio,
    level: v.level,
    study_field: v.study_field,
    field_verified: v.field_verified,
    institution: v.institution,
    quiz_badge: v.quiz_badge,
    photos: v.photos.map((p) => ({ id: p.id, path: p.path })),
    answers: v.answers,
    books: v.books,
    thesis: v.thesis?.line ?? null,
    reasons: v.affinity?.reasons ?? fallback?.affinity_reasons ?? [],
  };
}

/** Ce qu'on aime ou à quoi l'on répond : une photo, une réponse, ou tout le profil (item nul). */
export type LikeTarget = {
  item: LikedItem | null;
  kind: 'photo' | 'answer';
  photoPath?: string;
  prompt?: string;
  text?: string;
};

export type LikeHandlers = {
  onLike: (target: LikeTarget) => void;
  onReply: (target: LikeTarget) => void;
  locked?: boolean;
  onLocked?: () => void;
};

/** Cœur posé sur une photo ou une réponse : rebond, étincelles, retour haptique léger, puis `onLike`. */
export function LikeButton({ onLike, label, locked, onLocked, testID }: { onLike: () => void; label: string; locked?: boolean; onLocked?: () => void; testID?: string }) {
  const { style, trigger } = usePop();
  const [burst, setBurst] = useState(0);
  const [liked, setLiked] = useState(false);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!locked, selected: liked }}
      onPress={() => {
        if (locked) {
          onLocked?.();
          return;
        }
        if (liked) return;
        setLiked(true);
        trigger();
        setBurst((b) => b + 1);
        haptic.light();
        setTimeout(onLike, 380);
      }}
    >
      <Animated.View
        style={[
          { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: liked ? colors.accent : '#FFFFFF', boxShadow: shadow.button, opacity: locked ? 0.6 : 1 },
          style,
        ]}
      >
        <HeartIcon size={24} color={liked ? '#FFFFFF' : colors.accent} filled={liked} />
        <Sparks playKey={burst} radius={30} />
      </Animated.View>
    </Pressable>
  );
}

/** « Répondre » : ouvre la feuille de réponse (un mot part avec le like). */
export function ReplyPill({ onPress, label, testID }: { onPress: () => void; label: string; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      {({ pressed }) => (
        <View
          style={{
            height: 44,
            paddingHorizontal: 16,
            borderRadius: radius.pill,
            backgroundColor: '#FFFFFF',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            boxShadow: shadow.button,
            transform: [{ scale: pressed ? 0.96 : 1 }],
          }}
        >
          <ChatIcon size={18} color={colors.text} />
          <Body weight="bold" size={14}>
            Répondre
          </Body>
        </View>
      )}
    </Pressable>
  );
}

/** Pastille d'information (niveau et domaine, livres en commun, établissement). */
export function InfoChip({ icon, label, tone = 'surface' }: { icon: ReactNode; label: string; tone?: 'surface' | 'accent' }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: tone === 'accent' ? alpha(colors.accent, 0.09) : colors.surface,
        borderRadius: radius.pill,
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      {icon}
      <Body size={13.5} weight="semibold" color={tone === 'accent' ? colors.accent : colors.text} style={{ lineHeight: 18 }}>
        {label}
      </Body>
    </View>
  );
}

function Actions({ name, target, like, what, testID }: { name: string; target: LikeTarget; like: LikeHandlers; what: string; testID?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <ReplyPill label={`Répondre à ${what} de ${name}`} testID={testID ? `${testID}-reply` : undefined} onPress={() => (like.locked ? like.onLocked?.() : like.onReply(target))} />
      <LikeButton testID={testID} label={`Aimer ${what} de ${name}`} locked={like.locked} onLocked={like.onLocked} onLike={() => like.onLike(target)} />
    </View>
  );
}

/**
 * Profil complet, photos d'abord (découverte et fiche) : prénom, pastilles (niveau, domaine, affinités),
 * puis les photos entrecoupées des réponses, de la bio et du « pourquoi ce profil » ; enfin la
 * bibliothèque et la phrase de thèse. `like` pose un cœur et « Répondre » sur chaque photo et réponse.
 */
export function ProfileBody({ data, like, header }: { data: ProfileData; like?: LikeHandlers; header?: ReactNode }) {
  const { t } = useCopy();
  const { columnWidth } = useLayout();
  const urls = useSignedUrls(data.photos.map((p) => p.path));
  const photoHeight = Math.min(460, Math.round((columnWidth - 32) * 1.2));
  const name = data.display_name;
  const meta = [data.age != null ? `${data.age} ans` : null, describe(data) || null].filter(Boolean).join(' · ');
  const why = affinitySentences(data.reasons, t).slice(0, 2);
  const chip = affinityChip(data.reasons);
  const shared = new Set(
    data.reasons.flatMap((r) => (r.kind === 'shared_books' ? r.titles.map((title) => title.toLocaleLowerCase('fr')) : [])),
  );
  const levelField = levelAndField(data.level, data.study_field);

  const photo = (p: { id?: string; path: string } | undefined, i: number) => (
    <View key={p?.path ?? `empty-${i}`} style={{ height: photoHeight, borderRadius: radius.card, overflow: 'hidden' }}>
      <Photo path={p?.path} url={p ? urls[p.path] : ''} name={name} initialSize={120} accessibilityLabel={`Photo ${i + 1} de ${name}`} style={{ flex: 1 }} />
      {like && p ? (
        <View style={{ position: 'absolute', right: 14, bottom: 14 }}>
          <Actions
            name={name}
            what="cette photo"
            like={like}
            testID={i === 0 ? 'like' : `like-photo-${i}`}
            target={{ item: p.id ? likedPhoto(p.id) : null, kind: 'photo', photoPath: p.path }}
          />
        </View>
      ) : null}
    </View>
  );

  type Text = { key: string; label: string; text: string; position?: number };
  const texts: Text[] = [
    ...data.answers.map((a) => ({ key: `answer-${a.position ?? a.prompt_key}`, label: promptText(t, a.prompt_key), text: a.answer, position: a.position })),
    ...(data.bio ? [{ key: 'bio', label: 'En quelques mots', text: data.bio }] : []),
  ];

  const textCard = (x: Text) => (
    <View key={x.key} style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, gap: 8 }}>
      <Small weight="semibold" size={14}>
        {x.label}
      </Small>
      <Body weight="bold" size={21} style={{ lineHeight: 28, letterSpacing: -0.2 }}>
        {x.text}
      </Body>
      {like && x.position != null ? (
        <View style={{ alignSelf: 'flex-end', marginTop: 6 }}>
          <Actions
            name={name}
            what="cette réponse"
            like={like}
            testID={`like-answer-${x.position}`}
            target={{ item: likedAnswer(x.position), kind: 'answer', prompt: x.label, text: x.text }}
          />
        </View>
      ) : null}
    </View>
  );

  const whyCard = why.length ? (
    <View key="why" accessibilityRole="text" style={{ borderRadius: radius.card, padding: 16, paddingHorizontal: 20, flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderWidth: 2, borderColor: colors.accent }}>
      <SparkIcon size={22} color={colors.accent} />
      <View style={{ flex: 1, gap: 2 }}>
        <Body weight="bold" size={15}>
          Pourquoi ce profil
        </Body>
        <Body secondary size={14.5} style={{ lineHeight: 21 }}>
          {why.join(' ')}
        </Body>
      </View>
    </View>
  ) : null;

  // Photos d'abord, entrecoupées des textes ; le « pourquoi » après le premier texte.
  const blocks: ReactNode[] = [];
  const rounds = Math.max(data.photos.length, texts.length, 1);
  for (let i = 0; i < rounds; i++) {
    if (i < data.photos.length || i === 0) blocks.push(photo(data.photos[i], i));
    if (texts[i]) blocks.push(textCard(texts[i]));
    if (i === 0 && whyCard) blocks.push(whyCard);
  }

  return (
    <View style={{ gap: 14 }} testID="profile-card">
      {header ?? (
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Title testID="card-name" size={30} numberOfLines={1} style={{ flexShrink: 1 }}>
              {name}
            </Title>
            <VerifiedBadge />
          </View>
          {meta ? <Body muted size={15}>{meta}</Body> : null}
        </View>
      )}
      {/* Une seule ligne de pastilles, qui défile : la première photo reste haute. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginHorizontal: -16 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        <InfoChip icon={<CapIcon size={16} stroke={2} />} label={levelField || 'Diplôme vérifié'} />
        {chip ? <InfoChip tone="accent" icon={<BookIcon size={16} stroke={2} color={colors.accent} />} label={chip} /> : null}
        {data.institution ? <InfoChip icon={<BuildingIcon size={16} stroke={2} />} label={`${data.institution} · vérifié`} /> : null}
        {data.quiz_badge ? <InfoChip icon={<SparkIcon size={16} stroke={2} />} label={t('quiz.badge')} /> : null}
      </ScrollView>
      {blocks}
      {data.books.length ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, gap: 12 }}>
          <Small weight="semibold" size={14}>
            Ses livres
          </Small>
          {data.books.map((b, i) => (
            <View key={`${b.title}-${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <Body weight="semibold" size={16} style={{ flex: 1 }}>
                {b.title}
                {b.author ? <Body size={16} muted>{`, ${b.author}`}</Body> : null}
              </Body>
              {shared.has(b.title.toLocaleLowerCase('fr')) ? (
                <View style={{ backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Small size={12.5} weight="bold" color="#FFFFFF">
                    En commun
                  </Small>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {data.thesis ? (
        <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, padding: 20, gap: 6 }}>
          <Small weight="semibold" size={14}>
            {thesisLabel(data.level) === 'Ma thèse' ? 'Sa thèse, en une phrase' : 'Son mémoire, en une phrase'}
          </Small>
          <Body weight="bold" size={18} style={{ lineHeight: 25 }}>
            {data.thesis}
          </Body>
          <Small>Les autres en ont fait 400 pages.</Small>
        </View>
      ) : null}
    </View>
  );
}
