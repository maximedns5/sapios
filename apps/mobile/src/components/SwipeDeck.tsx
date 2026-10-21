import { forwardRef, useImperativeHandle } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming, Extrapolation } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { Candidate } from '@/lib/types';
import { ProfileCard } from './ProfileCard';
import { Stamp } from './Stamp';

export type Direction = 'like' | 'pass';
export type SwipeCardHandle = { fling: (direction: Direction) => void };

const THRESHOLD = 110;

/** Carte glissable : à droite j'aime, à gauche je passe ; tampons « J'AIME » / « PASSER » en surimpression. */
export const SwipeCard = forwardRef<SwipeCardHandle, { candidate: Candidate; onSwiped: (d: Direction) => void; onOpen: () => void; likeLocked: boolean }>(
  function SwipeCard({ candidate, onSwiped, onOpen, likeLocked }, ref) {
    const { width } = useWindowDimensions();
    const x = useSharedValue(0);
    const y = useSharedValue(0);
    const out = Math.max(width, 420) * 1.4;

    const fling = (direction: Direction) => {
      x.value = withTiming(direction === 'like' ? out : -out, { duration: 280 }, (done) => {
        if (done) scheduleOnRN(onSwiped, direction);
      });
    };
    useImperativeHandle(ref, () => ({ fling }));

    const pan = usePanGesture({
      activeOffsetX: [-12, 12],
      onUpdate: (e) => {
        'worklet';
        x.value = likeLocked && e.translationX > 0 ? e.translationX * 0.25 : e.translationX;
        y.value = e.translationY * 0.15;
      },
      onDeactivate: (e) => {
        'worklet';
        const goRight = !likeLocked && (x.value > THRESHOLD || e.velocityX > 900);
        const goLeft = x.value < -THRESHOLD || e.velocityX < -900;
        if (goRight || goLeft) {
          const direction: Direction = goRight ? 'like' : 'pass';
          x.value = withTiming(goRight ? out : -out, { duration: 220 }, (done) => {
            if (done) scheduleOnRN(onSwiped, direction);
          });
          y.value = withTiming(y.value + e.velocityY * 0.05, { duration: 220 });
        } else {
          if (likeLocked && x.value > THRESHOLD * 0.25) scheduleOnRN(onSwiped, 'like');
          x.value = withSpring(0, { damping: 18, stiffness: 180 });
          y.value = withSpring(0, { damping: 18, stiffness: 180 });
        }
      },
    });

    const cardStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: x.value }, { translateY: y.value }, { rotate: `${x.value / 22}deg` }],
    }));
    const likeStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [20, THRESHOLD], [0, 1], Extrapolation.CLAMP) }));
    const passStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-20, -THRESHOLD], [0, 1], Extrapolation.CLAMP) }));

    return (
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flex: 1 }, cardStyle]}>
          <ProfileCard candidate={candidate} onOpen={onOpen} />
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 40, left: 22 }, likeStyle]}>
            <Stamp word="J’AIME" size={34} rotate={-12} />
          </Animated.View>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 40, right: 22 }, passStyle]}>
            <Stamp word="PASSER" size={34} rotate={12} />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    );
  },
);

/** Carte suivante, immobile sous la carte active. */
export function NextCard({ candidate }: { candidate: Candidate }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, transform: [{ scale: 0.965 }, { translateY: 10 }] }}>
      <ProfileCard candidate={candidate} />
    </View>
  );
}
