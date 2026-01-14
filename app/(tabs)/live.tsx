import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ProfileScreen from '@/app/(tabs)/profil';
import { AppBar } from '@/components/app-bar';
import { LiveMatchCard } from '@/components/live-match-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/services/api';
import type { BoxDTO, MatchDTO, PlayerDTO } from '@/types/api';

export default function LiveMatchesScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { user, isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [liveMatches, setLiveMatches] = useState<MatchDTO[]>([]);
  const [allBoxes, setAllBoxes] = useState<BoxDTO[]>([]);
  const [allPlayers, setAllPlayers] = useState<PlayerDTO[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showPlayerModal, setShowPlayerModal] = useState(false);

  // Charger les matchs en live
  const loadLiveMatches = useCallback(async () => {
    try {
      if (!refreshing) {
        setLoading(true);
      }

      const [matches, seasons, players] = await Promise.all([
        api.getLiveMatches(),
        api.getSeasons(),
        api.getPlayersCached(refreshing),
      ]);

      setAllPlayers(players);

      const currentSeason = seasons.find((s) => s.status === 'running') || seasons[0];
      if (currentSeason) {
        const boxes = await api.getBoxes(currentSeason.id);
        setAllBoxes(boxes);
      }

      setLiveMatches(matches);
    } catch (error) {
      console.error('Erreur chargement matchs en live:', error);
      setLiveMatches([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshing]);

  useEffect(() => {
    loadLiveMatches();
    // Rafraîchir toutes les 30 secondes
    const interval = setInterval(loadLiveMatches, 30000);
    return () => clearInterval(interval);
  }, [loadLiveMatches]);

  // Recharger les données quand on revient sur l'onglet
  useFocusEffect(
    useCallback(() => {
      loadLiveMatches();
    }, [loadLiveMatches])
  );

  const handleRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    await loadLiveMatches();
  };

  if (!isAuthenticated) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centered}>
          <ThemedText style={styles.authText}>Connectez-vous pour voir les matchs en cours</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (loading && !refreshing) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PRIMARY_COLOR} />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <AppBar />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 20 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.text + '80'}
            colors={[colors.text + '80']}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.iconContainer, { backgroundColor: '#ef4444' + '20' }]}>
              <IconSymbol name="livephoto" size={20} color="#ef4444" />
            </View>
            <ThemedText style={styles.headerTitle}>Matchs en cours</ThemedText>
          </View>
          {liveMatches.length > 0 && (
            <View style={[styles.badge, { backgroundColor: '#ef4444' + '20' }]}>
              <ThemedText style={[styles.badgeText, { color: '#ef4444' }]}>
                {liveMatches.length}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Matchs en live */}
        {liveMatches.length > 0 ? (
          <View style={styles.section}>
            {liveMatches.map((match) => {
              const playerA = allPlayers.find((p) => p.id === match.player_a_id);
              const playerB = allPlayers.find((p) => p.id === match.player_b_id);
              const box = allBoxes.find((b) => b.id === match.box_id);

              if (!playerA || !playerB) return null;

              return (
                <LiveMatchCard
                  key={match.id}
                  match={match}
                  playerA={playerA}
                  playerB={playerB}
                  box={box}
                  onPlayerPress={(playerId) => {
                    setSelectedPlayerId(playerId);
                    setShowPlayerModal(true);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                />
              );
            })}
          </View>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
            <IconSymbol name="livephoto" size={48} color={colors.text + '40'} />
            <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
              Aucun match en cours
            </ThemedText>
            <ThemedText style={[styles.emptyDescription, { color: colors.text + '70' }]}>
              Les matchs en cours apparaîtront ici
            </ThemedText>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
      
      {/* Modal de profil joueur */}
      {showPlayerModal && selectedPlayerId && (
        <ProfileScreen
          isModal={true}
          playerId={selectedPlayerId}
          onClose={() => {
            setShowPlayerModal(false);
            setSelectedPlayerId(null);
          }}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 400,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  authText: {
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.7,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  section: {
    marginBottom: 24,
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    marginTop: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
