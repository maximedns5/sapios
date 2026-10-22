import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { describe } from '@/lib/candidates';
import { useLayout } from '@/lib/layout';
import { colors, radius, shadow } from '@/lib/theme';
import type { Candidate } from '@/lib/types';
import { CapIcon, HeartIcon, VerifiedBadge } from './Icons';
import { haptic, Sparks, usePop } from './motion';
import { Photo, useSignedUrls } from './Photo';
import { Body, Small, Title } from './Text';

/**
 * Cœur posé sur une photo : rebond, étincelles, retour haptique léger, puis `onLike`.
 * Le like porte aujourd'hui sur tout le profil ; le like ciblé (photo, réponse) arrivera avec le lot 1.
 */
export function LikeButton({ onLike, name, locked, onLocked, testID }: { onLike: () => void; name: string; locked?: boolean; onLocked?: () => void; testID?: string }) {
  const { style, trigger } = usePop();
  const [burst, setBurst] = useState(0);
  const [liked, setLiked] = useState(false);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Aimer le profil de ${name}`}
      accessibilityState={{ disabled: !!locked }}
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
          { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: liked ? colors.accent : '#FFFFFF', boxShadow: shadow.button, opacity: locked ? 0.6 : 1 },
          style,
        ]}
      >
        <HeartIcon size={26} color={liked ? '#FFFFFF' : colors.accent} filled={liked} />
        <Sparks playKey={burst} radius={30} />
      </Animated.View>
    </Pressable>
  );
}

/** Pastille d'information (« Diplôme vérifié »). */
export function InfoChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 }}>
      {icon}
      <Body size={13.5} weight="semibold" style={{ lineHeight: 18 }}>
        {label}
      </Body>
    </View>
  );
}

/**
 * Profil complet, photos d'abord (découverte et fiche) : prénom, pastille vérifiée, repères, puis les photos
 * entrecoupées de la bio. `like` ajoute un cœur sur chaque photo.
 */
export function ProfileBody({
  candidate,
  like,
  header,
}: {
  candidate: Candidate;
  like?: { onLike: () => void; locked?: boolean; onLocked?: () => void };
  /** Remplace le bloc prénom (ex. bouton « … » à droite). */
  header?: ReactNode;
}) {
  const { columnWidth } = useLayout();
  const paths = candidate.photo_paths ?? [];
  const urls = useSignedUrls(paths);
  const photoHeight = Math.min(460, Math.round((columnWidth - 32) * 1.2));
  const meta = [candidate.age != null ? `${candidate.age} ans` : null, describe(candidate) || null].filter(Boolean).join(' · ');

  const photo = (path: string | undefined, i: number) => (
    <View key={path ?? `empty-${i}`} style={{ height: photoHeight, borderRadius: radius.card, overflow: 'hidden' }}>
      <Photo path={path} url={path ? urls[path] : ''} name={candidate.display_name} initialSize={120} accessibilityLabel={`Photo ${i + 1} de ${candidate.display_name}`} style={{ flex: 1 }} />
      {like ? (
        <View style={{ position: 'absolute', right: 14, bottom: 14 }}>
          <LikeButton testID={i === 0 ? 'like' : undefined} name={candidate.display_name} onLike={like.onLike} locked={like.locked} onLocked={like.onLocked} />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ gap: 14 }} testID="profile-card">
      {header ?? (
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Title testID="card-name" size={30} numberOfLines={1} style={{ flexShrink: 1 }}>
              {candidate.display_name}
            </Title>
            <VerifiedBadge />
          </View>
          {meta ? <Body muted size={15}>{meta}</Body> : null}
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <InfoChip icon={<CapIcon size={16} stroke={2} />} label="Diplôme vérifié" />
      </View>
      {photo(paths[0], 0)}
      {candidate.bio ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, gap: 8 }}>
          <Small weight="semibold" size={14}>
            En quelques mots
          </Small>
          <Body weight="bold" size={21} style={{ lineHeight: 28, letterSpacing: -0.2 }}>
            {candidate.bio}
          </Body>
        </View>
      ) : null}
      {paths.slice(1).map((p, i) => photo(p, i + 1))}
    </View>
  );
}
