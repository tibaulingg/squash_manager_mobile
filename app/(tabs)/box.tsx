import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ProfileScreen from '@/app/(tabs)/profil';
import { AppBar } from '@/components/app-bar';
import { BoxTable } from '@/components/box-table';
import { GoldenRankingModal } from '@/components/golden-ranking-modal';
import { LiveMatchCard } from '@/components/live-match-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/services/api';
import type { BoxDTO, MatchDTO, PlayerDTO } from '@/types/api';

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

const FAVORITES_STORAGE_KEY = '@squash22_box_favorites';

export default function BoxScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
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

  // Charger les données depuis l'API
  const loadBoxesData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // D'abord récupérer les saisons pour obtenir la saison en cours
      const allSeasons = await api.getSeasonsCached();

      // Trouver la saison en cours (status = 'running' ou autre critère)
      const currentSeason = allSeasons.find((s) => s.status === 'running') || allSeasons[0];
      
      if (!currentSeason) {
        setError('Aucune saison trouvée');
        setIsLoading(false);
        return;
      }

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
  }, []);

  // Charger les matchs en live
  const loadLiveMatches = useCallback(async () => {
    try {
      const [matches, seasons, players] = await Promise.all([
        api.getLiveMatches(),
        api.getSeasonsCached(),
        api.getPlayersCached(),
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
    }
  }, []);

  // Charger les données au démarrage
  useEffect(() => {
    loadBoxesData();
    loadLiveMatches();
  }, [loadBoxesData, loadLiveMatches]);

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
        loadBoxesData(),
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

  // Afficher le chargement initial
  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.text + '80'} />
          <ThemedText style={[styles.loadingText, { color: colors.text, opacity: 0.5 }]}>
            Chargement des boxes...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  // Afficher une erreur si nécessaire
  if (error) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.errorContainer}>
          <IconSymbol name="exclamationmark.triangle.fill" size={48} color={colors.text + '60'} />
          <ThemedText style={styles.errorText}>Erreur lors du chargement</ThemedText>
          <ThemedText style={[styles.errorSubtext, { color: colors.text + '60' }]}>
            {error}
          </ThemedText>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: PRIMARY_COLOR }]}
            onPress={loadBoxesData}
            activeOpacity={0.7}
          >
            <ThemedText style={styles.retryButtonText}>Réessayer</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  // Afficher un message si aucun box
  if (boxesData.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.emptyContainer}>
          <IconSymbol name="tray.fill" size={48} color={colors.text + '60'} />
          <ThemedText style={styles.emptyText}>Aucun box disponible</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <AppBar
        rightAction={{
          icon: 'trophy.fill',
          label: '',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowGoldenRankingModal(true);
          },
        }}
      />
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 16 },
        ]}
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
      >
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
                />
              );
            })}
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
                <View style={[styles.boxIconContainer, { backgroundColor: PRIMARY_COLOR + '15' }]}>
                  <IconSymbol name="square.grid.2x2.fill" size={18} color={PRIMARY_COLOR} />
                </View>
                <ThemedText type="subtitle" style={styles.boxTitle}>
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
        />
      )}
      
      {/* Modal Golden Ranking */}
      <GoldenRankingModal
        visible={showGoldenRankingModal}
        onClose={() => setShowGoldenRankingModal(false)}
      />
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
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
    paddingVertical: 10,
    paddingHorizontal: 20,
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
    gap: 12,
    flex: 1,
  },
  boxIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxTitle: {
    fontSize: 16,
    fontWeight: '700',
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
});

