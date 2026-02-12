import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBar } from '@/components/app-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
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
  completedGames: Array<{ scoreA: number; scoreB: number }>;
  wasGameWon: boolean;
  gameWinner?: 'A' | 'B';
  currentService: 'A' | 'B' | null;
  servicePosition: 'R' | 'L';
  fullscore: string;
}

export default function RefereeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const router = useRouter();
  const matchId = params.matchId as string;
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

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
  const [showAllSetsModal, setShowAllSetsModal] = useState(false);
  const [playerAColor, setPlayerAColor] = useState('#fbbf24'); // Jaune
  const [playerBColor, setPlayerBColor] = useState('#000000'); // Noir
  const [showColorPicker, setShowColorPicker] = useState<'A' | 'B' | null>(null);
  const [stateBeforeMatchEnd, setStateBeforeMatchEnd] = useState<GameState | null>(null);
  const [forceLandscape, setForceLandscape] = useState(false);
  const [fullscore, setFullscore] = useState<string>(''); // Historique complet des scores
  const timelineScrollRef = useRef<ScrollView>(null);

  // Palette de couleurs disponibles (25 couleurs organisées en 5x5)
  // Ordre logique : Rouge → Orange → Jaune → Vert → Cyan → Bleu → Violet → Rose → Gris → Noir
  const colorPalette = [
    // Ligne 1: Rouges et roses
    '#dc2626', // rouge foncé
    '#ef4444', // rouge
    '#f87171', // rouge clair
    '#ec4899', // rose
    '#f472b6', // rose clair
    // Ligne 2: Oranges
    '#ea580c', // orange foncé
    '#f97316', // orange
    '#fb923c', // orange clair
    '#f59e0b', // ambre
    '#fbbf24', // jaune ambre
    // Ligne 3: Jaunes et verts clairs
    '#eab308', // jaune
    '#facc15', // jaune clair
    '#84cc16', // lime
    '#65a30d', // vert lime foncé
    '#a3e635', // vert lime très clair
    // Ligne 4: Verts et cyan
    '#16a34a', // vert foncé
    '#10b981', // vert
    '#34d399', // vert clair
    '#06b6d4', // cyan
    '#0891b2', // cyan foncé
    // Ligne 5: Bleus, violets et neutres
    '#2563eb', // bleu foncé
    '#3b82f6', // bleu
    '#60a5fa', // bleu clair
    '#8b5cf6', // violet
    '#000000', // noir
  ];

  // Permettre toutes les orientations uniquement sur cet écran
  useEffect(() => {
    // Permettre toutes les orientations au montage
    ScreenOrientation.unlockAsync();
    
    // Restaurer le portrait au démontage
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  // Gérer le toggle du mode paysage
  useEffect(() => {
    if (forceLandscape) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }
  }, [forceLandscape]);

  const handleToggleLandscape = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setForceLandscape(!forceLandscape);
  };

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

          // Charger les joueurs
          const players = await api.getPlayersCached();
          const playerA_data = players.find((p) => p.id === foundMatch.player_a_id);
          const playerB_data = players.find((p) => p.id === foundMatch.player_b_id);
          setPlayerA(playerA_data || null);
          setPlayerB(playerB_data || null);

          // Restaurer les couleurs depuis le match
          if (foundMatch.player_a_color) {
            setPlayerAColor(foundMatch.player_a_color);
          }
          if (foundMatch.player_b_color) {
            setPlayerBColor(foundMatch.player_b_color);
          }
          
          // Restaurer le fullscore depuis le match
          if (foundMatch.fullscore) {
            setFullscore(foundMatch.fullscore);
          }

          // Restaurer le service depuis server_id si disponible
          let restoredService: 'A' | 'B' | null = null;
          if (foundMatch.server_id && playerA_data && playerB_data) {
            if (foundMatch.server_id === playerA_data.id) {
              restoredService = 'A';
            } else if (foundMatch.server_id === playerB_data.id) {
              restoredService = 'B';
            }
          }

          // Parser le live_score pour restaurer l'état
          let parsedState: { completedGames: Array<{ scoreA: number; scoreB: number }>; currentScoreA: number; currentScoreB: number } | null = null;
          
          if (foundMatch.live_score && foundMatch.live_score.trim() !== '') {
            parsedState = parseLiveScore(foundMatch.live_score, savedGamesA, savedGamesB);
            setCompletedGames(parsedState.completedGames);
            setScoreA(parsedState.currentScoreA);
            setScoreB(parsedState.currentScoreB);
            
            // Si on a un score en cours, restaurer le service depuis server_id
            if (parsedState.currentScoreA > 0 || parsedState.currentScoreB > 0) {
              setCurrentService(restoredService);
              setServicePosition('R');
            } else {
              // Score 0-0, pas de service encore (sauf si server_id est défini)
              setCurrentService(restoredService);
              setServicePosition('R');
            }
          } else {
            // Pas de live_score, vérifier si on a des jeux gagnés
            if (savedGamesA > 0 || savedGamesB > 0) {
              // On a des jeux gagnés mais pas de live_score, c'est étrange
              // On initialise quand même avec les jeux gagnés
              console.warn('Jeux gagnés sans live_score:', savedGamesA, savedGamesB);
              parsedState = {
                completedGames: [],
                currentScoreA: 0,
                currentScoreB: 0,
              };
              setCompletedGames([]);
              setScoreA(0);
              setScoreB(0);
            } else {
              // Pas de live_score et pas de jeux, initialiser à zéro
              parsedState = {
                completedGames: [],
                currentScoreA: 0,
                currentScoreB: 0,
              };
              setCompletedGames([]);
              setScoreA(0);
              setScoreB(0);
            }
            // Restaurer le service depuis server_id si disponible
            setCurrentService(restoredService);
            setServicePosition('R');
          }
          
          // Reconstruire l'historique UNIQUEMENT pour le set en cours depuis le fullscore
          if (foundMatch.fullscore && parsedState) {
            const sets = foundMatch.fullscore.split('|').filter(s => s && s.trim() !== '');
            // Le set en cours est celui à l'index correspondant au nombre de sets terminés
            const currentSetIndex = parsedState.completedGames.length;
            
            // Si on a un set à cet index, c'est le set en cours
            if (currentSetIndex < sets.length && sets[currentSetIndex]) {
              // Parser uniquement le set en cours
              const currentSetStr = sets[currentSetIndex];
              const currentSetHistory = parseFullscore(currentSetStr + '|');
              
              // Filtrer pour ne garder que les événements jusqu'au score actuel (inclus)
              const filteredHistory = currentSetHistory.filter(event => {
                // Si on a un score en cours, ne garder que jusqu'à ce score (inclus)
                if (parsedState.currentScoreA > 0 || parsedState.currentScoreB > 0) {
                  // Garder tous les événements jusqu'au score actuel
                  return event.scoreA <= parsedState.currentScoreA && event.scoreB <= parsedState.currentScoreB;
                }
                // Si score 0-0 mais qu'on a des événements, garder tout
                return true;
              });
              
              // Si le dernier événement ne correspond pas au score actuel, l'ajouter
              if (filteredHistory.length > 0) {
                const lastEvent = filteredHistory[filteredHistory.length - 1];
                if (lastEvent.scoreA !== parsedState.currentScoreA || lastEvent.scoreB !== parsedState.currentScoreB) {
                  // Le dernier événement ne correspond pas, on a déjà le bon historique
                  // Pas besoin d'ajouter, le filtrage devrait avoir tout gardé
                }
              }
              
              setScoreHistory(filteredHistory);
              
              // Reconstruire l'historyStack à partir de l'historique pour permettre le undo
              const reconstructedStack: GameState[] = [];
              let currentScoreA = 0;
              let currentScoreB = 0;
              let currentGamesA = savedGamesA;
              let currentGamesB = savedGamesB;
              const currentCompletedGames = parsedState.completedGames;
              
              filteredHistory.forEach((event, eventIndex) => {
                // Créer un état pour chaque événement (état AVANT cet événement)
                const stateBeforeEvent: GameState = {
                  scoreA: currentScoreA,
                  scoreB: currentScoreB,
                  gamesA: currentGamesA,
                  gamesB: currentGamesB,
                  scoreHistory: filteredHistory.slice(0, eventIndex),
                  completedGames: currentCompletedGames,
                  wasGameWon: false,
                  currentService: event.whoWasServing === 'A' ? 'A' : event.whoWasServing === 'B' ? 'B' : null,
                  servicePosition: eventIndex > 0 ? filteredHistory[eventIndex - 1]?.service || 'R' : 'R',
                  fullscore: foundMatch.fullscore || '',
                };
                reconstructedStack.push(stateBeforeEvent);
                
                // Mettre à jour les scores pour le prochain état
                currentScoreA = event.scoreA;
                currentScoreB = event.scoreB;
              });
              
              setHistoryStack(reconstructedStack);
              
              // Scroller vers le bas après un court délai
              setTimeout(() => {
                timelineScrollRef.current?.scrollToEnd({ animated: false });
              }, 100);
            } else {
              // Pas de set en cours dans le fullscore, initialiser l'historique vide
              setScoreHistory([]);
              setHistoryStack([]);
            }
          } else {
            // Pas de fullscore, initialiser l'historique vide
            setScoreHistory([]);
            setHistoryStack([]);
          }
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

  // Fonction pour parser le fullscore et reconstruire l'historique complet
  const parseFullscore = (fullscoreStr: string): ScoreEvent[] => {
    if (!fullscoreStr || fullscoreStr.trim() === '') {
      return [];
    }

    const history: ScoreEvent[] = [];
    const sets = fullscoreStr.split('|');
    let timestampOffset = 0;

    sets.forEach((set, setIndex) => {
      if (!set || set.trim() === '') return;
      
      const scores = set.split(';');
      let previousScoreA = 0;
      let previousScoreB = 0;
      let currentService: 'A' | 'B' | null = null;
      let servicePosition: 'R' | 'L' = 'R';

      scores.forEach((scoreStr, scoreIndex) => {
        const [scoreAStr, scoreBStr] = scoreStr.split('-');
        const scoreA = parseInt(scoreAStr, 10) || 0;
        const scoreB = parseInt(scoreBStr, 10) || 0;

        // Ignorer le 0-0 initial si ce n'est pas le premier point
        if (scoreA === 0 && scoreB === 0 && scoreIndex > 0) {
          return;
        }

        // Déterminer quel joueur a marqué
        let player: 'A' | 'B' | null = null;
        if (scoreA > previousScoreA) {
          player = 'A';
        } else if (scoreB > previousScoreB) {
          player = 'B';
        }

        // Si c'est le premier point du set, déterminer qui sert
        if (scoreIndex === 0 && (scoreA > 0 || scoreB > 0)) {
          currentService = player;
        }

        // Créer l'événement
        if (player) {
          const event: ScoreEvent = {
            id: `fullscore-${setIndex}-${scoreIndex}-${Date.now() + timestampOffset}`,
            timestamp: new Date(Date.now() + timestampOffset),
            player,
            scoreA,
            scoreB,
            service: servicePosition,
            whoWasServing: currentService || player,
          };
          history.push(event);
          timestampOffset += 1000; // 1 seconde entre chaque point

          // Mettre à jour le service pour le prochain point
          if (player === currentService) {
            // Le joueur qui servait a marqué, alterne R/L
            servicePosition = servicePosition === 'R' ? 'L' : 'R';
          } else {
            // Le joueur qui ne servait pas a marqué, reprend le service à R
            currentService = player;
            servicePosition = 'R';
          }
        }

        previousScoreA = scoreA;
        previousScoreB = scoreB;
      });
    });

    return history;
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

  // Fonction pour reconstruire le fullscore à partir des completedGames
  // Génère une séquence simple pour chaque set (0-0;0-1;...;scoreA-scoreB)
  const reconstructFullscore = (completedGames: Array<{ scoreA: number; scoreB: number }>, currentScoreA: number, currentScoreB: number): string => {
    const setParts: string[] = [];
    
    // Pour chaque set terminé, générer une séquence simple qui mène au score final
    completedGames.forEach(game => {
      const sequence: string[] = ['0-0'];
      let a = 0, b = 0;
      
      // Générer une séquence qui progresse vers le score final
      // On alterne entre A et B pour créer une séquence réaliste
      while (a < game.scoreA || b < game.scoreB) {
        // Prioriser le joueur qui a le score le plus bas pour équilibrer
        if (a < game.scoreA && (b >= game.scoreB || a <= b)) {
          a++;
          sequence.push(`${a}-${b}`);
        } else if (b < game.scoreB) {
          b++;
          sequence.push(`${a}-${b}`);
        }
      }
      
      setParts.push(sequence.join(';'));
    });
    
    // Ajouter le set en cours si nécessaire
    if (currentScoreA > 0 || currentScoreB > 0) {
      const currentSequence: string[] = ['0-0'];
      let a = 0, b = 0;
      while (a < currentScoreA || b < currentScoreB) {
        if (a < currentScoreA && (b >= currentScoreB || a <= b)) {
          a++;
          currentSequence.push(`${a}-${b}`);
        } else if (b < currentScoreB) {
          b++;
          currentSequence.push(`${a}-${b}`);
        }
      }
      setParts.push(currentSequence.join(';'));
    }
    
    return setParts.join('|');
  };

  // Fonction pour reconstruire le fullscore à partir de l'historique réel
  // Utilise scoreHistory pour le set en cours et completedGames pour les sets terminés
  const reconstructFullscoreFromHistory = (
    completedGames: Array<{ scoreA: number; scoreB: number }>,
    scoreHistory: ScoreEvent[],
    currentScoreA: number,
    currentScoreB: number
  ): string => {
    const setParts: string[] = [];
    
    // Pour chaque set terminé, générer une séquence simple qui mène au score final
    completedGames.forEach(game => {
      const sequence: string[] = ['0-0'];
      let a = 0, b = 0;
      
      // Générer une séquence qui progresse vers le score final
      while (a < game.scoreA || b < game.scoreB) {
        if (a < game.scoreA && (b >= game.scoreB || a <= b)) {
          a++;
          sequence.push(`${a}-${b}`);
        } else if (b < game.scoreB) {
          b++;
          sequence.push(`${a}-${b}`);
        }
      }
      
      setParts.push(sequence.join(';'));
    });
    
    // Pour le set en cours, utiliser l'historique réel si disponible
    if (scoreHistory.length > 0) {
      const currentSequence: string[] = [];
      scoreHistory.forEach(event => {
        currentSequence.push(`${event.scoreA}-${event.scoreB}`);
      });
      setParts.push(currentSequence.join(';'));
    } else if (currentScoreA > 0 || currentScoreB > 0) {
      // Si pas d'historique mais un score, générer une séquence simple
      const currentSequence: string[] = ['0-0'];
      let a = 0, b = 0;
      while (a < currentScoreA || b < currentScoreB) {
        if (a < currentScoreA && (b >= currentScoreB || a <= b)) {
          a++;
          currentSequence.push(`${a}-${b}`);
        } else if (b < currentScoreB) {
          b++;
          currentSequence.push(`${a}-${b}`);
        }
      }
      setParts.push(currentSequence.join(';'));
    }
    
    return setParts.join('|');
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
  const updateMatchScores = async (newGamesA: number, newGamesB: number, liveScore?: string, newFullscore?: string) => {
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
          fullscore: newFullscore !== undefined ? newFullscore : fullscore,
          player_a_color: playerAColor,
          player_b_color: playerBColor,
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
        fullscore: newFullscore !== undefined ? newFullscore : fullscore,
        player_a_color: playerAColor,
        player_b_color: playerBColor,
      });
    } catch (error) {
      console.error('Erreur mise à jour scores:', error);
      // Ne pas bloquer l'utilisateur en cas d'erreur
    }
  };

  // Fonction pour mettre à jour le server_id dans l'API
  const updateServerId = async (serverPlayer: 'A' | 'B' | null) => {
    if (!match || !playerA || !playerB) return;
    
    try {
      const serverId = serverPlayer === 'A' ? playerA.id : serverPlayer === 'B' ? playerB.id : null;
      
      const { API_BASE_URL } = require('@/constants/config');
      await fetch(`${API_BASE_URL}/Matches/${match.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...match,
          server_id: serverId,
          update_server: true
        }),
      });
    } catch (error) {
      console.error('Erreur mise à jour server_id:', error);
    }
  };

  // Fonction pour mettre à jour les couleurs des joueurs dans l'API
  const updatePlayerColors = async (newColorA: string, newColorB: string) => {
    if (!match) return;
    
    try {
      const { API_BASE_URL } = require('@/constants/config');
      const response = await fetch(`${API_BASE_URL}/Matches/${match.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...match,
          player_a_color: newColorA,
          player_b_color: newColorB,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Erreur mise à jour couleurs:', response.status, errorText);
        throw new Error(`Erreur API: ${response.status}`);
      }
      
      // Mettre à jour l'objet match local avec les nouvelles couleurs
      setMatch({
        ...match,
        player_a_color: newColorA,
        player_b_color: newColorB,
      });
    } catch (error) {
      console.error('Erreur mise à jour couleurs:', error);
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
      
      // Mettre à jour le server_id dans l'API
      updateServerId(player);
      
      // Sauvegarder l'état avant le choix du service
      const currentState: GameState = {
        scoreA: 0,
        scoreB: 0,
        gamesA,
        gamesB,
        scoreHistory: [],
        completedGames,
        wasGameWon: false,
        currentService: null,
        servicePosition: 'R',
        fullscore,
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
      
      // Si c'est le début d'un nouveau set, ajouter le séparateur dans le fullscore
      if (scoreA === 0 && scoreB === 0 && completedGames.length > 0) {
        const newFullscore = fullscore ? `${fullscore}|0-0` : '0-0';
        setFullscore(newFullscore);
        updateMatchScores(gamesA, gamesB, liveScore, newFullscore);
      }
      
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    }

    // Si on doit choisir le service, ne pas incrémenter
    if (currentService === null) {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Vérifier si on est à la fin d'un set terminé (revenu en arrière)
    // Si le dernier événement de l'historique correspond au score actuel et que c'est un score gagnant,
    // on doit permettre de passer au set suivant si on appuie sur le joueur qui a gagné
    if (scoreHistory.length > 0) {
      const lastEvent = scoreHistory[scoreHistory.length - 1];
      // Si le score actuel correspond au dernier événement de l'historique
      if (lastEvent.scoreA === scoreA && lastEvent.scoreB === scoreB) {
        // Vérifier si c'est un score gagnant (set terminé)
        const gameWinner = checkGameWin(scoreA, scoreB);
        if (gameWinner !== null) {
          // On est à la fin d'un set terminé
          // Si on appuie sur le joueur qui a gagné, passer au set suivant
          if (player === gameWinner) {
            // Ajouter le set aux completedGames
            const newCompletedGames = [...completedGames, { scoreA, scoreB }];
            
            // Calculer les nouveaux jeux gagnés
            const newGamesA = gameWinner === 'A' ? gamesA + 1 : gamesA;
            const newGamesB = gameWinner === 'B' ? gamesB + 1 : gamesB;
            
            // Sauvegarder l'état avant la transition
            const transitionState: GameState = {
              scoreA,
              scoreB,
              gamesA,
              gamesB,
              scoreHistory: [...scoreHistory],
              completedGames: [...completedGames],
              wasGameWon: true,
              gameWinner,
              currentService,
              servicePosition,
              fullscore,
            };
            setHistoryStack((prev) => [...prev, transitionState]);
            
            // Ajouter un séparateur de set dans le fullscore
            const fullscoreWithSetSeparator = fullscore ? `${fullscore}|` : `${scoreA}-${scoreB}|`;
            setFullscore(fullscoreWithSetSeparator);
            
            // Mettre à jour les états
            setCompletedGames(newCompletedGames);
            setGamesA(newGamesA);
            setGamesB(newGamesB);
            
            // Réinitialiser pour le nouveau set
            setScoreA(0);
            setScoreB(0);
            setScoreHistory([]);
            setCurrentService(null);
            setServicePosition('R');
            
            // Mettre à jour le live_score
            const liveScore = generateLiveScore(newCompletedGames, 0, 0, newGamesA, newGamesB);
            updateLiveScore(liveScore);
            
            // Mettre à jour l'API
            updateMatchScores(newGamesA, newGamesB, liveScore, fullscoreWithSetSeparator);
            
            // Vérifier si le match est terminé
            if (newGamesA >= 3 || newGamesB >= 3) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setShowMatchSummary(true);
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            
            return;
          } else {
            // On appuie sur le joueur qui n'a pas gagné, ne pas permettre l'incrémentation
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            return;
          }
        }
      }
    }
    
    // Sauvegarder l'état actuel dans l'historique pour undo
    const currentState: GameState = {
      scoreA,
      scoreB,
      gamesA,
      gamesB,
      scoreHistory: [...scoreHistory],
      completedGames: [...completedGames],
      wasGameWon: false,
      currentService,
      servicePosition,
      fullscore,
    };
    setHistoryStack((prev) => [...prev, currentState]);
    
    const newScoreA = player === 'A' ? scoreA + 1 : scoreA;
    const newScoreB = player === 'B' ? scoreB + 1 : scoreB;

    // Ajouter le score au fullscore
    const scoreEntry = `${newScoreA}-${newScoreB}`;
    const updatedFullscore = fullscore ? `${fullscore};${scoreEntry}` : scoreEntry;
    setFullscore(updatedFullscore);

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
      
      // Ajouter un séparateur de set dans le fullscore (| pour séparer les sets)
      const fullscoreWithSetSeparator = updatedFullscore + '|';
      setFullscore(fullscoreWithSetSeparator);
      
      // Sauvegarder l'état avant la réinitialisation (avec le jeu gagné)
      const gameWonState: GameState = {
        scoreA: newScoreA,
        scoreB: newScoreB,
        gamesA: newGamesA,
        gamesB: newGamesB,
        scoreHistory: updatedHistory,
        completedGames: newCompletedGames,
        wasGameWon: true,
        gameWinner,
        currentService,
        servicePosition: serviceForEvent,
        fullscore: fullscoreWithSetSeparator,
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
      
      // Vérifier si le match est terminé (3 jeux gagnants)
      if (newGamesA >= 3 || newGamesB >= 3) {
        // Sauvegarder l'état avant la fin du match pour pouvoir le restaurer si on annule
        const stateBeforeEnd: GameState = {
          scoreA: newScoreA,
          scoreB: newScoreB,
          gamesA: newGamesA,
          gamesB: newGamesB,
          scoreHistory: updatedHistory,
          completedGames: newCompletedGames,
          wasGameWon: true,
          gameWinner,
          currentService,
          servicePosition: serviceForEvent,
          fullscore: fullscoreWithSetSeparator,
        };
        setStateBeforeMatchEnd(stateBeforeEnd);
        
        // Mettre à jour les scores (jeux gagnés), le live_score et le fullscore dans l'API
        await updateMatchScores(newGamesA, newGamesB, liveScore, fullscoreWithSetSeparator);
        
        // Match terminé - afficher le récapitulatif
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowMatchSummary(true);
      } else {
        // Mettre à jour les scores (jeux gagnés), le live_score et le fullscore dans l'API
        await updateMatchScores(newGamesA, newGamesB, liveScore, fullscoreWithSetSeparator);
        
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
      
      // Mettre à jour le fullscore dans l'API (sans attendre)
      updateMatchScores(gamesA, gamesB, liveScore, updatedFullscore);
      
      // En squash : si le joueur qui sert gagne, il continue à servir et alterne R/L
      // Si le joueur qui ne sert pas gagne, il reprend le service
      if (player === currentService) {
        // Le joueur qui avait le service a marqué, il continue à servir et alterne R/L
        setServicePosition(serviceForEvent); // Utiliser le service alterné
        // currentService reste le même, pas besoin de mettre à jour server_id
      } else {
        // Le joueur qui n'avait pas le service a marqué, il reprend le service
        setCurrentService(player);
        setServicePosition(serviceForEvent); // Utiliser R
        // Mettre à jour le server_id dans l'API
        updateServerId(player);
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
    
    // Vérifier si après l'undo on serait à 0-0 dans un nouveau set
    // Si c'est le cas et qu'il y a des sets terminés, on doit revenir au set précédent
    if (previousState.scoreA === 0 && previousState.scoreB === 0 && previousState.completedGames.length > 0 && previousState.scoreHistory.length === 0) {
      // On est à 0-0 dans un nouveau set vide, on doit revenir au set précédent
      const previousSet = previousState.completedGames[previousState.completedGames.length - 1];
      const newCompletedGames = previousState.completedGames.slice(0, -1);
      
      // Mettre à jour les jeux gagnés
      let newGamesA = 0;
      let newGamesB = 0;
      newCompletedGames.forEach(g => {
        if (g.scoreA > g.scoreB) {
          newGamesA++;
        } else if (g.scoreB > g.scoreA) {
          newGamesB++;
        }
      });
      
      // Restaurer l'état avec le score final du set précédent
      setScoreA(previousSet.scoreA);
      setScoreB(previousSet.scoreB);
      setGamesA(newGamesA);
      setGamesB(newGamesB);
      setCompletedGames(newCompletedGames);
      setCurrentService(previousState.currentService);
      setServicePosition(previousState.servicePosition);
      
      // Reconstruire l'historique du set précédent depuis le fullscore
      if (previousState.fullscore) {
        const sets = previousState.fullscore.split('|').filter(s => s && s.trim() !== '');
        // L'index du set précédent est le nombre de sets terminés AVANT l'undo (celui qu'on vient de retirer)
        const previousSetIndex = previousState.completedGames.length - 1;
        if (previousSetIndex >= 0 && previousSetIndex < sets.length && sets[previousSetIndex]) {
          // Parser le set précédent
          const previousSetStr = sets[previousSetIndex];
          const previousSetHistory = parseFullscore(previousSetStr + '|');
          setScoreHistory(previousSetHistory);
          
          // Reconstruire l'historyStack pour le set précédent
          const reconstructedStack: GameState[] = [];
          let currentScoreA = 0;
          let currentScoreB = 0;
          
          previousSetHistory.forEach((event, eventIndex) => {
            const stateBeforeEvent: GameState = {
              scoreA: currentScoreA,
              scoreB: currentScoreB,
              gamesA: newGamesA,
              gamesB: newGamesB,
              scoreHistory: previousSetHistory.slice(0, eventIndex),
              completedGames: newCompletedGames,
              wasGameWon: false,
              currentService: event.whoWasServing === 'A' ? 'A' : event.whoWasServing === 'B' ? 'B' : null,
              servicePosition: eventIndex > 0 ? previousSetHistory[eventIndex - 1]?.service || 'R' : 'R',
              fullscore: previousState.fullscore || '',
            };
            reconstructedStack.push(stateBeforeEvent);
            
            currentScoreA = event.scoreA;
            currentScoreB = event.scoreB;
          });
          
          setHistoryStack(reconstructedStack);
          
          // Reconstruire le fullscore à partir de l'historique réel
          const updatedFullscore = reconstructFullscoreFromHistory(
            newCompletedGames,
            previousSetHistory,
            previousSet.scoreA,
            previousSet.scoreB
          );
          setFullscore(updatedFullscore);
          
          // Mettre à jour le live_score
          const liveScore = generateLiveScore(newCompletedGames, previousSet.scoreA, previousSet.scoreB, newGamesA, newGamesB);
          updateLiveScore(liveScore);
          
          // Mettre à jour l'API
          updateMatchScores(newGamesA, newGamesB, liveScore, updatedFullscore);
          
          // Scroller vers le bas après un court délai pour afficher l'historique
          setTimeout(() => {
            timelineScrollRef.current?.scrollToEnd({ animated: true });
          }, 200);
        } else {
          // Pas de set précédent dans le fullscore, initialiser vide
          setScoreHistory([]);
          setHistoryStack([]);
          
          // Reconstruire le fullscore à partir des sets terminés uniquement
          const updatedFullscore = reconstructFullscore(newCompletedGames, previousSet.scoreA, previousSet.scoreB);
          setFullscore(updatedFullscore);
          
          // Mettre à jour le live_score
          const liveScore = generateLiveScore(newCompletedGames, previousSet.scoreA, previousSet.scoreB, newGamesA, newGamesB);
          updateLiveScore(liveScore);
          
          // Mettre à jour l'API
          updateMatchScores(newGamesA, newGamesB, liveScore, updatedFullscore);
        }
      } else {
        // Pas de fullscore, juste restaurer l'état
        setScoreHistory([]);
        setHistoryStack([]);
        
        // Reconstruire le fullscore à partir des sets terminés uniquement
        const updatedFullscore = reconstructFullscore(newCompletedGames, previousSet.scoreA, previousSet.scoreB);
        setFullscore(updatedFullscore);
        
        // Mettre à jour le live_score
        const liveScore = generateLiveScore(newCompletedGames, previousSet.scoreA, previousSet.scoreB, newGamesA, newGamesB);
        updateLiveScore(liveScore);
        
        // Mettre à jour l'API
        updateMatchScores(newGamesA, newGamesB, liveScore, updatedFullscore);
      }
    } else {
      // Comportement normal de l'undo
      setScoreA(previousState.scoreA);
      setScoreB(previousState.scoreB);
      setGamesA(previousState.gamesA);
      setGamesB(previousState.gamesB);
      setScoreHistory(previousState.scoreHistory);
      setCompletedGames(previousState.completedGames);
      setCurrentService(previousState.currentService);
      setServicePosition(previousState.servicePosition);
      
      // Reconstruire le fullscore à partir de l'historique réel
      const reconstructedFullscore = reconstructFullscoreFromHistory(
        previousState.completedGames,
        previousState.scoreHistory,
        previousState.scoreA,
        previousState.scoreB
      );
      setFullscore(reconstructedFullscore);
      
      // Retirer le dernier état de la pile
      setHistoryStack((prev) => prev.slice(0, -1));
      
      // Mettre à jour le live_score après l'undo
      const liveScore = generateLiveScore(previousState.completedGames, previousState.scoreA, previousState.scoreB, previousState.gamesA, previousState.gamesB);
      updateLiveScore(liveScore);
      
      // Mettre à jour le fullscore dans l'API après l'undo
      updateMatchScores(previousState.gamesA, previousState.gamesB, liveScore, reconstructedFullscore);
    }
    
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
        }),
      });
      
      if (!response.ok) {
        throw new Error('Erreur lors de la validation du score');
      }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowMatchSummary(false);
      setStateBeforeMatchEnd(null);
      
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

  // Mode paysage - affichage simplifié du score
  if (isLandscape) {
    const scoreFontSize = Math.min(width * 0.25, 260);
    const nameFontSize = Math.min(width * 0.035, 36);
    const toolbarHeight = 56;
    const actualHeight = height - insets.top - insets.bottom - toolbarHeight;
    
    return (
      <View style={[styles.landscapeContainer, { 
        backgroundColor: colors.background, 
        width, 
        height,
        top: -insets.top,
        paddingTop: insets.top,
      }]}>
        {/* Barre d'outils en mode paysage */}
        <View style={[styles.landscapeToolbar, { 
          paddingTop: insets.top,
          borderBottomColor: colors.text + '10',
          backgroundColor: colors.background,
        }]}>
          <View style={styles.landscapeToolbarContent}>
            {/* Sets Joueur A */}
            <View style={styles.landscapeSetsContainer}>
              {Array.from({ length: 3 }).map((_, index) => (
                <View
                  key={`set-a-${index}`}
                  style={[
                    styles.landscapeSetBadge,
                    {
                      backgroundColor: index < gamesA ? playerAColor + '20' : 'transparent',
                      borderColor: index < gamesA ? playerAColor : colors.text + '20',
                    },
                  ]}
                >
                  {index < gamesA && (
                    <View style={[styles.landscapeSetDot, { backgroundColor: playerAColor }]} />
                  )}
                </View>
              ))}
            </View>

            {/* Boutons d'action */}
            <View style={styles.landscapeToolbarActions}>
              <TouchableOpacity
                onPress={handleUndo}
                activeOpacity={0.6}
                style={[styles.landscapeToolbarButton, { 
                  backgroundColor: colors.text + '08',
                  borderColor: colors.text + '15',
                }]}
              >
                <IconSymbol name="arrow.uturn.backward" size={20} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleToggleLandscape}
                activeOpacity={0.6}
                style={[styles.landscapeToolbarButton, { 
                  backgroundColor: colors.text + '08',
                  borderColor: colors.text + '15',
                }]}
              >
                <IconSymbol name="arrow.triangle.2.circlepath" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Sets Joueur B */}
            <View style={styles.landscapeSetsContainer}>
              {Array.from({ length: 3 }).map((_, index) => (
                <View
                  key={`set-b-${index}`}
                  style={[
                    styles.landscapeSetBadge,
                    {
                      backgroundColor: index < gamesB ? playerBColor + '20' : 'transparent',
                      borderColor: index < gamesB ? playerBColor : colors.text + '20',
                    },
                  ]}
                >
                  {index < gamesB && (
                    <View style={[styles.landscapeSetDot, { backgroundColor: playerBColor }]} />
                  )}
                </View>
              ))}
            </View>
          </View>
        </View>
        <View style={[styles.landscapeContent, { height: actualHeight, marginTop: toolbarHeight }]}>
          {/* Joueur A */}
          <TouchableOpacity
            style={styles.landscapePlayerSection}
            onPress={() => handleScoreIncrement('A')}
            activeOpacity={0.8}
          >
            <View style={styles.landscapeNameContainer}>
              <View style={[
                styles.landscapeNameWrapper,
                currentService === 'A' && {
                  borderWidth: 2,
                  borderColor: playerAColor,
                  backgroundColor: playerAColor + '10',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 8,
                }
              ]}>
                <ThemedText 
                  style={[
                    styles.landscapePlayerName, 
                    { 
                      color: playerAColor,
                      fontSize: nameFontSize,
                      lineHeight: nameFontSize * 1.3,
                    }
                  ]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                >
                  {playerA.first_name}{'\n'}{playerA.last_name}
                </ThemedText>
                {currentService === 'A' && (
                  <View style={[styles.landscapeServiceBadge, { 
                    backgroundColor: playerAColor,
                  }]}>
                    <ThemedText style={[styles.landscapeServiceBadgeText, { color: '#fff' }]}>
                      {servicePosition}
                    </ThemedText>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.landscapeScoreContainer}>
              <ThemedText 
                style={[
                  styles.landscapeScore, 
                  { 
                    color: playerAColor,
                    fontSize: scoreFontSize,
                    lineHeight: scoreFontSize * 0.95,
                  }
                ]}
              >
                {scoreA}
              </ThemedText>
            </View>
          </TouchableOpacity>

          {/* Séparateur central */}
          <View style={[styles.landscapeSeparator, { backgroundColor: colors.text + '10' }]} />

          {/* Joueur B */}
          <TouchableOpacity
            style={styles.landscapePlayerSection}
            onPress={() => handleScoreIncrement('B')}
            activeOpacity={0.8}
          >
            <View style={styles.landscapeNameContainer}>
              <View style={[
                styles.landscapeNameWrapper,
                currentService === 'B' && {
                  borderWidth: 2,
                  borderColor: playerBColor,
                  backgroundColor: playerBColor + '10',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 8,
                }
              ]}>
                <ThemedText 
                  style={[
                    styles.landscapePlayerName, 
                    { 
                      color: playerBColor,
                      fontSize: nameFontSize,
                      lineHeight: nameFontSize * 1.3,
                    }
                  ]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                >
                  {playerB.first_name}{'\n'}{playerB.last_name}
                </ThemedText>
                {currentService === 'B' && (
                  <View style={[styles.landscapeServiceBadge, { 
                    backgroundColor: playerBColor,
                  }]}>
                    <ThemedText style={[styles.landscapeServiceBadgeText, { color: '#fff' }]}>
                      {servicePosition}
                    </ThemedText>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.landscapeScoreContainer}>
              <ThemedText 
                style={[
                  styles.landscapeScore, 
                  { 
                    color: playerBColor,
                    fontSize: scoreFontSize,
                    lineHeight: scoreFontSize * 0.95,
                  }
                ]}
              >
                {scoreB}
              </ThemedText>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Bouton de retour en haut à gauche */}
      <TouchableOpacity
        onPress={handleBack}
        activeOpacity={0.6}
        style={[styles.backButton, { 
          top: insets.top + 10,
          left: 10,
          backgroundColor: colors.background + 'E0',
          borderColor: colors.text + '20',
        }]}
      >
        <IconSymbol name="chevron.left" size={20} color={colors.text} />
      </TouchableOpacity>

      {!isLandscape && (
        <>
          {/* Topbar personnalisée */}
          <View style={[styles.portraitToolbar, { 
            paddingTop: insets.top,
            borderBottomColor: colors.text + '10',
            backgroundColor: colors.background,
          }]}>
            <View style={styles.portraitToolbarContent}>
              {/* Joueur A avec sets */}
              <View style={styles.portraitPlayerSection}>
                <ThemedText 
                  style={[styles.portraitPlayerName, { color: playerAColor }]} 
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {playerA.first_name} {playerA.last_name}
                </ThemedText>
                <View style={styles.portraitSetsContainer}>
                  {Array.from({ length: 3 }).map((_, index) => (
                    <View
                      key={`portrait-set-a-${index}`}
                      style={[
                        styles.portraitSetBadge,
                        {
                          backgroundColor: index < gamesA ? playerAColor + '20' : 'transparent',
                          borderColor: index < gamesA ? playerAColor : colors.text + '20',
                        },
                      ]}
                    >
                      {index < gamesA && (
                        <View style={[styles.portraitSetDot, { backgroundColor: playerAColor }]} />
                      )}
                    </View>
                  ))}
                </View>
              </View>

              {/* Boutons d'action */}
              <View style={styles.portraitToolbarActions}>
                <TouchableOpacity
                  onPress={handleToggleLandscape}
                  activeOpacity={0.6}
                  style={[styles.portraitToolbarButton, { 
                    backgroundColor: colors.text + '08',
                    borderColor: colors.text + '15',
                  }]}
                >
                  <IconSymbol name="arrow.triangle.2.circlepath" size={18} color={colors.text} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowAllSetsModal(true);
                  }}
                  activeOpacity={0.6}
                  style={[styles.portraitToolbarButton, { 
                    backgroundColor: colors.text + '08',
                    borderColor: colors.text + '15',
                  }]}
                >
                  <IconSymbol name="gearshape" size={18} color={colors.text} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleUndo}
                  activeOpacity={0.6}
                  style={[styles.portraitToolbarButton, { 
                    backgroundColor: colors.text + '08',
                    borderColor: colors.text + '15',
                  }]}
                >
                  <IconSymbol name="arrow.uturn.backward" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Joueur B avec sets */}
              <View style={styles.portraitPlayerSection}>
                <ThemedText 
                  style={[styles.portraitPlayerName, { color: playerBColor }]} 
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {playerB.first_name} {playerB.last_name}
                </ThemedText>
                <View style={styles.portraitSetsContainer}>
                  {Array.from({ length: 3 }).map((_, index) => (
                    <View
                      key={`portrait-set-b-${index}`}
                      style={[
                        styles.portraitSetBadge,
                        {
                          backgroundColor: index < gamesB ? playerBColor + '20' : 'transparent',
                          borderColor: index < gamesB ? playerBColor : colors.text + '20',
                        },
                      ]}
                    >
                      {index < gamesB && (
                        <View style={[styles.portraitSetDot, { backgroundColor: playerBColor }]} />
                      )}
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>
        </>
      )}
      
      <View style={styles.content}>
        {/* Zone principale avec scores et zones cliquables */}
        <View style={styles.mainArea}>
          {/* Zone gauche - Joueur A */}
          <TouchableOpacity
            style={[styles.scoreZone, { backgroundColor: colors.background }]}
            onPress={() => handleScoreIncrement('A')}
            activeOpacity={0.7}
          >
            <View style={styles.scoreDisplay}>
              <ThemedText style={[styles.score, { color: playerAColor }]}>
                {scoreA}
              </ThemedText>
            </View>
            {/* Indicateur de service */}
            {currentService === 'A' && (
              <TouchableOpacity
                style={[styles.serviceIndicator, styles.serviceIndicatorLeft, { 
                  backgroundColor: playerAColor + '20',
                  borderColor: playerAColor + '40',
                }]}
                onPress={handleServiceToggle}
                activeOpacity={0.7}
              >
                <ThemedText style={[styles.serviceText, { color: playerAColor }]}>
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
                                color: playerAColor,
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
                              color: event.player === 'A' ? playerAColor : colors.text + '60',
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
                              color: event.player === 'B' ? playerBColor : colors.text + '60',
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
                                color: playerBColor,
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
              <ThemedText style={[styles.score, { color: playerBColor }]}>
                {scoreB}
              </ThemedText>
            </View>
            {/* Indicateur de service */}
            {currentService === 'B' && (
              <TouchableOpacity
                style={[styles.serviceIndicator, styles.serviceIndicatorRight, { 
                  backgroundColor: playerBColor + '20',
                  borderColor: playerBColor + '40',
                }]}
                onPress={handleServiceToggle}
                activeOpacity={0.7}
              >
                <ThemedText style={[styles.serviceText, { color: playerBColor }]}>
                  {servicePosition}
                </ThemedText>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal de gestion de tous les sets */}
      <Modal
        visible={showAllSetsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAllSetsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
            {/* Sélecteur de couleur intégré */}
            {showColorPicker !== null ? (
              <View style={styles.colorPickerContainer}>
                <View style={styles.colorPalette}>
                  {colorPalette.map((color) => {
                    const isSelected = showColorPicker === 'A' ? color === playerAColor : color === playerBColor;
                    return (
                      <TouchableOpacity
                        key={color}
                        style={[
                          styles.colorOption,
                          {
                            backgroundColor: color + '20',
                            borderColor: color,
                            borderWidth: isSelected ? 3 : 1.5,
                          },
                        ]}
                        onPress={async () => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          if (showColorPicker === 'A') {
                            setPlayerAColor(color);
                            // Sauvegarder la couleur en base de données
                            await updatePlayerColors(color, playerBColor);
                          } else {
                            setPlayerBColor(color);
                            // Sauvegarder la couleur en base de données
                            await updatePlayerColors(playerAColor, color);
                          }
                          setShowColorPicker(null);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.colorCircle, { backgroundColor: color }]} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : (
              <>
                {/* En-tête avec noms des joueurs */}
                <View style={[styles.setsHeader, { borderBottomColor: colors.text + '10' }]}>
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowColorPicker('A');
                    }}
                    activeOpacity={0.6}
                    style={[styles.setHeaderPlayer, { flex: 1 }]}
                  >
                    <View style={[styles.setHeaderColorBadge, { backgroundColor: playerAColor }]} />
                    <ThemedText 
                      style={[styles.setHeaderPlayerName, { color: playerAColor }]} 
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {playerA?.first_name} {playerA?.last_name}
                    </ThemedText>
                    <IconSymbol name="paintbrush.fill" size={14} color={colors.text + '50'} />
                  </TouchableOpacity>
                  
                  <View style={[styles.setsHeaderSeparator, { backgroundColor: colors.text + '20' }]} />
                  
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowColorPicker('B');
                    }}
                    activeOpacity={0.6}
                    style={[styles.setHeaderPlayer, { flex: 1 }]}
                  >
                    <View style={[styles.setHeaderColorBadge, { backgroundColor: playerBColor }]} />
                    <ThemedText 
                      style={[styles.setHeaderPlayerName, { color: playerBColor }]} 
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {playerB?.first_name} {playerB?.last_name}
                    </ThemedText>
                    <IconSymbol name="paintbrush.fill" size={14} color={colors.text + '50'} />
                  </TouchableOpacity>
                </View>
                
                <ScrollView style={styles.allSetsList} showsVerticalScrollIndicator={false}>
                  {/* Sets terminés */}
                  {completedGames.map((game, index) => (
                    <View
                      key={`completed-${index}`}
                      style={[
                        styles.setItem,
                        {
                          backgroundColor: colors.background,
                          borderColor: colors.text + '10',
                        },
                      ]}
                    >
                      <View style={styles.setItemContent}>
                        {/* Scores centrés */}
                        <View style={styles.setScoreRow}>
                          {/* Score Joueur A */}
                          <View style={styles.setScoreSection}>
                            <View style={[styles.setScoreBadge, { backgroundColor: playerAColor + '20' }]}>
                              <ThemedText style={[styles.setScoreValue, { color: playerAColor }]}>
                                {game.scoreA}
                              </ThemedText>
                            </View>
                          </View>
                          
                          {/* Séparateur */}
                          <ThemedText style={[styles.setScoreSeparator, { color: colors.text + '40' }]}>
                            -
                          </ThemedText>
                          
                          {/* Score Joueur B */}
                          <View style={styles.setScoreSection}>
                            <View style={[styles.setScoreBadge, { backgroundColor: playerBColor + '20' }]}>
                              <ThemedText style={[styles.setScoreValue, { color: playerBColor }]}>
                                {game.scoreB}
                              </ThemedText>
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>
                  ))}
                  
                  {/* Set en cours (si le match n'est pas terminé) */}
                  {(gamesA < 3 && gamesB < 3) && (scoreA > 0 || scoreB > 0 || completedGames.length > 0) && (
                    <View
                      style={[
                        styles.setItem,
                        {
                          backgroundColor: playerAColor + '08',
                          borderColor: playerAColor + '40',
                          borderWidth: 2,
                        },
                      ]}
                    >
                      <View style={styles.setItemContent}>
                        {/* Scores centrés */}
                        <View style={styles.setScoreRow}>
                          {/* Score Joueur A */}
                          <View style={styles.setScoreSection}>
                            <View style={[styles.setScoreBadge, { backgroundColor: playerAColor + '25' }]}>
                              <ThemedText style={[styles.setScoreValue, { color: playerAColor }]}>
                                {scoreA}
                              </ThemedText>
                            </View>
                          </View>
                          
                          {/* Séparateur */}
                          <ThemedText style={[styles.setScoreSeparator, { color: colors.text + '40' }]}>
                            -
                          </ThemedText>
                          
                          {/* Score Joueur B */}
                          <View style={styles.setScoreSection}>
                            <View style={[styles.setScoreBadge, { backgroundColor: playerBColor + '25' }]}>
                              <ThemedText style={[styles.setScoreValue, { color: playerBColor }]}>
                                {scoreB}
                              </ThemedText>
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>
                  )}
                  
                  {completedGames.length === 0 && (gamesA >= 3 || gamesB >= 3 || (scoreA === 0 && scoreB === 0 && completedGames.length === 0)) && (
                    <ThemedText style={[styles.noSetsText, { color: colors.text + '60' }]}>
                      Aucun set à gérer
                    </ThemedText>
                  )}
                </ScrollView>
                
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonCancel, { borderColor: colors.text + '30' }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowAllSetsModal(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <ThemedText style={[styles.modalButtonText, { color: colors.text + '70' }]}>
                      Fermer
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal de sélection de couleur */}
      <Modal
        visible={showColorPicker !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowColorPicker(null)}
        presentationStyle="overFullScreen"
      >
        <View style={[styles.modalOverlay, { zIndex: 1000 }]}>
          <View style={[styles.modalContent, styles.colorPickerModal, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
            <View style={styles.colorPickerTitleContainer}>
              <View style={[styles.colorPickerTitleBadge, { backgroundColor: showColorPicker === 'A' ? playerAColor : playerBColor }]} />
              <ThemedText style={[styles.colorPickerTitle, { color: colors.text }]}>
                {showColorPicker === 'A' ? playerA?.first_name : playerB?.first_name}
              </ThemedText>
            </View>
            
            <View style={styles.colorPalette}>
              {colorPalette.map((color) => {
                const isSelected = showColorPicker === 'A' ? color === playerAColor : color === playerBColor;
                return (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      {
                        backgroundColor: color + '20',
                        borderColor: color,
                        borderWidth: isSelected ? 3 : 1.5,
                      },
                    ]}
                    onPress={async () => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      if (showColorPicker === 'A') {
                        setPlayerAColor(color);
                        // Sauvegarder la couleur en base de données
                        await updatePlayerColors(color, playerBColor);
                      } else {
                        setPlayerBColor(color);
                        // Sauvegarder la couleur en base de données
                        await updatePlayerColors(playerAColor, color);
                      }
                      setShowColorPicker(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.colorCircle, { backgroundColor: color }]} />
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel, { borderColor: colors.text + '30' }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowColorPicker(null);
                }}
                activeOpacity={0.7}
              >
                <IconSymbol name="chevron.left" size={16} color={colors.text + '70'} />
                <ThemedText style={[styles.modalButtonText, { color: colors.text + '70', marginLeft: 6 }]}>
                  Annuler
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>


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
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  
                  // Restaurer l'état avant la fin du match
                  if (stateBeforeMatchEnd) {
                    setScoreA(stateBeforeMatchEnd.scoreA);
                    setScoreB(stateBeforeMatchEnd.scoreB);
                    setGamesA(stateBeforeMatchEnd.gamesA);
                    setGamesB(stateBeforeMatchEnd.gamesB);
                    setScoreHistory(stateBeforeMatchEnd.scoreHistory);
                    setCompletedGames(stateBeforeMatchEnd.completedGames);
                    setCurrentService(stateBeforeMatchEnd.currentService);
                    setServicePosition(stateBeforeMatchEnd.servicePosition);
                    
                    // Restaurer le live_score
                    const liveScore = generateLiveScore(
                      stateBeforeMatchEnd.completedGames,
                      stateBeforeMatchEnd.scoreA,
                      stateBeforeMatchEnd.scoreB,
                      stateBeforeMatchEnd.gamesA,
                      stateBeforeMatchEnd.gamesB
                    );
                    updateMatchScores(stateBeforeMatchEnd.gamesA, stateBeforeMatchEnd.gamesB, liveScore);
                    
                    setStateBeforeMatchEnd(null);
                  }
                  
                  setShowMatchSummary(false);
                }}
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
  backButton: {
    position: 'absolute',
    zIndex: 1000,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  setsPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '40%',
    borderTopWidth: 1,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
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
    position: 'relative',
    backgroundColor: 'transparent',
  },
  playerHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playerHeaderRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'flex-end',
  },
  manageSetsButtonContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'box-none',
  },
  playerInfo: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 6,
  },
  playerInfoRight: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 6,
  },
  playerName: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'left',
  },
  playerNameRight: {
    textAlign: 'right',
  },
  gamesContainer: {
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
  },
  gameBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
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
    marginTop: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    flexDirection: 'row',
  },
  modalButtonCancel: {
    backgroundColor: 'transparent',
  },
  modalButtonDelete: {
    borderWidth: 1.5,
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
  editGameContainer: {
    gap: 16,
    marginVertical: 8,
  },
  editGameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  editGameLabel: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  editGameScoreControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editGameButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editGameButtonText: {
    fontSize: 20,
    fontWeight: '700',
  },
  editGameScore: {
    fontSize: 24,
    fontWeight: '700',
    minWidth: 40,
    textAlign: 'center',
  },
  editGameVS: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  manageSetsButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageSetsButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  allSetsList: {
    maxHeight: 500,
    marginVertical: 8,
    paddingHorizontal: 4,
  },
  noSetsText: {
    fontSize: 15,
    textAlign: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  setsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 16,
    borderBottomWidth: 1,
  },
  setHeaderPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    flex: 1,
  },
  setHeaderColorBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  setHeaderPlayerName: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
  setsHeaderSeparator: {
    width: 1,
    height: 24,
    marginHorizontal: 12,
  },
  colorPickerContainer: {
    width: '100%',
    padding: 16,
    paddingTop: 8,
  },
  colorPickerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  colorPickerTitleBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorPickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  setItem: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 14,
    width: '100%',
  },
  setItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  setItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  setItemTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  setItemLabel: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 60,
  },
  setItemScore: {
    fontSize: 16,
    fontWeight: '700',
  },
  setScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    width: '100%',
  },
  setScoreSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  setScoreBadge: {
    minWidth: 56,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  setScoreValue: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  setScoreButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  setScoreButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  setScoreSeparator: {
    fontSize: 20,
    fontWeight: '600',
    marginHorizontal: 4,
  },
  setDeleteButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  setPlayerLabel: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    minWidth: 60,
  },
  setDeleteButtonText: {
    fontSize: 14,
  },
  colorPickerModal: {
    maxWidth: 360,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  colorPalette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 8,
    width: '100%',
  },
  colorOption: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  landscapeContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 0,
    marginTop: 0,
  },
  landscapeToolbar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  landscapeToolbarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  landscapeSetsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  landscapeSetBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  landscapeSetDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  landscapeToolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  landscapeToolbarButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  landscapeContent: {
    flexDirection: 'row',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 0,
    marginTop: 0,
  },
  landscapePlayerSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  landscapeSeparator: {
    width: 2,
    height: '60%',
    marginHorizontal: 20,
  },
  landscapeNameContainer: {
    marginBottom: 30,
    minHeight: 80,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  landscapeNameWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minWidth: 120,
  },
  landscapePlayerName: {
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  landscapeServiceBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  landscapeServiceBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  landscapeScoreContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
    paddingVertical: 20,
  },
  landscapeScore: {
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -2,
  },
  landscapeServiceIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  landscapeServiceText: {
    fontSize: 16,
    fontWeight: '700',
  },
  portraitToolbar: {
    borderBottomWidth: 1,
    zIndex: 10,
  },
  portraitToolbarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    minHeight: 70,
  },
  portraitPlayerSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: 6,
  },
  portraitPlayerName: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  portraitSetsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  portraitSetBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portraitSetDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  portraitToolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  portraitToolbarButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  portraitServiceIndicator: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portraitServiceText: {
    fontSize: 11,
    fontWeight: '700',
  },
  settingsSection: {
    marginBottom: 20,
  },
  settingsSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  settingsButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
