import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { ThemedText } from './themed-text';

interface PlayerAvatarProps {
  firstName: string;
  lastName: string;
  pictureUrl?: string | null;
  size?: number;
  backgroundColor?: string;
  textColor?: string;
}

const getInitials = (firstName: string, lastName: string): string => {
  const first = firstName?.[0] || '';
  const last = lastName?.[0] || '';
  if (!first && !last) return '??';
  return `${first}${last}`.toUpperCase();
};

export function PlayerAvatar({ 
  firstName, 
  lastName, 
  pictureUrl, 
  size = 40,
  backgroundColor = '#9ca3af',
  textColor 
}: PlayerAvatarProps) {
  const borderRadius = size / 2;

  if (pictureUrl) {
    return (
      <Image
        source={{ uri: pictureUrl }}
        style={[
          styles.image,
          { width: size, height: size, borderRadius }
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.initialsContainer,
        { 
          width: size, 
          height: size, 
          borderRadius,
          backgroundColor 
        }
      ]}
    >
      <ThemedText style={[styles.initials, { fontSize: size * 0.28, color: textColor || '#fff' }]}>
        {getInitials(firstName, lastName)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    resizeMode: 'cover',
  },
  initialsContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    fontWeight: '600',
  },
});
