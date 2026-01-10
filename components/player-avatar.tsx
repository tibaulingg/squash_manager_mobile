import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { ThemedText } from './themed-text';

interface PlayerAvatarProps {
  firstName: string;
  lastName: string;
  pictureUrl?: string | null;
  size?: number;
  backgroundColor?: string;
}

const getInitials = (firstName: string, lastName: string): string => {
  return `${firstName[0]}${lastName[0]}`.toUpperCase();
};

export function PlayerAvatar({ 
  firstName, 
  lastName, 
  pictureUrl, 
  size = 40,
  backgroundColor = '#9ca3af' 
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
      <ThemedText style={[styles.initials, { fontSize: size * 0.35 }]}>
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
    color: '#fff',
    fontWeight: '600',
  },
});
