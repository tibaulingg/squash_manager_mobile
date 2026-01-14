import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ProfileScreen from '@/app/(tabs)/profil';
import { PlayerAvatar } from '@/components/player-avatar';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/services/api';
import type { PlayerDTO } from '@/types/api';

interface PlayerRanking {
  player: PlayerDTO;
  totalPoints: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  currentBox?: string;
}

interface GoldenRankingModalProps {
  visible: boolean;
  onClose: () => void;
}

// Couleurs d'avatar adaptées au thème
const getAvatarColors = (colorScheme: 'light' | 'dark') => {
  if (colorScheme === 'dark') {
    return {
      backgroundColor: '#4B5563',
      textColor: '#F3F4F6',
    };
  }
  return {
    backgroundColor: '#E5E7EB',
    textColor: '#374151',
  };
};

const getMedalEmoji = (rank: number): string => {
  switch (rank) {
    case 1: return '🥇';
    case 2: return '🥈';
    case 3: return '🥉';
    default: return '';
  }
};

export function GoldenRankingModal({ visible, onClose }: GoldenRankingModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rankings, setRankings] = useState<PlayerRanking[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([]);

  const calculateRankings = useCallback(async () => {
    try {
      if (!refreshing) {
        setLoading(true);
      }
      
      // 1. Récupérer tous les joueurs
      const players = await api.getPlayersCached();
      
      // Identifier l'utilisateur connecté
      if (isAuthenticated && user) {
        const currentPlayer = players.find((p) => p.email?.toLowerCase() === user.email.toLowerCase());
        if (currentPlayer) {
          setCurrentPlayerId(currentPlayer.id);
        }
      }
      
      // 2. Déterminer l'année à utiliser (année courante par défaut si aucune sélectionnée)
      const currentYear = new Date().getFullYear();
      const yearToUse = selectedYear || currentYear;
      
      // 3. Initialiser les années disponibles si nécessaire (basé sur l'année courante et quelques années précédentes/suivantes)
      if (availableYears.length === 0) {
        const years = [];
        // Générer une liste d'années autour de l'année courante (5 ans avant, 1 an après)
        for (let i = currentYear - 5; i <= currentYear + 1; i++) {
          years.push(i);
        }
        setAvailableYears(years.sort((a, b) => b - a));
        
        // Sélectionner l'année courante par défaut si aucune n'est sélectionnée
        if (selectedYear === null) {
          setSelectedYear(currentYear);
        }
      }
      
      // 4. Récupérer les matchs filtrés par année
      const matches = await api.getMatches(undefined, undefined, undefined, yearToUse);
      
      if (matches.length === 0) {
        setRankings([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      
      // 4. Calculer les points pour chaque joueur
      const playerStats = new Map<string, PlayerRanking>();
      
      // Initialiser tous les joueurs actifs
      players.filter(p => p.active).forEach((player) => {
        playerStats.set(player.id, {
          player,
          totalPoints: 0,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
        });
      });
      
      // Parcourir tous les matchs et calculer les stats
      matches.forEach((match) => {
        const playerA = playerStats.get(match.player_a_id);
        const playerB = playerStats.get(match.player_b_id);
        
        if (!playerA || !playerB) {
          return;
        }
        
        if (playerA) {
          const pointsA = match.points_a || 0;
          playerA.totalPoints += pointsA;
          playerA.matchesPlayed += 1;
          if ((match.score_a || 0) > (match.score_b || 0)) {
            playerA.wins += 1;
          } else {
            playerA.losses += 1;
          }
        }
        
        if (playerB) {
          const pointsB = match.points_b || 0;
          playerB.totalPoints += pointsB;
          playerB.matchesPlayed += 1;
          if ((match.score_b || 0) > (match.score_a || 0)) {
            playerB.wins += 1;
          } else {
            playerB.losses += 1;
          }
        }
      });
      
      // 5. Trier par points décroissants
      const sortedRankings = Array.from(playerStats.values())
        .filter(p => p.matchesPlayed > 0)
        .sort((a, b) => {
          if (b.totalPoints !== a.totalPoints) {
            return b.totalPoints - a.totalPoints;
          }
          if (b.wins !== a.wins) {
            return b.wins - a.wins;
          }
          return b.matchesPlayed - a.matchesPlayed;
        });
      
      setRankings(sortedRankings);
    } catch (error) {
      console.error('Erreur calcul classement:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshing, selectedYear, isAuthenticated, user]);

  useEffect(() => {
    if (visible) {
      calculateRankings();
    }
  }, [visible, calculateRankings]);

  const handleRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    await calculateRankings();
  };

  const handleYearChange = (year: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedYear(year);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top - 50 }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.text + '15' }]}>
          <View style={styles.headerContent}>
            <ThemedText style={styles.title}>🏆 Golden Ranking</ThemedText>
            
            {/* Sélecteur d'année */}
            {availableYears.length > 0 && (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.yearSelector}
                style={styles.yearSelectorContainer}
              >
                {availableYears.map((year) => (
                  <TouchableOpacity
                    key={year}
                    style={[
                      styles.yearButton,
                      { 
                        borderColor: colors.text + '20',
                        backgroundColor: selectedYear === year ? PRIMARY_COLOR + '15' : 'transparent',
                      },
                      selectedYear === year && { borderColor: PRIMARY_COLOR, borderWidth: 2 },
                    ]}
                    onPress={() => handleYearChange(year)}
                    activeOpacity={0.7}
                  >
                    <ThemedText
                      style={[
                        styles.yearButtonText,
                        selectedYear === year ? { color: PRIMARY_COLOR, fontWeight: '700' } : { color: colors.text + '70' },
                      ]}
                    >
                      {year}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
          
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            activeOpacity={0.7}
          >
            <IconSymbol name="xmark.circle.fill" size={28} color={colors.text + '60'} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.text + '80'} />
            <ThemedText style={[styles.loadingText, { color: colors.text, opacity: 0.5 }]}>
              Chargement du classement...
            </ThemedText>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.text + '80'}
                colors={[colors.text + '80']}
              />
            }
          >
            {/* Podium Top 3 */}
            {rankings.length >= 3 && (
              <View style={[styles.podiumContainer, { backgroundColor: colors.background }]}>
                {/* 2ème place */}
                <View style={styles.podiumPosition}>
                  <View style={[styles.podiumAvatarContainer, styles.podiumAvatar2]}>
                    <PlayerAvatar
                      firstName={rankings[1].player.first_name}
                      lastName={rankings[1].player.last_name}
                      pictureUrl={rankings[1].player.picture}
                      size={60}
                      backgroundColor={getAvatarColors(colorScheme ?? 'light').backgroundColor}
                      textColor={getAvatarColors(colorScheme ?? 'light').textColor}
                    />
                  </View>
                  <ThemedText style={styles.podiumMedal}>🥈</ThemedText>
                  <View style={styles.podiumNameContainer}>
                    <ThemedText style={styles.podiumName} numberOfLines={1}>
                      {rankings[1].player.first_name}
                    </ThemedText>
                    <ThemedText style={styles.podiumName} numberOfLines={1}>
                      {rankings[1].player.last_name}
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.podiumPoints, { color: colors.text }]}>
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
                      backgroundColor={getAvatarColors(colorScheme ?? 'light').backgroundColor}
                      textColor={getAvatarColors(colorScheme ?? 'light').textColor}
                    />
                  </View>
                  <ThemedText style={styles.podiumMedal}>🥇</ThemedText>
                  <View style={styles.podiumNameContainer}>
                    <ThemedText style={[styles.podiumName, styles.podiumFirstName]} numberOfLines={1}>
                      {rankings[0].player.first_name}
                    </ThemedText>
                    <ThemedText style={[styles.podiumName, styles.podiumFirstName]} numberOfLines={1}>
                      {rankings[0].player.last_name}
                    </ThemedText>
                  </View>
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
                      backgroundColor={getAvatarColors(colorScheme ?? 'light').backgroundColor}
                      textColor={getAvatarColors(colorScheme ?? 'light').textColor}
                    />
                  </View>
                  <ThemedText style={styles.podiumMedal}>🥉</ThemedText>
                  <View style={styles.podiumNameContainer}>
                    <ThemedText style={styles.podiumName} numberOfLines={1}>
                      {rankings[2].player.first_name}
                    </ThemedText>
                    <ThemedText style={styles.podiumName} numberOfLines={1}>
                      {rankings[2].player.last_name}
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.podiumPoints, { color: colors.text }]}>
                    {rankings[2].totalPoints} pts
                  </ThemedText>
                </View>
              </View>
            )}

            {/* Liste complète */}
            <View style={[styles.listContainer, { backgroundColor: colors.background }]}>
              <ThemedText style={styles.listTitle}>Classement complet</ThemedText>
              
              {rankings.map((ranking, index) => {
                const isCurrentUser = currentPlayerId === ranking.player.id;
                return (
                  <TouchableOpacity
                    key={ranking.player.id}
                    style={[
                      styles.rankingRow,
                      { borderBottomColor: colors.text + '15' },
                      index === rankings.length - 1 && styles.lastRow,
                      isCurrentUser && styles.currentUserRow,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => {
                      setSelectedPlayerId(ranking.player.id);
                      setShowPlayerModal(true);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    {/* Rang */}
                    <View style={styles.rankContainer}>
                      <ThemedText style={[styles.rank, index < 3 && styles.topThreeRank]}>
                        {index + 1}
                      </ThemedText>
                    </View>

                    {/* Avatar */}
                    <PlayerAvatar
                      firstName={ranking.player.first_name}
                      lastName={ranking.player.last_name}
                      pictureUrl={ranking.player.picture}
                      size={40}
                      backgroundColor={getAvatarColors(colorScheme ?? 'light').backgroundColor}
                      textColor={getAvatarColors(colorScheme ?? 'light').textColor}
                    />

                    {/* Info joueur */}
                    <View style={styles.playerInfo}>
                      <ThemedText style={[styles.playerName, { color: colors.text }]} numberOfLines={1}>
                        {ranking.player.first_name} {ranking.player.last_name}
                      </ThemedText>
                      <View style={styles.playerStats}>
                        <ThemedText style={styles.playerRecord}>
                          {ranking.wins}V - {ranking.losses}D
                        </ThemedText>
                      </View>
                    </View>

                    {/* Points */}
                    <View style={styles.pointsContainer}>
                      <ThemedText style={[styles.points, { color: colors.text }]}>
                        {ranking.totalPoints}
                      </ThemedText>
                      <ThemedText style={styles.pointsLabel}>pts</ThemedText>
                    </View>
                    {isCurrentUser && (
                      <View style={styles.currentUserBadge}>
                        <ThemedText style={styles.currentUserBadgeText}>Vous</ThemedText>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
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
        )}
      </View>
      
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  closeButton: {
    padding: 4,
    marginTop: -4,
  },
  yearSelectorContainer: {
    marginTop: 4,
  },
  yearSelector: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 4,
  },
  yearButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    minWidth: 70,
  },
  yearButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    minHeight: 400,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '500',
  },
  podiumContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingVertical: 24,
    paddingHorizontal: 20,
    gap: 8,
  },
  podiumPosition: {
    alignItems: 'center',
    flex: 1,
  },
  podiumFirst: {
    order: -1,
  },
  podiumAvatarContainer: {
    marginBottom: 8,
  },
  podiumAvatar1: {
    marginBottom: 12,
  },
  podiumAvatar2: {
    marginBottom: 8,
  },
  podiumAvatar3: {
    marginBottom: 8,
  },
  podiumMedal: {
    fontSize: 32,
    marginBottom: 4,
  },
  podiumNameContainer: {
    alignItems: 'center',
    marginBottom: 4,
  },
  podiumName: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  podiumFirstName: {
    fontSize: 14,
    fontWeight: '700',
  },
  podiumPoints: {
    fontSize: 14,
    fontWeight: '600',
  },
  podiumFirstPoints: {
    fontSize: 16,
    fontWeight: '700',
    color: PRIMARY_COLOR,
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    gap: 12,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  currentUserRow: {
    backgroundColor: PRIMARY_COLOR + '08',
    borderRadius: 8,
    marginHorizontal: -4,
    paddingHorizontal: 8,
  },
  rankContainer: {
    width: 32,
    alignItems: 'center',
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
  playerInfo: {
    flex: 1,
    marginLeft: 4,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  playerStats: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  playerBox: {
    fontSize: 12,
    opacity: 0.6,
  },
  playerRecord: {
    fontSize: 12,
    opacity: 0.6,
  },
  pointsContainer: {
    alignItems: 'flex-end',
  },
  points: {
    fontSize: 16,
    fontWeight: '700',
  },
  pointsLabel: {
    fontSize: 11,
    opacity: 0.5,
    marginTop: 2,
  },
  currentUserBadge: {
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  currentUserBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    opacity: 0.5,
    textAlign: 'center',
  },
});
