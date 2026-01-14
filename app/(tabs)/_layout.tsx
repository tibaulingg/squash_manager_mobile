import { Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/services/api';

export default function TabLayout() {
  const { isAuthenticated } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const [liveMatchesCount, setLiveMatchesCount] = useState(0);

  // Vérifier s'il y a des matchs en cours
  useEffect(() => {
    const checkLiveMatches = async () => {
      try {
        const matches = await api.getLiveMatches();
        setLiveMatchesCount(matches.length);
      } catch (error) {
        setLiveMatchesCount(0);
      }
    };

    if (isAuthenticated) {
      checkLiveMatches();
      // Vérifier toutes les 30 secondes
      const interval = setInterval(checkLiveMatches, 30000);
      return () => clearInterval(interval);
    } else {
      setLiveMatchesCount(0);
    }
  }, [isAuthenticated]);

  // Composant d'icône avec badge pour l'onglet Box
  const BoxTabIcon = ({ color }: { color: string }) => (
    <View style={styles.iconContainer}>
      <IconSymbol size={28} name="square.grid.2x2.fill" color={color} />
      {liveMatchesCount > 0 && (
        <View style={styles.badge}>
          <ThemedText style={styles.badgeText}>{liveMatchesCount}</ThemedText>
        </View>
      )}
    </View>
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: isDark ? PRIMARY_COLOR : '#11181C',
        tabBarInactiveTintColor: colors.icon,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopWidth: 1,
          borderTopColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: isDark ? 0.3 : 0.1,
          shadowRadius: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 4,
        },
      }}>
      <Tabs.Screen
        name="live"
        options={{
          href: null, // Masquer l'onglet mais garder la route accessible
        }}
      />
      <Tabs.Screen
        name="ranking"
        options={{
          href: null, // Masquer l'onglet mais garder la route accessible
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          href: null, // Masquer l'onglet mais garder la route accessible
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="box"
        options={{
          title: 'Classement',
          tabBarIcon: ({ color }) => <BoxTabIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="sparkles" color={color} />,
          href: isAuthenticated ? '/(tabs)/feed' : null, // Masquer si non connecté
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
});
