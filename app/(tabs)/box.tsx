import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BoxTable } from '@/components/box-table';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/services/api';
import type { MatchDTO } from '@/types/api';

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

  // Charger les données depuis l'API
  const loadBoxesData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('Chargement des matchs depuis l\'API...');
      // D'abord récupérer les saisons pour obtenir la saison en cours
      const allSeasons = await api.getSeasons();

      // Trouver la saison en cours (status = 'running' ou autre critère)
      const currentSeason = allSeasons.find((s) => s.status === 'running') || allSeasons[0];
      
      if (!currentSeason) {
        setError('Aucune saison trouvée');
        setIsLoading(false);
        return;
      }

      // Récupérer les matchs, les joueurs et les boxes de la saison en cours
      const [seasonMatches, allPlayers, allBoxes] = await Promise.all([
        api.getMatches(currentSeason.id),
        api.getPlayers(),
        api.getBoxes(currentSeason.id),
      ]);

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
        const boxPlayers: Player[] = allPlayers
          .filter((p) => playerIds.has(p.id))
          .map((p) => ({
            id: p.id,
            firstName: p.first_name,
            lastName: p.last_name,
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

  // Charger les données au démarrage
  useEffect(() => {
    loadBoxesData();
  }, [loadBoxesData]);

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
      await loadBoxesData();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Erreur lors du rafraîchissement:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setRefreshing(false);
    }
  }, [loadBoxesData]);

  // Afficher le chargement initial
  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PRIMARY_COLOR} />
          <ThemedText style={styles.loadingText}>Chargement des boxes...</ThemedText>
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
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(insets.top, 16) },
        ]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={PRIMARY_COLOR}
            colors={[PRIMARY_COLOR]}
            progressViewOffset={Math.max(insets.top, 16)}
            progressBackgroundColor={colorScheme === 'dark' ? '#1a1a1a' : '#ffffff'}
          />
        }
      >
        {boxesData.map((box, index) => (
          <View
            key={box.id}
            style={[
              styles.boxContainer,
              { backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#ffffff' },
            ]}
            onLayout={(event) => {
              const { y, height } = event.nativeEvent.layout;
              handleBoxLayout(index, y, height);
            }}
          >
            <View
              style={[
                styles.boxTitleContainer,
                { backgroundColor: colorScheme === 'dark' ? '#2a2a2a' : '#f0f0f0' },
              ]}
            >
              <ThemedText type="subtitle" style={styles.boxTitle}>
                {box.name}
              </ThemedText>
              <TouchableOpacity
                onPress={() => toggleFavorite(box.id)}
                style={styles.starButton}
                activeOpacity={0.7}
              >
                <IconSymbol
                  name={favorites.has(box.id) ? 'star.fill' : 'star'}
                  size={24}
                  color={favorites.has(box.id) ? '#fbbf24' : colors.icon}
                />
              </TouchableOpacity>
            </View>
            <BoxTable players={box.players} matches={box.matches} />
          </View>
        ))}
      </ScrollView>
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
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
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
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
  },
  boxTitleContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  boxTitle: {
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  starButton: {
    padding: 4,
    marginLeft: 8,
  },
});

