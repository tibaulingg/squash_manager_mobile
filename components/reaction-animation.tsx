import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { ThemedText } from './themed-text';

interface ReactionAnimationProps {
  emoji: string;
  onComplete?: () => void;
}

export function ReactionAnimation({ emoji, onComplete }: ReactionAnimationProps) {
  const animations = useRef(
    Array.from({ length: 15 }, () => ({
      translateY: new Animated.Value(0),
      translateX: new Animated.Value(0),
      opacity: new Animated.Value(1),
      scale: new Animated.Value(0),
      rotation: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    const animationsArray = animations.map((anim, index) => {
      // Calculer des directions aléatoires pour chaque émoji
      const angle = (index / animations.length) * Math.PI * 2;
      const distance = 80 + Math.random() * 40;
      const translateX = Math.cos(angle) * distance;
      const translateY = Math.sin(angle) * distance - 20; // Légèrement vers le haut
      const rotation = (Math.random() - 0.5) * 360;

      return Animated.parallel([
        // Animation de scale (apparition)
        Animated.spring(anim.scale, {
          toValue: 1,
          tension: 50,
          friction: 3,
          useNativeDriver: true,
        }),
        // Animation de translation
        Animated.timing(anim.translateY, {
          toValue: translateY,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(anim.translateX, {
          toValue: translateX,
          duration: 600,
          useNativeDriver: true,
        }),
        // Animation de rotation
        Animated.timing(anim.rotation, {
          toValue: rotation,
          duration: 600,
          useNativeDriver: true,
        }),
        // Animation de fade out
        Animated.sequence([
          Animated.delay(300),
          Animated.timing(anim.opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      ]);
    });

    // Lancer toutes les animations en parallèle
    Animated.parallel(animationsArray).start(() => {
      onComplete?.();
    });
  }, []);

  return (
    <View style={styles.container} pointerEvents="none">
      {animations.map((anim, index) => {
        const rotate = anim.rotation.interpolate({
          inputRange: [0, 360],
          outputRange: ['0deg', '360deg'],
        });

        return (
          <Animated.View
            key={index}
            style={[
              styles.emoji,
              {
                transform: [
                  { translateX: anim.translateX },
                  { translateY: anim.translateY },
                  { scale: anim.scale },
                  { rotate },
                ],
                opacity: anim.opacity,
              },
            ]}
          >
            <ThemedText style={styles.emojiText}>{emoji}</ThemedText>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  emoji: {
    position: 'absolute',
  },
  emojiText: {
    fontSize: 24,
  },
});
