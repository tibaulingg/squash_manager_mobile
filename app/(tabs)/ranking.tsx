import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayerAvatar } from '@/components/player-avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/services/api';
import type { MatchDTO, PlayerDTO, SeasonDTO } from '@/types/api';

interface PlayerRanking {
  player: PlayerDTO;
  totalPoints: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  currentBox?: string;
}

interface YearData {
  year: number;
  seasons: SeasonDTO[];
}

const AVATAR_COLOR = '#9ca3af';

const getMedalEmoji = (rank: number): string => {
  switch (rank) {
    case 1: return '🥇';
    case 2: return '🥈';
    case 3: return '🥉';
    default: return '';
  }
};

export default function RankingScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rankings, setRankings] = useState<PlayerRanking[]>([]);
  const [availableYears, setAvailableYears] = useState<YearData[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const calculateRankings = useCallback(async () => {
    try {
      if (!refreshing) {
        setLoading(true);
      }
      
      // 1. Récupérer toutes les saisons
      const allSeasons = await api.getSeasons();
      
      if (allSeasons.length === 0) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      
      // 2. Grouper les saisons par année
      const yearMap = new Map<number, SeasonDTO[]>();
      
      allSeasons.forEach(season => {
        const year = new Date(season.start_date).getFullYear();
        if (!yearMap.has(year)) {
          yearMap.set(year, []);
        }
        yearMap.get(year)!.push(season);
      });
      
      // Créer la liste des années disponibles (triée décroissante)
      const years = Array.from(yearMap.entries())
        .map(([year, seasons]) => ({ year, seasons }))
        .sort((a, b) => b.year - a.year);
      
      setAvailableYears(years);
      
      // Sélectionner l'année courante par défaut si pas encore sélectionnée
      if (selectedYear === null && years.length > 0) {
        const currentYear = new Date().getFullYear();
        const yearToSelect = years.find(y => y.year === currentYear)?.year || years[0].year;
        setSelectedYear(yearToSelect);
      }
      
      // 3. Filtrer les saisons de l'année sélectionnée
      const yearToUse = selectedYear || years[0]?.year;
      const seasonsOfYear = yearMap.get(yearToUse) || [];
      const seasonIds = seasonsOfYear.map(s => s.id);
      
      if (seasonIds.length === 0) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      
      // 4. Récupérer tous les joueurs et TOUS les matchs
      const [players, allMatches] = await Promise.all([
        api.getPlayers(),
        api.getMatches(), // Récupérer tous les matchs
      ]);
      
      // Filtrer les matchs de l'année sélectionnée
      const matches = allMatches.filter(m => seasonIds.includes(m.season_id));
      
      // 5. Calculer les points pour chaque joueur
      const playerStats = new Map<string, PlayerRanking>();
      
      // Initialiser tous les joueurs actifs
      players.filter(p => p.active).forEach((player) => {
        playerStats.set(player.id, {
          player,
          totalPoints: 0,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          currentBox: player.current_box?.box_name,
        });
      });
      
      // Calculer les stats à partir des matchs
      matches.forEach((match) => {
        // Ignorer les matchs non joués ou avec cas spéciaux
        const hasScore = (match.score_a !== null && match.score_a !== undefined) && 
                        (match.score_b !== null && match.score_b !== undefined);
        const hasSpecialStatus = match.no_show_player_id || match.retired_player_id || match.delayed_player_id;
        
        if (!hasScore || hasSpecialStatus) return;
        
        const playerA = playerStats.get(match.player_a_id);
        const playerB = playerStats.get(match.player_b_id);
        
        if (playerA) {
          playerA.totalPoints += match.points_a || 0;
          playerA.matchesPlayed += 1;
          if ((match.score_a || 0) > (match.score_b || 0)) {
            playerA.wins += 1;
          } else {
            playerA.losses += 1;
          }
        }
        
        if (playerB) {
          playerB.totalPoints += match.points_b || 0;
          playerB.matchesPlayed += 1;
          if ((match.score_b || 0) > (match.score_a || 0)) {
            playerB.wins += 1;
          } else {
            playerB.losses += 1;
          }
        }
      });
      
      // 6. Trier par points décroissants
      const sortedRankings = Array.from(playerStats.values())
        .filter(p => p.matchesPlayed > 0) // Ne montrer que ceux qui ont joué
        .sort((a, b) => {
          if (b.totalPoints !== a.totalPoints) {
            return b.totalPoints - a.totalPoints;
          }
          // En cas d'égalité, trier par nombre de victoires
          if (b.wins !== a.wins) {
            return b.wins - a.wins;
          }
          // Puis par nombre de matchs joués
          return b.matchesPlayed - a.matchesPlayed;
        });
      
      setRankings(sortedRankings);
    } catch (error) {
      console.error('Erreur calcul classement:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshing, selectedYear]);

  useEffect(() => {
    calculateRankings();
  }, [calculateRankings]);

  const handleRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    await calculateRankings();
  };

  const handleYearChange = (year: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedYear(year);
  };

  if (loading) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PRIMARY_COLOR} />
          <ThemedText style={styles.loadingText}>Chargement du classement...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={PRIMARY_COLOR}
            colors={[PRIMARY_COLOR]}
          />
        }
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.background }]}>
          <View style={styles.headerContent}>
            <ThemedText style={styles.title}>🏆 Golden Ranking</ThemedText>
            
            {/* Sélecteur d'année */}
            {availableYears.length > 0 && (
              <View style={styles.yearSelector}>
                {availableYears.map((yearData) => (
                  <TouchableOpacity
                    key={yearData.year}
                    style={[
                      styles.yearButton,
                      { borderColor: colors.border },
                      selectedYear === yearData.year && styles.yearButtonActive,
                      selectedYear === yearData.year && { borderColor: PRIMARY_COLOR },
                    ]}
                    onPress={() => handleYearChange(yearData.year)}
                    activeOpacity={0.7}
                  >
                    <ThemedText
                      style={[
                        styles.yearButtonText,
                        selectedYear === yearData.year && styles.yearButtonTextActive,
                        selectedYear === yearData.year && { color: PRIMARY_COLOR },
                      ]}
                    >
                      {yearData.year}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Podium Top 3 */}
        {rankings.length >= 3 && (
          <View style={[styles.podiumContainer, { backgroundColor: colors.card }]}>
            {/* 2ème place */}
            <View style={styles.podiumPosition}>
              <View style={[styles.podiumAvatarContainer, styles.podiumAvatar2]}>
                <PlayerAvatar
                  firstName={rankings[1].player.first_name}
                  lastName={rankings[1].player.last_name}
                  pictureUrl={rankings[1].player.picture}
                  size={60}
                  backgroundColor={AVATAR_COLOR}
                />
              </View>
              <ThemedText style={styles.podiumMedal}>🥈</ThemedText>
              <ThemedText style={styles.podiumName} numberOfLines={1}>
                {rankings[1].player.first_name} {rankings[1].player.last_name}
              </ThemedText>
              <ThemedText style={[styles.podiumPoints, { color: PRIMARY_COLOR }]}>
                {rankings[1].totalPoints} pts
              </ThemedText>
            </View>

            {/* 1ère place */}
            <View style={[styles.podiumPosition, styles.podiumFirst]}>
              <View style={[styles.podiumAvatarContainer, styles.podiumAvatar1]}>
                <PlayerAvatar
                  firstName={rankings[0].player.first_name}
                  lastName={rankings[0].player.last_name}
                  pictureUrl={rankings[0].player.picture}
                  size={80}
                  backgroundColor={AVATAR_COLOR}
                />
              </View>
              <ThemedText style={styles.podiumMedal}>🥇</ThemedText>
              <ThemedText style={[styles.podiumName, styles.podiumFirstName]} numberOfLines={1}>
                {rankings[0].player.first_name} {rankings[0].player.last_name}
              </ThemedText>
              <ThemedText style={[styles.podiumPoints, styles.podiumFirstPoints]}>
                {rankings[0].totalPoints} pts
              </ThemedText>
            </View>

            {/* 3ème place */}
            <View style={styles.podiumPosition}>
              <View style={[styles.podiumAvatarContainer, styles.podiumAvatar3]}>
                <PlayerAvatar
                  firstName={rankings[2].player.first_name}
                  lastName={rankings[2].player.last_name}
                  pictureUrl={rankings[2].player.picture}
                  size={60}
                  backgroundColor={AVATAR_COLOR}
                />
              </View>
              <ThemedText style={styles.podiumMedal}>🥉</ThemedText>
              <ThemedText style={styles.podiumName} numberOfLines={1}>
                {rankings[2].player.first_name} {rankings[2].player.last_name}
              </ThemedText>
              <ThemedText style={[styles.podiumPoints, { color: PRIMARY_COLOR }]}>
                {rankings[2].totalPoints} pts
              </ThemedText>
            </View>
          </View>
        )}

        {/* Liste complète */}
        <View style={[styles.listContainer, { backgroundColor: colors.card }]}>
          <ThemedText style={styles.listTitle}>Classement complet</ThemedText>
          
          {rankings.map((ranking, index) => (
            <TouchableOpacity
              key={ranking.player.id}
              style={[
                styles.rankingRow,
                { borderBottomColor: colors.border },
                index === rankings.length - 1 && styles.lastRow,
                index < 3 && styles.topThreeRow,
              ]}
              activeOpacity={0.7}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            >
              {/* Rang */}
              <View style={styles.rankContainer}>
                <ThemedText style={[styles.rank, index < 3 && styles.topThreeRank]}>
                  {index + 1}
                </ThemedText>
                {index < 3 && (
                  <ThemedText style={styles.medalEmoji}>
                    {getMedalEmoji(index + 1)}
                  </ThemedText>
                )}
              </View>

              {/* Avatar */}
              <PlayerAvatar
                firstName={ranking.player.first_name}
                lastName={ranking.player.last_name}
                pictureUrl={ranking.player.picture}
                size={40}
                backgroundColor={AVATAR_COLOR}
              />

              {/* Info joueur */}
              <View style={styles.playerInfo}>
                <ThemedText style={[styles.playerName, { color: colors.text }]} numberOfLines={1}>
                  {ranking.player.first_name} {ranking.player.last_name}
                </ThemedText>
                <View style={styles.playerStats}>
                  {ranking.currentBox && (
                    <ThemedText style={styles.playerBox}>
                      {ranking.currentBox}
                    </ThemedText>
                  )}
                  <ThemedText style={styles.playerRecord}>
                    {ranking.wins}V - {ranking.losses}D
                  </ThemedText>
                </View>
              </View>

              {/* Points */}
              <View style={styles.pointsContainer}>
                <ThemedText style={[styles.points, { color: PRIMARY_COLOR }]}>
                  {ranking.totalPoints}
                </ThemedText>
                <ThemedText style={styles.pointsLabel}>pts</ThemedText>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {rankings.length === 0 && (
          <View style={styles.emptyContainer}>
            <ThemedText style={styles.emptyText}>
              Aucun classement disponible pour le moment
            </ThemedText>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    opacity: 0.6,
  },
  header: {
    padding: 20,
    paddingBottom: 16,
  },
  headerContent: {
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12,
  },
  yearSelector: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  yearButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  yearButtonActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  yearButtonText: {
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.6,
  },
  yearButtonTextActive: {
    opacity: 1,
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.6,
  },
  podiumContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    padding: 20,
    marginHorizontal: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  podiumPosition: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 16,
  },
  podiumFirst: {
    paddingBottom: 24,
  },
  podiumAvatarContainer: {
    marginBottom: 8,
    borderRadius: 50,
    overflow: 'hidden',
  },
  podiumAvatar1: {
    borderWidth: 3,
    borderColor: '#FFD700',
  },
  podiumAvatar2: {
    borderWidth: 3,
    borderColor: '#C0C0C0',
  },
  podiumAvatar3: {
    borderWidth: 3,
    borderColor: '#CD7F32',
  },
  podiumMedal: {
    fontSize: 32,
    marginBottom: 4,
  },
  podiumName: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 2,
  },
  podiumFirstName: {
    fontSize: 14,
  },
  podiumPoints: {
    fontSize: 14,
    fontWeight: '700',
  },
  podiumFirstPoints: {
    fontSize: 18,
  },
  listContainer: {
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '700',
    padding: 16,
    paddingBottom: 12,
  },
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  topThreeRow: {
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  rankContainer: {
    width: 40,
    alignItems: 'center',
    marginRight: 8,
  },
  rank: {
    fontSize: 16,
    fontWeight: '600',
    opacity: 0.6,
  },
  topThreeRank: {
    fontSize: 18,
    fontWeight: '700',
    opacity: 1,
  },
  medalEmoji: {
    fontSize: 12,
    marginTop: -2,
  },
  playerInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 12,
  },
  playerName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  playerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playerBox: {
    fontSize: 12,
    opacity: 0.6,
  },
  playerRecord: {
    fontSize: 12,
    opacity: 0.5,
  },
  pointsContainer: {
    alignItems: 'flex-end',
  },
  points: {
    fontSize: 20,
    fontWeight: '700',
  },
  pointsLabel: {
    fontSize: 11,
    opacity: 0.5,
    marginTop: -2,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.6,
    textAlign: 'center',
  },
});

