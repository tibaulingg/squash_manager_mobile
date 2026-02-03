import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBar } from '@/components/app-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/services/api';
import type { MatchDTO, PlayerDTO } from '@/types/api';

interface ScoreEvent {
  id: string;
  timestamp: Date;
  player: 'A' | 'B';
  scoreA: number;
  scoreB: number;
  service: 'R' | 'L';
  whoWasServing: 'A' | 'B';
}

interface GameState {
  scoreA: number;
  scoreB: number;
  gamesA: number;
  gamesB: number;
  scoreHistory: ScoreEvent[];
  wasGameWon: boolean;
  gameWinner?: 'A' | 'B';
  currentService: 'A' | 'B' | null;
  servicePosition: 'R' | 'L';
}

export default function RefereeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const router = useRouter();
  const matchId = params.matchId as string;

  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<MatchDTO | null>(null);
  const [playerA, setPlayerA] = useState<PlayerDTO | null>(null);
  const [playerB, setPlayerB] = useState<PlayerDTO | null>(null);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [gamesA, setGamesA] = useState(0);
  const [gamesB, setGamesB] = useState(0);
  const [scoreHistory, setScoreHistory] = useState<ScoreEvent[]>([]);
  const [historyStack, setHistoryStack] = useState<GameState[]>([]);
  const [currentService, setCurrentService] = useState<'A' | 'B' | null>(null);
  const [servicePosition, setServicePosition] = useState<'R' | 'L'>('R');
  const [showMatchSummary, setShowMatchSummary] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [completedGames, setCompletedGames] = useState<Array<{ scoreA: number; scoreB: number }>>([]);
  const timelineScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const loadMatchData = async () => {
      if (!matchId) {
        setLoading(false);
        return;
      }

      try {
        // Charger tous les matchs en live pour trouver celui qui correspond
        const liveMatches = await api.getLiveMatches();
        let foundMatch = liveMatches.find((m) => m.id === matchId);
        
        if (!foundMatch) {
          // Si pas trouvé dans les matchs en live, chercher dans tous les matchs
          const allMatches = await api.getMatches();
          foundMatch = allMatches.find((m) => m.id === matchId);
        }

        if (foundMatch) {
          setMatch(foundMatch);
          
          // Restaurer les jeux gagnés depuis l'API
          const savedGamesA = foundMatch.score_a ?? 0;
          const savedGamesB = foundMatch.score_b ?? 0;
          setGamesA(savedGamesA);
          setGamesB(savedGamesB);

          // Parser le live_score pour restaurer l'état
          if (foundMatch.live_score && foundMatch.live_score.trim() !== '') {
            const parsedState = parseLiveScore(foundMatch.live_score, savedGamesA, savedGamesB);
            setCompletedGames(parsedState.completedGames);
            setScoreA(parsedState.currentScoreA);
            setScoreB(parsedState.currentScoreB);
            
            // Si on a un score en cours, on doit avoir un service actif
            if (parsedState.currentScoreA > 0 || parsedState.currentScoreB > 0) {
              // On ne peut pas déterminer qui sert depuis le live_score seul
              // On laisse currentService à null, l'utilisateur devra continuer
              setCurrentService(null);
              setServicePosition('R');
            } else {
              // Score 0-0, pas de service encore
              setCurrentService(null);
              setServicePosition('R');
            }
          } else {
            // Pas de live_score, vérifier si on a des jeux gagnés
            if (savedGamesA > 0 || savedGamesB > 0) {
              // On a des jeux gagnés mais pas de live_score, c'est étrange
              // On initialise quand même avec les jeux gagnés
              console.warn('Jeux gagnés sans live_score:', savedGamesA, savedGamesB);
              setCompletedGames([]);
              setScoreA(0);
              setScoreB(0);
            } else {
              // Pas de live_score et pas de jeux, initialiser à zéro
              setCompletedGames([]);
              setScoreA(0);
              setScoreB(0);
            }
            setCurrentService(null);
            setServicePosition('R');
          }

          // Charger les joueurs
          const players = await api.getPlayersCached();
          const playerA_data = players.find((p) => p.id === foundMatch!.player_a_id);
          const playerB_data = players.find((p) => p.id === foundMatch!.player_b_id);
          setPlayerA(playerA_data || null);
          setPlayerB(playerB_data || null);
        }
      } catch (error) {
        console.error('Erreur chargement match:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMatchData();
  }, [matchId]);

  // Vérifier si un joueur a gagné le jeu actuel
  const checkGameWin = (newScoreA: number, newScoreB: number): 'A' | 'B' | null => {
    // Premier à 11 avec 2 points d'écart
    if (newScoreA >= 11 && newScoreA - newScoreB >= 2) {
      return 'A';
    }
    if (newScoreB >= 11 && newScoreB - newScoreA >= 2) {
      return 'B';
    }
    // Si on dépasse 11, il faut 2 points d'écart pour gagner
    if (newScoreA > 11 && newScoreA - newScoreB >= 2) {
      return 'A';
    }
    if (newScoreB > 11 && newScoreB - newScoreA >= 2) {
      return 'B';
    }
    return null;
  };

  const handleServiceToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newServicePosition = servicePosition === 'R' ? 'L' : 'R';
    setServicePosition(newServicePosition);
    
    // Mettre à jour le dernier événement de la timeline si c'est le même joueur qui sert
    if (scoreHistory.length > 0 && currentService) {
      const lastEvent = scoreHistory[scoreHistory.length - 1];
      if (lastEvent.whoWasServing === currentService) {
        // Mettre à jour le dernier événement avec le nouveau service
        const updatedHistory = [...scoreHistory];
        updatedHistory[updatedHistory.length - 1] = {
          ...lastEvent,
          service: newServicePosition,
        };
        setScoreHistory(updatedHistory);
      }
    }
  };

  // Fonction pour parser le live_score et restaurer l'état
  const parseLiveScore = (liveScore: string, savedGamesA: number, savedGamesB: number): {
    completedGames: Array<{ scoreA: number; scoreB: number }>;
    currentScoreA: number;
    currentScoreB: number;
  } => {
    const parts = liveScore.split(';');
    const completedGames: Array<{ scoreA: number; scoreB: number }> = [];
    let currentScoreA = 0;
    let currentScoreB = 0;

    parts.forEach((part, index) => {
      const [scoreAStr, scoreBStr] = part.split('-');
      const scoreA = parseInt(scoreAStr, 10) || 0;
      const scoreB = parseInt(scoreBStr, 10) || 0;

      // Le dernier élément est le jeu en cours (sauf si le match est terminé)
      if (index === parts.length - 1 && savedGamesA < 3 && savedGamesB < 3) {
        currentScoreA = scoreA;
        currentScoreB = scoreB;
      } else {
        // Les autres sont des jeux terminés
        completedGames.push({ scoreA, scoreB });
      }
    });

    return { completedGames, currentScoreA, currentScoreB };
  };

  // Fonction pour générer le format live_score
  const generateLiveScore = (
    completedGames: Array<{ scoreA: number; scoreB: number }>, 
    currentScoreA: number, 
    currentScoreB: number,
    currentGamesA: number = gamesA,
    currentGamesB: number = gamesB
  ): string => {
    const parts: string[] = [];
    
    // Ajouter les jeux terminés
    completedGames.forEach(game => {
      parts.push(`${game.scoreA}-${game.scoreB}`);
    });
    
    // Ajouter le jeu en cours (si le match n'est pas terminé)
    if (currentGamesA < 3 && currentGamesB < 3) {
      parts.push(`${currentScoreA}-${currentScoreB}`);
    }
    
    return parts.join(';');
  };

  // Fonction pour mettre à jour le live_score dans l'API
  const updateLiveScore = async (liveScore: string) => {
    if (!match) return;
    
    try {
      const { API_BASE_URL } = require('@/constants/config');
      await fetch(`${API_BASE_URL}/Matches/${match.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...match,
          live_score: liveScore,
        }),
      });
    } catch (error) {
      console.error('Erreur mise à jour live_score:', error);
      // Ne pas bloquer l'utilisateur en cas d'erreur
    }
  };

  // Fonction pour mettre à jour les scores (jeux gagnés) dans l'API
  const updateMatchScores = async (newGamesA: number, newGamesB: number, liveScore?: string) => {
    if (!match) return;
    
    try {
      const { API_BASE_URL } = require('@/constants/config');
      const response = await fetch(`${API_BASE_URL}/Matches/${match.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...match,
          score_a: newGamesA,
          score_b: newGamesB,
          live_score: liveScore || match.live_score || '',
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Erreur mise à jour scores:', response.status, errorText);
        throw new Error(`Erreur API: ${response.status}`);
      }
      
      // Mettre à jour l'objet match local avec les nouvelles valeurs
      setMatch({
        ...match,
        score_a: newGamesA,
        score_b: newGamesB,
        live_score: liveScore || match.live_score || '',
      });
    } catch (error) {
      console.error('Erreur mise à jour scores:', error);
      // Ne pas bloquer l'utilisateur en cas d'erreur
    }
  };

  const handleScoreIncrement = async (player: 'A' | 'B') => {
    // Ne pas permettre d'incrémenter si le match est terminé
    if (gamesA >= 3 || gamesB >= 3) {
      return;
    }
    // Si c'est le premier point, déterminer qui sert et afficher 0-0 avec le service
    if (currentService === null && scoreHistory.length === 0) {
      setCurrentService(player);
      
      // Sauvegarder l'état avant le choix du service
      const currentState: GameState = {
        scoreA: 0,
        scoreB: 0,
        gamesA,
        gamesB,
        scoreHistory: [],
        wasGameWon: false,
        currentService: null,
        servicePosition: 'R',
      };
      setHistoryStack((prev) => [...prev, currentState]);
      
      // Ajouter un événement 0-0 avec le service
      const serviceEvent: ScoreEvent = {
        id: Date.now().toString(),
        timestamp: new Date(),
        player,
        scoreA: 0,
        scoreB: 0,
        service: servicePosition,
        whoWasServing: player,
      };
      
      setScoreHistory([serviceEvent]);
      
      // Mettre à jour le live_score avec le score 0-0
      const liveScore = generateLiveScore(completedGames, 0, 0, gamesA, gamesB);
      updateLiveScore(liveScore);
      
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    }

    // Si on doit choisir le service, ne pas incrémenter
    if (currentService === null) {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Sauvegarder l'état actuel dans l'historique pour undo
    const currentState: GameState = {
      scoreA,
      scoreB,
      gamesA,
      gamesB,
      scoreHistory: [...scoreHistory],
      wasGameWon: false,
      currentService,
      servicePosition,
    };
    setHistoryStack((prev) => [...prev, currentState]);
    
    const newScoreA = player === 'A' ? scoreA + 1 : scoreA;
    const newScoreB = player === 'B' ? scoreB + 1 : scoreB;

    // Vérifier si un joueur a gagné le jeu
    const gameWinner = checkGameWin(newScoreA, newScoreB);

    // Déterminer le service à enregistrer dans l'événement
    // Si le joueur qui sert gagne, on alterne R/L pour le prochain service
    // Si le joueur qui ne sert pas gagne, il reprend le service à R
    let serviceForEvent: 'R' | 'L';
    if (player === currentService) {
      // Le joueur qui servait a gagné, on alterne pour le prochain service
      serviceForEvent = servicePosition === 'R' ? 'L' : 'R';
    } else {
      // Le joueur qui ne servait pas a gagné, il reprend le service à R
      serviceForEvent = 'R';
    }

    // Ajouter à l'historique avec les nouveaux scores et le service
    const newEvent: ScoreEvent = {
      id: Date.now().toString(),
      timestamp: new Date(),
      player,
      scoreA: newScoreA,
      scoreB: newScoreB,
      service: serviceForEvent,
      whoWasServing: player === currentService ? currentService : player, // Qui servira au prochain point
    };

    const updatedHistory = [...scoreHistory, newEvent];
    setScoreHistory(updatedHistory);
    
    // Scroller vers le bas après un court délai
    setTimeout(() => {
      timelineScrollRef.current?.scrollToEnd({ animated: true });
    }, 100);

    if (gameWinner) {
      // Un joueur a gagné le jeu
      const newGamesA = gameWinner === 'A' ? gamesA + 1 : gamesA;
      const newGamesB = gameWinner === 'B' ? gamesB + 1 : gamesB;
      
      // Ajouter le jeu terminé à la liste
      const newCompletedGames = [...completedGames, { scoreA: newScoreA, scoreB: newScoreB }];
      setCompletedGames(newCompletedGames);
      
      // Sauvegarder l'état avant la réinitialisation (avec le jeu gagné)
      const gameWonState: GameState = {
        scoreA: newScoreA,
        scoreB: newScoreB,
        gamesA: newGamesA,
        gamesB: newGamesB,
        scoreHistory: updatedHistory,
        wasGameWon: true,
        gameWinner,
        currentService,
        servicePosition: serviceForEvent,
      };
      setHistoryStack((prev) => [...prev, gameWonState]);
      
      setGamesA(newGamesA);
      setGamesB(newGamesB);
      
      // Réinitialiser les scores pour le prochain jeu
      setScoreA(0);
      setScoreB(0);
      
      // Vider la timeline pour le nouveau jeu
      setScoreHistory([]);
      
      // Réinitialiser le service pour le nouveau jeu
      setCurrentService(null);
      setServicePosition('R');
      
      // Mettre à jour le live_score (jeu terminé, pas de jeu en cours)
      const liveScore = generateLiveScore(newCompletedGames, 0, 0, newGamesA, newGamesB);
      
      // Mettre à jour les scores (jeux gagnés) et le live_score dans l'API
      // Utiliser await pour s'assurer que la mise à jour est bien effectuée
      await updateMatchScores(newGamesA, newGamesB, liveScore);
      
      // Vérifier si le match est terminé (3 jeux gagnants)
      if (newGamesA >= 3 || newGamesB >= 3) {
        // Match terminé - afficher le récapitulatif
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowMatchSummary(true);
      } else {
        // Nouveau jeu commencé
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } else {
      // Le jeu continue
      setScoreA(newScoreA);
      setScoreB(newScoreB);
      
      // Mettre à jour le live_score avec le score actuel
      const liveScore = generateLiveScore(completedGames, newScoreA, newScoreB, gamesA, gamesB);
      updateLiveScore(liveScore);
      
      // En squash : si le joueur qui sert gagne, il continue à servir et alterne R/L
      // Si le joueur qui ne sert pas gagne, il reprend le service
      if (player === currentService) {
        // Le joueur qui avait le service a marqué, il continue à servir et alterne R/L
        setServicePosition(serviceForEvent); // Utiliser le service alterné
        // currentService reste le même
      } else {
        // Le joueur qui n'avait pas le service a marqué, il reprend le service
        setCurrentService(player);
        setServicePosition(serviceForEvent); // Utiliser R
      }
    }
  };

  const handleUndo = () => {
    if (historyStack.length === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Récupérer le dernier état sauvegardé
    const previousState = historyStack[historyStack.length - 1];
    
    // Si un jeu a été gagné dans l'état précédent, retirer le dernier jeu terminé
    if (previousState.wasGameWon) {
      setCompletedGames((prev) => prev.slice(0, -1));
    }
    
    // Restaurer l'état
    setScoreA(previousState.scoreA);
    setScoreB(previousState.scoreB);
    setGamesA(previousState.gamesA);
    setGamesB(previousState.gamesB);
    setScoreHistory(previousState.scoreHistory);
    setCurrentService(previousState.currentService);
    setServicePosition(previousState.servicePosition);
    
    // Retirer le dernier état de la pile
    setHistoryStack((prev) => prev.slice(0, -1));
    
    // Mettre à jour le live_score après l'undo
    const currentCompletedGames = previousState.wasGameWon 
      ? completedGames.slice(0, -1) 
      : completedGames;
    const liveScore = generateLiveScore(currentCompletedGames, previousState.scoreA, previousState.scoreB, previousState.gamesA, previousState.gamesB);
    updateLiveScore(liveScore);
    
    // Scroller vers le bas si nécessaire
    setTimeout(() => {
      timelineScrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleValidateScore = async () => {
    if (!match) return;
    
    setIsValidating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      // Calculer le score final (nombre de jeux gagnés)
      const finalScoreA = gamesA;
      const finalScoreB = gamesB;
      
      // Mettre à jour le match via l'API
      const { API_BASE_URL } = require('@/constants/config');
      const response = await fetch(`${API_BASE_URL}/Matches/${match.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...match,
          score_a: finalScoreA,
          score_b: finalScoreB,
          played_at: new Date().toISOString(),
          running: false,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Erreur lors de la validation du score');
      }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowMatchSummary(false);
      
      // Retourner à l'écran précédent après un court délai
      setTimeout(() => {
        router.back();
      }, 500);
    } catch (error) {
      console.error('Erreur validation score:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsValidating(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <AppBar 
          leftIcon={{
            icon: 'chevron.left',
            onPress: handleBack,
          }}
        />
        <View style={[styles.loadingContainer, { paddingTop: insets.top  }]}>
          <ActivityIndicator size="large" color={PRIMARY_COLOR} />
        </View>
      </ThemedView>
    );
  }

  if (!match || !playerA || !playerB) {
    return (
      <ThemedView style={styles.container}>
        <AppBar 
          leftIcon={{
            icon: 'chevron.left',
            onPress: handleBack,
          }}
        />
        <View style={[styles.errorContainer, { paddingTop: insets.top + 20 }]}>
          <ThemedText style={[styles.errorText, { color: colors.text }]}>
            Match introuvable
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <AppBar 
        leftIcon={{
          icon: 'chevron.left',
          onPress: handleBack,
        }}
        rightAction={{
          icon: 'arrow.uturn.backward',
          onPress: handleUndo,
          label: historyStack.length > 0 ? undefined : undefined,
        }}
      />
      
      <View style={styles.content}>
        {/* Header avec noms des joueurs */}
        <View style={[styles.header, { borderBottomColor: colors.text + '15' }]}>
          <View style={styles.playerHeader}>
            <ThemedText style={[styles.playerName, { color: colors.text }]} numberOfLines={1}>
              {playerA.first_name} {playerA.last_name}
            </ThemedText>
            <View style={styles.gamesContainer}>
              {Array.from({ length: 3 }).map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.gameBadge,
                    {
                      backgroundColor: index < gamesA ? PRIMARY_COLOR + '20' : 'transparent',
                      borderColor: index < gamesA ? PRIMARY_COLOR : colors.text + '20',
                    },
                  ]}
                >
                  {index < gamesA && (
                    <ThemedText style={[styles.gameBadgeText, { color: PRIMARY_COLOR }]}>
                      ✓
                    </ThemedText>
                  )}
                </View>
              ))}
            </View>
          </View>
          
          <View style={styles.playerHeader}>
            <ThemedText style={[styles.playerName, { color: colors.text }]} numberOfLines={1}>
              {playerB.first_name} {playerB.last_name}
            </ThemedText>
            <View style={styles.gamesContainer}>
              {Array.from({ length: 3 }).map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.gameBadge,
                    {
                      backgroundColor: index < gamesB ? '#ef4444' + '20' : 'transparent',
                      borderColor: index < gamesB ? '#ef4444' : colors.text + '20',
                    },
                  ]}
                >
                  {index < gamesB && (
                    <ThemedText style={[styles.gameBadgeText, { color: '#ef4444' }]}>
                      ✓
                    </ThemedText>
                  )}
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Zone principale avec scores et zones cliquables */}
        <View style={styles.mainArea}>
          {/* Zone gauche - Joueur A */}
          <TouchableOpacity
            style={[styles.scoreZone, { backgroundColor: colors.background }]}
            onPress={() => handleScoreIncrement('A')}
            activeOpacity={0.7}
          >
            <View style={styles.scoreDisplay}>
              <ThemedText style={[styles.score, { color: PRIMARY_COLOR }]}>
                {scoreA}
              </ThemedText>
            </View>
            {/* Indicateur de service */}
            {currentService === 'A' && (
              <TouchableOpacity
                style={[styles.serviceIndicator, styles.serviceIndicatorLeft, { 
                  backgroundColor: PRIMARY_COLOR + '20',
                  borderColor: PRIMARY_COLOR + '40',
                }]}
                onPress={handleServiceToggle}
                activeOpacity={0.7}
              >
                <ThemedText style={[styles.serviceText, { color: PRIMARY_COLOR }]}>
                  {servicePosition}
                </ThemedText>
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          {/* Timeline verticale au centre */}
          <View style={styles.timelineContainer}>
            {/* Ligne continue verticale au centre */}
            <View style={[styles.timelineCenterLine, { backgroundColor: colors.text + '20' }]} />
            
            <ScrollView 
              ref={timelineScrollRef}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.timelineContent}
            >
              {scoreHistory.map((event) => (
                <View key={event.id} style={styles.timelineItem}>
                  <View style={styles.timelineScoresRow}>
                    {/* Colonne gauche - Joueur A */}
                    <View style={styles.timelineScoreColumn}>
                      <View style={styles.timelineScoreContainerLeft}>
                        {event.whoWasServing === 'A' ? (
                          <ThemedText 
                            style={[
                              styles.timelineService, 
                              { 
                                color: PRIMARY_COLOR,
                                width: 16,
                              }
                            ]}
                          >
                            {event.service}
                          </ThemedText>
                        ) : (
                          <View style={{ width: 16 }} />
                        )}
                        <ThemedText 
                          style={[
                            styles.timelineScore, 
                            { 
                              color: event.player === 'A' ? PRIMARY_COLOR : colors.text + '60',
                              fontWeight: event.player === 'A' ? '700' : '500',
                              width: 20,
                              textAlign: 'right',
                            }
                          ]}
                        >
                          {event.scoreA}
                        </ThemedText>
                      </View>
                    </View>
                    
                    {/* Colonne droite - Joueur B */}
                    <View style={styles.timelineScoreColumn}>
                      <View style={styles.timelineScoreContainerRight}>
                        <ThemedText 
                          style={[
                            styles.timelineScore, 
                            { 
                              color: event.player === 'B' ? '#ef4444' : colors.text + '60',
                              fontWeight: event.player === 'B' ? '700' : '500',
                              width: 20,
                              textAlign: 'left',
                            }
                          ]}
                        >
                          {event.scoreB}
                        </ThemedText>
                        {event.whoWasServing === 'B' ? (
                          <ThemedText 
                            style={[
                              styles.timelineService, 
                              { 
                                color: '#ef4444',
                                width: 16,
                              }
                            ]}
                          >
                            {event.service}
                          </ThemedText>
                        ) : (
                          <View style={{ width: 16 }} />
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Zone droite - Joueur B */}
          <TouchableOpacity
            style={[styles.scoreZone, { backgroundColor: colors.background }]}
            onPress={() => handleScoreIncrement('B')}
            activeOpacity={0.7}
          >
            <View style={styles.scoreDisplay}>
              <ThemedText style={[styles.score, { color: '#ef4444' }]}>
                {scoreB}
              </ThemedText>
            </View>
            {/* Indicateur de service */}
            {currentService === 'B' && (
              <TouchableOpacity
                style={[styles.serviceIndicator, styles.serviceIndicatorRight, { 
                  backgroundColor: '#ef4444' + '20',
                  borderColor: '#ef4444' + '40',
                }]}
                onPress={handleServiceToggle}
                activeOpacity={0.7}
              >
                <ThemedText style={[styles.serviceText, { color: '#ef4444' }]}>
                  {servicePosition}
                </ThemedText>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal de récapitulatif du match */}
      <Modal
        visible={showMatchSummary}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMatchSummary(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
            <ThemedText style={[styles.modalTitle, { color: colors.text }]}>
              Match terminé
            </ThemedText>
            
            <View style={styles.summaryContainer}>
              {/* Joueur A */}
              <View style={styles.summaryPlayer}>
                <ThemedText style={[styles.summaryPlayerName, { color: colors.text }]}>
                  {playerA?.first_name} {playerA?.last_name}
                </ThemedText>
                <View style={styles.summaryGamesRow}>
                  {Array.from({ length: 3 }).map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.summaryGameBadge,
                        {
                          backgroundColor: index < gamesA ? PRIMARY_COLOR + '20' : 'transparent',
                          borderColor: index < gamesA ? PRIMARY_COLOR : colors.text + '20',
                        },
                      ]}
                    >
                      {index < gamesA && (
                        <ThemedText style={[styles.summaryGameBadgeText, { color: PRIMARY_COLOR }]}>
                          ✓
                        </ThemedText>
                      )}
                    </View>
                  ))}
                </View>
                <ThemedText style={[styles.summaryScore, { color: PRIMARY_COLOR }]}>
                  {gamesA} jeux
                </ThemedText>
              </View>

              <ThemedText style={[styles.summaryVS, { color: colors.text + '60' }]}>
                VS
              </ThemedText>

              {/* Joueur B */}
              <View style={styles.summaryPlayer}>
                <ThemedText style={[styles.summaryPlayerName, { color: colors.text }]}>
                  {playerB?.first_name} {playerB?.last_name}
                </ThemedText>
                <View style={styles.summaryGamesRow}>
                  {Array.from({ length: 3 }).map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.summaryGameBadge,
                        {
                          backgroundColor: index < gamesB ? '#ef4444' + '20' : 'transparent',
                          borderColor: index < gamesB ? '#ef4444' : colors.text + '20',
                        },
                      ]}
                    >
                      {index < gamesB && (
                        <ThemedText style={[styles.summaryGameBadgeText, { color: '#ef4444' }]}>
                          ✓
                        </ThemedText>
                      )}
                    </View>
                  ))}
                </View>
                <ThemedText style={[styles.summaryScore, { color: '#ef4444' }]}>
                  {gamesB} jeux
                </ThemedText>
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel, { borderColor: colors.text + '30' }]}
                onPress={() => setShowMatchSummary(false)}
                activeOpacity={0.7}
              >
                <ThemedText style={[styles.modalButtonText, { color: colors.text + '70' }]}>
                  Annuler
                </ThemedText>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonValidate, { backgroundColor: PRIMARY_COLOR }]}
                onPress={handleValidateScore}
                activeOpacity={0.7}
                disabled={isValidating}
              >
                {isValidating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText style={styles.modalButtonTextValidate}>
                    Valider le score
                  </ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  playerHeader: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  playerName: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  gamesContainer: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'center',
    includeFontPadding: false,
  },
  timelineContainer: {
    width: 100,
    position: 'relative',
  },
  timelineCenterLine: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
  },
  timelineContent: {
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    minHeight: '100%',
  },
  timelineItem: {
    alignItems: 'center',
    width: '100%',
    marginVertical: 2,
  },
  timelineScoresRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 8,
  },
  timelineScoreColumn: {
    flex: 1,
    alignItems: 'center',
  },
  timelineScore: {
    fontSize: 16,
    fontWeight: '600',
    minWidth: 24,
    textAlign: 'center',
  },
  mainArea: {
    flex: 1,
    flexDirection: 'row',
  },
  scoreZone: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreDisplay: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  score: {
    fontSize: 72,
    fontWeight: '700',
    lineHeight: 84,
    textAlign: 'center',
  },
  serviceIndicator: {
    position: 'absolute',
    bottom: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  serviceIndicatorLeft: {
    left: 20,
  },
  serviceIndicatorRight: {
    right: 20,
  },
  serviceText: {
    fontSize: 20,
    fontWeight: '700',
  },
  timelineScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timelineScoreContainerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'flex-end',
    width: '100%',
    paddingRight: 4,
  },
  timelineScoreContainerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'flex-start',
    width: '100%',
    paddingLeft: 4,
  },
  timelineService: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  summaryContainer: {
    alignItems: 'center',
    gap: 16,
  },
  summaryPlayer: {
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  summaryPlayerName: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  summaryGamesRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryGameBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryGameBadgeText: {
    fontSize: 18,
    fontWeight: '700',
  },
  summaryScore: {
    fontSize: 20,
    fontWeight: '700',
  },
  summaryVS: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  modalButtonCancel: {
    backgroundColor: 'transparent',
  },
  modalButtonValidate: {
    borderWidth: 0,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonTextValidate: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
