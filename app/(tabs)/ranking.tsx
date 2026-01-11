import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ProfileScreen from '@/app/(tabs)/profil';
import { PlayerAvatar } from '@/components/player-avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/services/api';
import type { PlayerDTO, SeasonDTO } from '@/types/api';

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
  seasons: SeasonDTO[]; // Gardé pour compatibilité mais non utilisé
  matchCount?: number; // Nombre de matchs pour cette année
}

// Couleurs d'avatar adaptées au thème
const getAvatarColors = (colorScheme: 'light' | 'dark') => {
  if (colorScheme === 'dark') {
    return {
      backgroundColor: '#4B5563', // Gris moyen pour dark
      textColor: '#F3F4F6', // Gris très clair pour le texte
    };
  }
  return {
    backgroundColor: '#E5E7EB', // Gris très clair pour light
    textColor: '#374151', // Gris foncé pour le texte
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

export default function RankingScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rankings, setRankings] = useState<PlayerRanking[]>([]);
  const [availableYears, setAvailableYears] = useState<YearData[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);

  const calculateRankings = useCallback(async () => {
    try {
      if (!refreshing) {
        setLoading(true);
      }
      
      // 1. Récupérer tous les joueurs et TOUS les matchs
      const [players, allMatches] = await Promise.all([
        api.getPlayers(),
        api.getMatches(), // Récupérer tous les matchs
      ]);
      
      // Identifier l'utilisateur connecté
      if (isAuthenticated && user) {
        const currentPlayer = players.find((p) => p.email?.toLowerCase() === user.email.toLowerCase());
        if (currentPlayer) {
          setCurrentPlayerId(currentPlayer.id);
        }
      }
      
      console.log(`[RANKING DEBUG] Total joueurs actifs:`, players.filter(p => p.active).length);
      console.log(`[RANKING DEBUG] Total matchs récupérés:`, allMatches.length);
      
      // 2. Grouper les matchs par année (basé sur la date de jeu ou date prévue)
      const yearMap = new Map<number, typeof allMatches>();
      
      allMatches.forEach(match => {
        // Utiliser played_at si disponible, sinon scheduled_at
        const matchDate = match.played_at || match.scheduled_at;
        if (matchDate) {
          const year = new Date(matchDate).getFullYear();
          if (!yearMap.has(year)) {
            yearMap.set(year, []);
          }
          yearMap.get(year)!.push(match);
        }
      });
      
      // Créer la liste des années disponibles (triée décroissante)
      const years = Array.from(yearMap.entries())
        .map(([year, matches]) => ({ 
          year, 
          seasons: [] as SeasonDTO[], // Garder la structure pour compatibilité
          matchCount: matches.length 
        }))
        .sort((a, b) => b.year - a.year);
      
      console.log(`[RANKING DEBUG] Années disponibles:`, years.map(y => `${y.year} (${y.matchCount} matchs)`));
      
      setAvailableYears(years);
      
      // Sélectionner l'année courante par défaut si pas encore sélectionnée
      if (selectedYear === null && years.length > 0) {
        const currentYear = new Date().getFullYear();
        const yearToSelect = years.find(y => y.year === currentYear)?.year || years[0].year;
        setSelectedYear(yearToSelect);
      }
      
      // 3. Filtrer les matchs de l'année sélectionnée
      const yearToUse = selectedYear || years[0]?.year;
      const matches = yearMap.get(yearToUse) || [];
      
      console.log(`[RANKING DEBUG] Année sélectionnée: ${yearToUse}`);
      console.log(`[RANKING DEBUG] Matchs pour ${yearToUse}:`, matches.length);
      
      if (matches.length === 0) {
        console.log(`[RANKING DEBUG] ⚠️ Aucun match trouvé pour l'année ${yearToUse}`);
        setRankings([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      
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
      let validMatches = 0;
      let invalidMatches = 0;
      let invalidReasons = {
        noScore: 0,
        specialStatus: 0,
        playerNotFound: 0,
        noDate: 0,
      };
      
      matches.forEach((match) => {
        // Ignorer les matchs sans date (ne peuvent pas être groupés par année)
        const matchDate = match.played_at || match.scheduled_at;
        if (!matchDate) {
          invalidReasons.noDate++;
          invalidMatches++;
          console.log(`[RANKING DEBUG] Match ${match.id} ignoré: pas de date`);
          return;
        }
        
        // Ignorer les matchs non joués ou avec cas spéciaux
        const hasScore = (match.score_a !== null && match.score_a !== undefined) && 
                        (match.score_b !== null && match.score_b !== undefined);
        const hasSpecialStatus = match.no_show_player_id || match.retired_player_id || match.delayed_player_id;
        
        if (!hasScore) {
          invalidReasons.noScore++;
          invalidMatches++;
          console.log(`[RANKING DEBUG] Match ${match.id} ignoré: pas de score (score_a: ${match.score_a}, score_b: ${match.score_b})`);
          return;
        }
        
        if (hasSpecialStatus) {
          invalidReasons.specialStatus++;
          invalidMatches++;
          console.log(`[RANKING DEBUG] Match ${match.id} ignoré: cas spécial (no_show: ${match.no_show_player_id}, retired: ${match.retired_player_id}, delayed: ${match.delayed_player_id})`);
          return;
        }
        
        const playerA = playerStats.get(match.player_a_id);
        const playerB = playerStats.get(match.player_b_id);
        
        if (!playerA || !playerB) {
          invalidReasons.playerNotFound++;
          invalidMatches++;
          console.log(`[RANKING DEBUG] Match ${match.id} ignoré: joueur non trouvé (A: ${playerA ? 'OK' : 'MANQUANT'}, B: ${playerB ? 'OK' : 'MANQUANT'})`);
          return;
        }
        
        // Vérifier les points
        const pointsA = match.points_a;
        const pointsB = match.points_b;
        console.log(`[RANKING DEBUG] Match ${match.id} - Points A: ${pointsA}, Points B: ${pointsB}, Score: ${match.score_a}-${match.score_b}`);
        
        if (pointsA === null || pointsA === undefined || pointsB === null || pointsB === undefined) {
          console.log(`[RANKING DEBUG] ⚠️ Match ${match.id} a un score mais pas de points!`);
        }
        
        validMatches++;
        
        if (playerA) {
          const pointsA = match.points_a || 0;
          playerA.totalPoints += pointsA;
          playerA.matchesPlayed += 1;
          if ((match.score_a || 0) > (match.score_b || 0)) {
            playerA.wins += 1;
          } else {
            playerA.losses += 1;
          }
          console.log(`[RANKING DEBUG] Match ${match.id}: ${playerA.player.first_name} ${playerA.player.last_name} - Score: ${match.score_a}-${match.score_b}, Points: ${pointsA} (total: ${playerA.totalPoints})`);
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
          console.log(`[RANKING DEBUG] Match ${match.id}: ${playerB.player.first_name} ${playerB.player.last_name} - Score: ${match.score_b}-${match.score_a}, Points: ${pointsB} (total: ${playerB.totalPoints})`);
        }
      });
      
      console.log(`[RANKING DEBUG] Matchs valides: ${validMatches}, invalides: ${invalidMatches}`);
      console.log(`[RANKING DEBUG] Raisons d'invalidité:`, invalidReasons);
      
      // Afficher les stats par joueur
      const playersWithMatches = Array.from(playerStats.values()).filter(p => p.matchesPlayed > 0);
      console.log(`[RANKING DEBUG] Joueurs avec matchs: ${playersWithMatches.length}`);
      playersWithMatches.forEach(p => {
        console.log(`[RANKING DEBUG] - ${p.player.first_name} ${p.player.last_name}: ${p.totalPoints}pts, ${p.matchesPlayed} matchs (${p.wins}V-${p.losses}D)`);
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
      
      console.log(`[RANKING DEBUG] Classement final: ${sortedRankings.length} joueurs`);
      
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
          <ActivityIndicator size="large" color={colors.text + '80'} />
          <ThemedText style={[styles.loadingText, { color: colors.text, opacity: 0.5 }]}>
            Chargement du classement...
          </ThemedText>
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
            tintColor={colors.text + '80'}
            colors={[colors.text + '80']}
          />
        }
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.background }]}>
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
                {availableYears.map((yearData) => (
                  <TouchableOpacity
                    key={yearData.year}
                    style={[
                      styles.yearButton,
                      { 
                        borderColor: colors.text + '20',
                        backgroundColor: selectedYear === yearData.year ? PRIMARY_COLOR + '15' : 'transparent',
                      },
                      selectedYear === yearData.year && styles.yearButtonActive,
                      selectedYear === yearData.year && { borderColor: PRIMARY_COLOR, borderWidth: 2 },
                    ]}
                    onPress={() => handleYearChange(yearData.year)}
                    activeOpacity={0.7}
                  >
                    <ThemedText
                      style={[
                        styles.yearButtonText,
                        selectedYear === yearData.year && styles.yearButtonTextActive,
                        selectedYear === yearData.year ? { color: PRIMARY_COLOR, fontWeight: '700' } : { color: colors.text + '70' },
                      ]}
                    >
                      {yearData.year}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>

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
                  index === 0 && styles.firstPlaceRow,
                  index === 1 && styles.secondPlaceRow,
                  index === 2 && styles.thirdPlaceRow,
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
  header: {
    padding: 20,
    paddingBottom: 16,
  },
  headerContent: {
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
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
  yearButtonActive: {
    borderWidth: 2,
  },
  yearButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  yearButtonTextActive: {
    fontWeight: '700',
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
  podiumNameContainer: {
    alignItems: 'center',
    marginBottom: 4,
  },
  podiumName: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 14,
  },
  podiumFirstName: {
    fontSize: 14,
    lineHeight: 16,
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
    paddingBottom: 12,
  },
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  firstPlaceRow: {
    backgroundColor: '#FFD700' + '20', // Or
  },
  secondPlaceRow: {
    backgroundColor: '#C0C0C0' + '20', // Argent
  },
  thirdPlaceRow: {
    backgroundColor: '#CD7F32' + '20', // Bronze
  },
  currentUserRow: {
    borderLeftWidth: 3,
    borderLeftColor: PRIMARY_COLOR,
    backgroundColor: PRIMARY_COLOR + '08',
  },
  currentUserBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  currentUserBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#000',
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
    marginBottom: 1,
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

