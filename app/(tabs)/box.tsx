import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ProfileScreen from '@/app/(tabs)/profil';
import { AppBar } from '@/components/app-bar';
import { BoxTable } from '@/components/box-table';
import { GoldenRankingModal } from '@/components/golden-ranking-modal';
import { LiveMatchCard } from '@/components/live-match-card';
import { PlayerChatModal } from '@/components/player-chat-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { WaitingListModal } from '@/components/waiting-list-modal';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/services/api';
import type { BoxDTO, CompetitionDTO, MatchDTO, PlayerDTO, SeasonDTO } from '@/types/api';
import { getActiveSeasons } from '@/utils/season-helpers';

// Types internes pour le composant
interface Player {
  id: string; // GUID
  firstName: string;
  lastName: string;
}

interface Match {
  score?: { player1: number; player2: number };
  scheduledDate?: Date;
  matchData?: MatchDTO; // Données complètes pour les cas spéciaux
}

interface BoxData {
  id: string;
  name: string;
  level: number;
  players: Player[];
  matches: { [key: string]: Match };
}

const FAVORITES_STORAGE_KEY = '@tibox_box_favorites';
const SELECTED_COMPETITION_KEY = '@tibox_selected_competition';

export default function BoxScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const boxPositionsRef = useRef<number[]>([]);
  const boxHeightsRef = useRef<number[]>([]);
  const lastHapticBoxRef = useRef<number>(-1);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [boxesData, setBoxesData] = useState<BoxData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [allPlayers, setAllPlayers] = useState<PlayerDTO[]>([]);
  const [liveMatches, setLiveMatches] = useState<MatchDTO[]>([]);
  const [allBoxes, setAllBoxes] = useState<BoxDTO[]>([]);
  const [showGoldenRankingModal, setShowGoldenRankingModal] = useState(false);
  const [showWaitingListModal, setShowWaitingListModal] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [selectedPlayerForChat, setSelectedPlayerForChat] = useState<{ id: string; name: string } | null>(null);
  const [competitions, setCompetitions] = useState<CompetitionDTO[]>([]);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string | null>(null);
  const [seasonsByCompetition, setSeasonsByCompetition] = useState<Map<string, SeasonDTO[]>>(new Map());
  const { user } = useAuth();

  // Sauvegarder la compétition sélectionnée
  const saveSelectedCompetition = useCallback(async (competitionId: string) => {
    try {
      await AsyncStorage.setItem(SELECTED_COMPETITION_KEY, competitionId);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de la compétition:', error);
    }
  }, []);

  // Charger les compétitions et grouper les saisons
  const loadCompetitionsAndSeasons = useCallback(async () => {
    try {
      const [competitionsList, allSeasons] = await Promise.all([
        api.getCompetitions(),
        api.getSeasonsCached(),
      ]);

      // Filtrer les compétitions actives
      const activeCompetitions = competitionsList.filter(c => c.active);
      setCompetitions(activeCompetitions);

      // Grouper les saisons actives par compétition
      const activeSeasons = getActiveSeasons(allSeasons);
      const seasonsMap = new Map<string, SeasonDTO[]>();
      
      activeSeasons.forEach(season => {
        const compId = season.competition_id;
        if (!seasonsMap.has(compId)) {
          seasonsMap.set(compId, []);
        }
        seasonsMap.get(compId)!.push(season);
      });

      setSeasonsByCompetition(seasonsMap);

      // Charger la compétition sauvegardée
      const savedCompetitionId = await AsyncStorage.getItem(SELECTED_COMPETITION_KEY);
      
      // Vérifier si la compétition sauvegardée existe toujours dans les compétitions actives
      if (savedCompetitionId && activeCompetitions.some(c => c.id === savedCompetitionId)) {
        setSelectedCompetitionId(savedCompetitionId);
      } else if (activeCompetitions.length > 0) {
        // Sinon, sélectionner la première compétition par défaut
        setSelectedCompetitionId(activeCompetitions[0].id);
        await saveSelectedCompetition(activeCompetitions[0].id);
      }
    } catch (err) {
      console.error('Erreur lors du chargement des compétitions:', err);
    }
  }, [saveSelectedCompetition]);

  // Charger les données depuis l'API
  const loadBoxesData = useCallback(async (competitionId: string | null) => {
    if (!competitionId) return;

    try {
      setIsLoading(true);
      setError(null);
      // Vider les données précédentes immédiatement pour éviter d'afficher l'ancien contenu
      setBoxesData([]);
      
      // Récupérer les saisons de cette compétition
      const competitionSeasons = seasonsByCompetition.get(competitionId) || [];
      
      if (competitionSeasons.length === 0) {
        setError('Cette compétition n\'a pas encore de saison active');
        setIsLoading(false);
        return;
      }

      // Utiliser la première saison de la compétition (ou la plus récente)
      const currentSeason = competitionSeasons[0];

      // Récupérer les matchs, les joueurs et les boxes de la saison en cours
      const [seasonMatches, playersList, allBoxes] = await Promise.all([
        api.getMatches(currentSeason.id),
        api.getPlayersCached(),
        api.getBoxes(currentSeason.id),
      ]);
      
      // Sauvegarder tous les joueurs pour le modal
      setAllPlayers(playersList);

      // Grouper les matchs par box_id
      const matchesByBox = new Map<string, MatchDTO[]>();
      seasonMatches.forEach((match) => {
        if (!matchesByBox.has(match.box_id)) {
          matchesByBox.set(match.box_id, []);
        }
        matchesByBox.get(match.box_id)!.push(match);
      });

      // Créer un BoxData pour chaque box
      const transformedBoxes: BoxData[] = [];

      for (const [boxId, boxMatches] of matchesByBox) {
        // Trouver les infos du box
        const boxInfo = allBoxes.find((b) => b.id === boxId);
        if (!boxInfo) continue;

        // Trouver tous les joueurs uniques dans ce box
        const playerIds = new Set<string>();
        boxMatches.forEach((match) => {
          playerIds.add(match.player_a_id);
          playerIds.add(match.player_b_id);
        });

        // Récupérer les infos des joueurs
        const boxPlayers: Player[] = playersList
          .filter((p) => playerIds.has(p.id))
          .map((p) => ({
            id: p.id,
            firstName: p.first_name,
            lastName: p.last_name,
            pictureUrl: p.picture,
            nextBoxStatus: p.current_box?.next_box_status || null,
          }));

        // Créer un mapping des matchs par paire de joueurs (index dans boxPlayers)
        const matchesMap: { [key: string]: Match } = {};
        
        boxMatches.forEach((match) => {
          const playerAIndex = boxPlayers.findIndex((p) => p.id === match.player_a_id);
          const playerBIndex = boxPlayers.findIndex((p) => p.id === match.player_b_id);

          if (playerAIndex !== -1 && playerBIndex !== -1) {
            const key = `${playerAIndex}-${playerBIndex}`;
            
            // Si les scores sont définis et différents de 0-0, c'est joué
            if (match.score_a !== null && match.score_b !== null && 
                !(match.score_a === 0 && match.score_b === 0)) {
              matchesMap[key] = {
                score: { player1: match.score_a, player2: match.score_b },
                matchData: match,
              };
            }
            // Si c'est un cas spécial (remise, blessure, absence), même sans score
            else if (match.no_show_player_id || match.retired_player_id || match.delayed_player_id) {
              matchesMap[key] = {
                matchData: match,
              };
            }
            // Sinon, afficher la date (0-0 ou pas de score, pas de cas spécial)
            else if (match.scheduled_at) {
              matchesMap[key] = {
                scheduledDate: new Date(match.scheduled_at),
                matchData: match,
              };
            }
          }
        });

        transformedBoxes.push({
          id: boxInfo.id,
          name: boxInfo.name,
          level: boxInfo.level,
          players: boxPlayers,
          matches: matchesMap,
        });
      }

      // Trier les boxes par level croissant
      transformedBoxes.sort((a, b) => a.level - b.level);
      setBoxesData(transformedBoxes);
    } catch (err) {
      console.error('Erreur lors du chargement des boxes:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [seasonsByCompetition]);

  // Charger les compétitions au démarrage
  useEffect(() => {
    loadCompetitionsAndSeasons();
  }, [loadCompetitionsAndSeasons]);

  // Charger les boxes quand la compétition change
  useEffect(() => {
    if (selectedCompetitionId && seasonsByCompetition.size > 0) {
      loadBoxesData(selectedCompetitionId);
    }
  }, [selectedCompetitionId, seasonsByCompetition, loadBoxesData]);

  // Charger les matchs en live
  const loadLiveMatches = useCallback(async () => {
    try {
      const [matches, seasons, players] = await Promise.all([
        api.getLiveMatches(),
        api.getSeasonsCached(),
        api.getPlayersCached(),
      ]);

      setAllPlayers(players);

      // Récupérer toutes les boxes de toutes les saisons actives
      const activeSeasons = getActiveSeasons(seasons);
      const allBoxesPromises = activeSeasons.map(season => api.getBoxes(season.id));
      const boxesArrays = await Promise.all(allBoxesPromises);
      const allBoxesFlat = boxesArrays.flat();
      setAllBoxes(allBoxesFlat);

      setLiveMatches(matches);
    } catch (error) {
      console.error('Erreur chargement matchs en live:', error);
      setLiveMatches([]);
    }
  }, []);

  // Charger les matchs en live au démarrage et toutes les 5 secondes
  useEffect(() => {
    loadLiveMatches();
    
    // Refresh automatique toutes les 5 secondes
    const interval = setInterval(() => {
      loadLiveMatches();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [loadLiveMatches]);

  // Charger les favoris au démarrage
  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = async () => {
    try {
      const stored = await AsyncStorage.getItem(FAVORITES_STORAGE_KEY);
      if (stored) {
        const favoriteIds = JSON.parse(stored) as string[];
        setFavorites(new Set(favoriteIds));
      }
    } catch (error) {
      console.error('Erreur lors du chargement des favoris:', error);
    }
  };

  const saveFavorites = async (newFavorites: Set<string>) => {
    try {
      await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(newFavorites)));
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des favoris:', error);
    }
  };

  const toggleFavorite = async (boxId: string) => {
    const newFavorites = new Set(favorites);
    if (newFavorites.has(boxId)) {
      newFavorites.delete(boxId);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      // Si on ajoute un favori, on supprime les autres (un seul favori à la fois)
      newFavorites.clear();
      newFavorites.add(boxId);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // Auto-scroll vers le nouveau favori
      setTimeout(() => {
        scrollToBox(boxId);
      }, 100);
    }
    setFavorites(newFavorites);
    await saveFavorites(newFavorites);
  };

  // Auto-scroll vers le box favori après le chargement
  useEffect(() => {
    if (!isLoading && favorites.size > 0 && boxesData.length > 0) {
      const favoriteBoxId = Array.from(favorites)[0];
      setTimeout(() => {
        scrollToBox(favoriteBoxId);
      }, 500);
    }
  }, [isLoading, favorites, boxesData]);

  const scrollToBox = (boxId: string) => {
    const boxIndex = boxesData.findIndex((box) => box.id === boxId);
    if (boxIndex !== -1 && boxPositionsRef.current[boxIndex] !== undefined) {
      const boxY = boxPositionsRef.current[boxIndex];
      const boxHeight = boxHeightsRef.current[boxIndex] || 500;
      const scrollY = boxY - screenHeight / 2 + boxHeight / 2;

      scrollViewRef.current?.scrollTo({
        y: Math.max(0, scrollY),
        animated: true,
      });
    }
  };

  // Mesurer la position et la hauteur de chaque box
  const handleBoxLayout = useCallback((index: number, y: number, height: number) => {
    boxPositionsRef.current[index] = y;
    boxHeightsRef.current[index] = height;
  }, []);

  const handleScroll = useCallback(
    (event: any) => {
      const scrollY = event.nativeEvent.contentOffset.y;
      const screenHeight = event.nativeEvent.layoutMeasurement?.height || 0;
      const viewportTop = scrollY;
      const viewportBottom = scrollY + screenHeight;

      let currentBoxIndex = -1;
      for (let i = 0; i < boxPositionsRef.current.length; i++) {
        const boxY = boxPositionsRef.current[i];
        if (boxY !== undefined) {
          if (boxY >= viewportTop - 50 && boxY <= viewportBottom) {
            currentBoxIndex = i;
            break;
          }
        }
      }

      if (
        currentBoxIndex !== lastHapticBoxRef.current &&
        currentBoxIndex >= 0 &&
        currentBoxIndex < boxesData.length
      ) {
        lastHapticBoxRef.current = currentBoxIndex;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    [boxesData.length]
  );

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRefreshing(true);

    try {
      await Promise.all([
        api.getPlayersCached(true),
        api.getSeasonsCached(true),
        loadCompetitionsAndSeasons(),
        loadLiveMatches(),
      ]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Erreur lors du rafraîchissement:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setRefreshing(false);
    }
  }, [loadBoxesData, loadLiveMatches]);

  const handlePlayerPress = useCallback((playerId: string) => {
    setSelectedPlayerId(playerId);
    setShowPlayerModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleStartChat = useCallback((playerId: string, playerName: string) => {
    if (!user || user.id === playerId) return; // Ne pas discuter avec soi-même
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPlayerForChat({ id: playerId, name: playerName });
    setShowChatModal(true);
  }, [user]);

  return (
    <ThemedView style={styles.container}>
      <AppBar
        menuItems={[
          {
            label: 'Golden Ranking',
            icon: 'trophy.fill',
            onPress: () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowGoldenRankingModal(true);
            },
          },
          {
            label: 'File d\'attente',
            icon: 'clock.fill',
            onPress: () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowWaitingListModal(true);
            },
          },
        ]}
      />
      
      {/* Onglets de compétitions */}
      {competitions.length > 1 && (
        <View style={[styles.competitionsTabs, { backgroundColor: colors.background, borderBottomColor: colors.text + '15' }]}>
          <View style={styles.competitionsTabsContent}>
            {competitions.map((competition) => {
              const isSelected = selectedCompetitionId === competition.id;
              return (
                <TouchableOpacity
                  key={competition.id}
                  style={[
                    styles.competitionTab,
                    isSelected && [styles.competitionTabActive, { backgroundColor: PRIMARY_COLOR + '20', borderColor: PRIMARY_COLOR, borderWidth: 1.5 }],
                    !isSelected && { backgroundColor: colors.text + '08' },
                  ]}
                  onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    // Vider les données immédiatement avant de changer d'onglet
                    setBoxesData([]);
                    setIsLoading(true);
                    setSelectedCompetitionId(competition.id);
                    // Sauvegarder le choix
                    await saveSelectedCompetition(competition.id);
                  }}
                  activeOpacity={0.7}
                >
                  <ThemedText
                    style={[
                      styles.competitionTabText,
                      { color: isSelected ? PRIMARY_COLOR : colors.text + '60' },
                      isSelected && { fontWeight: '700' },
                      !isSelected && { fontWeight: '500' },
                    ]}
                  >
                    {competition.name}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
      
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.text + '80'}
            colors={[colors.text + '80']}
            progressViewOffset={Math.max(insets.top, 16)}
            progressBackgroundColor={colorScheme === 'dark' ? '#1a1a1a' : '#ffffff'}
          />
        }
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 16 },
          (isLoading || (boxesData.length === 0 && !isLoading && !error)) && {
            ...styles.scrollContentCentered,
            // Calcul: screenHeight - AppBar (insets.top + 56) - onglets compétition (10*2 + 40 + 1) - tab bar (88 iOS / 64 Android)
            minHeight: screenHeight - insets.top - 56 - (competitions.length > 1 ? 61 : 0) - (Platform.OS === 'ios' ? 88 : 64),
          },
        ]}
      >
        {/* Message de chargement */}
        {isLoading && !error && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.text + '80'} />
            <ThemedText style={[styles.loadingText, { color: colors.text, opacity: 0.5 }]}>
              Chargement des boxes...
            </ThemedText>
          </View>
        )}

        {/* Matchs en live */}
        {liveMatches.length > 0 && (
          <View style={styles.liveMatchesSection}>
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
                  onRefereePress={(matchId) => {
                    router.push({
                      pathname: '/referee',
                      params: { matchId },
                    });
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                />
              );
            })}
          </View>
        )}

        {/* Message d'erreur ou aucun box - message unifié */}
        {(error || (boxesData.length === 0 && !isLoading)) && (
          <View style={styles.errorContainer}>
            <IconSymbol name="tray.fill" size={48} color={colors.text + '60'} />
            <ThemedText style={[styles.errorText, { color: colors.text }]}>
              {error || 'Aucun box disponible'}
            </ThemedText>
            {error && (
              <TouchableOpacity
                style={[styles.retryButton, { backgroundColor: PRIMARY_COLOR }]}
                onPress={() => selectedCompetitionId && loadBoxesData(selectedCompetitionId)}
                activeOpacity={0.7}
              >
                <ThemedText style={styles.retryButtonText}>Réessayer</ThemedText>
              </TouchableOpacity>
            )}
          </View>
        )}

        {boxesData.map((box, index) => (
          <View
            key={box.id}
            style={[
              styles.boxContainer,
              { 
                backgroundColor: colors.background,
                borderColor: colors.text + '15',
              },
            ]}
            onLayout={(event) => {
              const { y, height } = event.nativeEvent.layout;
              handleBoxLayout(index, y, height);
            }}
          >
            <View
              style={[
                styles.boxTitleContainer,
                { 
                  backgroundColor: colors.background,
                  borderBottomColor: colors.text + '15',
                },
              ]}
            >
              <View style={styles.boxTitleLeft}>
                <IconSymbol name="square.grid.2x2.fill" size={14} color={colors.text + '50'} />
                <ThemedText type="subtitle" style={[styles.boxTitle, { color: colors.text }]}>
                  {box.name}
                </ThemedText>
              </View>
              <TouchableOpacity
                onPress={() => toggleFavorite(box.id)}
                style={styles.starButton}
                activeOpacity={0.7}
              >
                <IconSymbol
                  name={favorites.has(box.id) ? 'star.fill' : 'star'}
                  size={22}
                  color={favorites.has(box.id) ? '#fbbf24' : colors.text + '40'}
                />
              </TouchableOpacity>
            </View>
            <View style={styles.tableWrapper}>
              <BoxTable 
                players={box.players} 
                matches={box.matches}
                onPlayerPress={handlePlayerPress}
              />
            </View>
          </View>
        ))}
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
          onStartChat={(playerId: string, playerName: string) => {
            setShowPlayerModal(false);
            setSelectedPlayerId(null);
            handleStartChat(playerId, playerName);
          }}
        />
      )}
      
      {/* Modal Chat Joueur */}
      {showChatModal && selectedPlayerForChat && user && (
        <PlayerChatModal
          visible={showChatModal}
          currentPlayerId={user.id}
          otherPlayerId={selectedPlayerForChat.id}
          otherPlayerName={selectedPlayerForChat.name}
          onClose={() => {
            setShowChatModal(false);
            setSelectedPlayerForChat(null);
          }}
        />
      )}
      
      {/* Modal Golden Ranking */}
      <GoldenRankingModal
        visible={showGoldenRankingModal}
        onClose={() => setShowGoldenRankingModal(false)}
      />
      
      {/* Modal File d'attente */}
      <WaitingListModal
        visible={showWaitingListModal}
        onClose={() => setShowWaitingListModal(false)}
      />
      
      {/* Modal Chat Joueur */}
      {showChatModal && selectedPlayerForChat && user && (
        <PlayerChatModal
          visible={showChatModal}
          currentPlayerId={user.id}
          otherPlayerId={selectedPlayerForChat.id}
          otherPlayerName={selectedPlayerForChat.name}
          onClose={() => {
            setShowChatModal(false);
            setSelectedPlayerForChat(null);
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
    padding: 16,
    paddingBottom: 32,
  },
  scrollContentCentered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 300,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '500',
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 300,
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorSubtext: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 300,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
  },
  boxContainer: {
    marginBottom: 24,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  boxTitleContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  boxTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  boxIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.1,
    flex: 1,
  },
  starButton: {
    padding: 6,
    marginLeft: 8,
  },
  tableWrapper: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    overflow: 'hidden',
  },
  liveMatchesSection: {
    marginBottom: 24,
  },
  liveMatchesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  liveMatchesHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  liveIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveMatchesTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  liveBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  competitionsTabs: {
    borderBottomWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  competitionsTabsContent: {
    flexDirection: 'row',
    gap: 4,
    width: '100%',
  },
  competitionTab: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  competitionTabActive: {
    // Style actif géré inline avec backgroundColor
  },
  competitionTabText: {
    fontSize: 14,
    fontWeight: '500',
  },
});

