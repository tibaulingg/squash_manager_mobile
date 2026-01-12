import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, RefreshControl, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ProfileScreen from '@/app/(tabs)/profil';
import { ActivityFeed } from '@/components/activity-feed';
import { AuthModal } from '@/components/auth-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/services/api';
import type { MatchDTO, PlayerDTO, WaitingListEntryDTO } from '@/types/api';
import { formatMatchScore, getMatchSpecialStatus } from '@/utils/match-helpers';

// Couleur d'avatar sobre
const AVATAR_COLOR = '#9ca3af';

const getInitials = (firstName: string, lastName: string): string => {
  return `${firstName[0]}${lastName[0]}`.toUpperCase();
};

const formatDate = (date: Date): string => {
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  
  const day = days[date.getDay()];
  const month = months[date.getMonth()];
  const dayNumber = date.getDate();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  return `${day} ${dayNumber} ${month} • ${hours}:${minutes}`;
};

const getDayOfWeek = (): string => {
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  return days[new Date().getDay()];
};

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerDTO | null>(null);
  const [nextMatch, setNextMatch] = useState<{
    match: MatchDTO;
    opponent: PlayerDTO;
  } | null>(null);
  const [boxMatches, setBoxMatches] = useState<Array<{
    match: MatchDTO;
    opponent: PlayerDTO;
    isCompleted: boolean;
  }>>([]);
  const [waitingList, setWaitingList] = useState<WaitingListEntryDTO[]>([]);
  const [myWaitingEntry, setMyWaitingEntry] = useState<WaitingListEntryDTO | null>(null);
  const [desiredBoxNumber, setDesiredBoxNumber] = useState<string>('');
  const [allPlayers, setAllPlayers] = useState<PlayerDTO[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [followedPlayersMatches, setFollowedPlayersMatches] = useState<any[]>([]);
  const [followedPlayers, setFollowedPlayers] = useState<string[]>([]); // IDs des joueurs suivis
  const [matchReactions, setMatchReactions] = useState<{ [matchId: string]: { [reaction: string]: number } }>({});
  const [userReactions, setUserReactions] = useState<{ [matchId: string]: string | null }>({});
  const [matchComments, setMatchComments] = useState<{ [matchId: string]: any[] }>({});
  const isLoadingFollowedPlayersRef = useRef(false);
  const [boxRanking, setBoxRanking] = useState<Array<{
    player: PlayerDTO;
    points: number;
    wins: number;
    losses: number;
    matches: number;
    position: number;
  }>>([]);

  const loadData = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setLoading(false);
      return;
    }
    
    try {
      if (!refreshing) {
        setLoading(true);
      }
      
      // 1. Trouver le joueur par email
      const players = await api.getPlayers();
      setAllPlayers(players); // Sauvegarder tous les joueurs
      const player = players.find((p) => p.email?.toLowerCase() === user.email.toLowerCase());
      
      if (!player) {
        Alert.alert('Erreur', 'Joueur non trouvé dans la base de données');
        return;
      }
      
      setCurrentPlayer(player);
      
      // Si le joueur n'a pas de membership actif, charger la file d'attente
      if (!player.current_box) {
        const allWaitingList = await api.getWaitingList();
        setWaitingList(allWaitingList.filter((entry) => !entry.processed));
        
        const myEntry = allWaitingList.find((entry) => entry.player_id === player.id && !entry.processed);
        setMyWaitingEntry(myEntry || null);
        
        setLoading(false);
        setRefreshing(false);
        return;
      }
      
      // 2. Récupérer la saison en cours
      const seasons = await api.getSeasons();
      const currentSeason = seasons.find((s) => s.status === 'running') || seasons[0];
      
      if (!currentSeason) return;
      
      // 3. Récupérer les matchs du joueur
      const matches = await api.getMatches(currentSeason.id);
      const playerMatches = matches.filter(
        (m) => m.player_a_id === player.id || m.player_b_id === player.id
      );
      
      // Prochain match (non joué, peu importe la date)
      // Inclure les matchs avec demande de report en attente
      const upcomingMatches = playerMatches.filter(
        (m) => {
          if (!m.scheduled_at) return false;
          
          // Vérifier si le match a été joué (score valide, pas 0-0)
          const hasValidScore = (m.score_a !== null && m.score_a !== undefined) && 
                               (m.score_b !== null && m.score_b !== undefined) &&
                               !(m.score_a === 0 && m.score_b === 0);
          
          // Exclure seulement les matchs avec cas spéciaux résolus (accepted)
          const hasResolvedSpecialStatus = (m.no_show_player_id || m.retired_player_id) ||
                                          (m.delayed_player_id && m.delayed_status === 'accepted');
          
          // Inclure les matchs non joués (pas de score valide) et sans statut résolu
          return !hasValidScore && !hasResolvedSpecialStatus;
        }
      );
      
      upcomingMatches.sort((a, b) => 
        new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime()
      );
      
      if (upcomingMatches.length > 0) {
        const match = upcomingMatches[0];
        const opponentId = match.player_a_id === player.id ? match.player_b_id : match.player_a_id;
        const opponent = players.find((p) => p.id === opponentId);
        
        if (opponent) {
          setNextMatch({ match, opponent });
        }
      }
      
      // Tous les matchs du box actuel
      if (player.current_box) {
        const currentBoxMatches = matches.filter((m) => m.box_id === player.current_box?.box_id);
        const myBoxMatches = currentBoxMatches
          .filter((m) => m.player_a_id === player.id || m.player_b_id === player.id)
          .map((match) => {
            const opponentId = match.player_a_id === player.id ? match.player_b_id : match.player_a_id;
            const opponent = players.find((p) => p.id === opponentId)!;
            // Un match est complété seulement si les scores sont non-null ET qu'au moins un score est > 0
            // (un match 0-0 n'est pas considéré comme joué)
            const hasValidScores = match.score_a !== null && match.score_b !== null &&
                                   (match.score_a! > 0 || match.score_b! > 0);
            const hasSpecialStatus = !!(match.no_show_player_id || match.retired_player_id || match.delayed_player_id); // delayed_player_id rempli seulement si accepté et remis
            return {
              match,
              opponent,
              isCompleted: hasValidScores || hasSpecialStatus,
            };
          })
          .sort((a, b) => {
            if (a.isCompleted === b.isCompleted) {
              if (a.match.scheduled_at && b.match.scheduled_at) {
                return new Date(a.match.scheduled_at).getTime() - new Date(b.match.scheduled_at).getTime();
              }
              return 0;
            }
            return a.isCompleted ? 1 : -1;
          });
        
        setBoxMatches(myBoxMatches);

        // Calculer le classement du box
        const boxPlayerIds = new Set<string>();
        currentBoxMatches.forEach((m) => {
          boxPlayerIds.add(m.player_a_id);
          boxPlayerIds.add(m.player_b_id);
        });
        
        const boxPlayers = players.filter((p) => boxPlayerIds.has(p.id));
        
        // Calculer les statistiques pour chaque joueur
        const playerStats = new Map<string, { points: number; wins: number; losses: number; matches: number }>();
        boxPlayers.forEach((p) => playerStats.set(p.id, { points: 0, wins: 0, losses: 0, matches: 0 }));
        
        currentBoxMatches.forEach((match) => {
          if (match.score_a !== null && match.score_b !== null && 
              !(match.score_a === 0 && match.score_b === 0)) {
            // Calculer les points : 2 points par set gagné
            const pointsA = match.score_a * 2;
            const pointsB = match.score_b * 2;
            
            const statsA = playerStats.get(match.player_a_id)!;
            const statsB = playerStats.get(match.player_b_id)!;
            
            statsA.points += pointsA;
            statsB.points += pointsB;
            statsA.matches += 1;
            statsB.matches += 1;
            
            // Déterminer le gagnant
            if (match.score_a > match.score_b) {
              statsA.wins += 1;
              statsB.losses += 1;
            } else if (match.score_b > match.score_a) {
              statsB.wins += 1;
              statsA.losses += 1;
            }
            
            playerStats.set(match.player_a_id, statsA);
            playerStats.set(match.player_b_id, statsB);
          }
        });
        
        // Créer le classement
        const ranking = boxPlayers
          .map((p) => {
            const stats = playerStats.get(p.id) || { points: 0, wins: 0, losses: 0, matches: 0 };
            return {
              player: p,
              points: stats.points,
              wins: stats.wins,
              losses: stats.losses,
              matches: stats.matches,
              position: 0,
            };
          })
          .sort((a, b) => b.points - a.points)
          .map((item, index) => ({
            ...item,
            position: index + 1,
          }))
          .slice(0, 5); // Top 5 seulement
        
        setBoxRanking(ranking);
      } else {
        setBoxRanking([]);
      }

      // Charger les matchs récents pour le feed (tous les matchs joués récemment, pas seulement ceux du joueur)
      const allRecentMatches = matches
        .filter(m => {
          // Inclure les matchs joués (avec score ou statut spécial)
          const hasScore = m.score_a !== null && m.score_b !== null && (m.score_a! > 0 || m.score_b! > 0);
          const hasSpecialStatus = !!(m.no_show_player_id || m.retired_player_id || m.delayed_player_id);
          return (hasScore || hasSpecialStatus) && m.played_at;
        })
        .sort((a, b) => {
          const dateA = a.scheduled_at ? new Date(a.scheduled_at).getTime() : (a.played_at ? new Date(a.played_at).getTime() : 0);
          const dateB = b.scheduled_at ? new Date(b.scheduled_at).getTime() : (b.played_at ? new Date(b.played_at).getTime() : 0);
          return dateB - dateA; // Plus récent en premier
        })
        .slice(0, 20); // Limiter à 20 matchs récents (non utilisé pour le moment)
    } catch (error) {
      console.error('Erreur chargement données:', error);
      Alert.alert('Erreur', 'Impossible de charger les données');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, refreshing]);

  // Charger la liste des joueurs suivis et leurs matchs
  const loadFollowedPlayers = useCallback(async () => {
    if (!currentPlayer?.id) {
      setFollowedPlayers([]);
      setFollowedPlayersMatches([]);
      return;
    }
    
    // Éviter les appels multiples simultanés
    if (isLoadingFollowedPlayersRef.current) {
      return;
    }
    
    isLoadingFollowedPlayersRef.current = true;
    
    try {
      // Récupérer les joueurs suivis
      const following = await api.getFollowing(currentPlayer.id);
      const followedIds = following.map(p => p.id);
      setFollowedPlayers(followedIds);
      
      // Si aucun joueur suivi, vider les matchs
      if (followedIds.length === 0) {
        setFollowedPlayersMatches([]);
        return;
      }
      
      // Récupérer les matchs des joueurs suivis
      const matches = await api.getFollowedPlayersMatches(currentPlayer.id, 50);
      
      // Filtrer les matchs : seulement ceux des 7 derniers jours avec résultats valides
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      const validMatches = matches.filter((match) => {
        // Vérifier que le match a été joué (played_at existe)
        if (!match.played_at) return false;
        
        const playedDate = new Date(match.played_at);
        // Vérifier que c'est dans les 7 derniers jours
        if (playedDate < oneWeekAgo) return false;
        
        // Vérifier que le match a un résultat valide (pas 0-0, pas de cas spéciaux)
        const hasValidScore = match.score_a !== null && match.score_b !== null &&
                             !(match.score_a === 0 && match.score_b === 0);
        const hasSpecialStatus = !!(match.no_show_player_id || match.retired_player_id || match.delayed_player_id);
        
        // Inclure seulement les matchs avec score valide et sans statut spécial
        return hasValidScore && !hasSpecialStatus;
      });
      
      const players = await api.getPlayers();
      
      // Charger les réactions pour tous les matchs valides
      if (validMatches.length > 0) {
        try {
          const matchIds = validMatches.map(m => m.id);
          const reactionsData = await api.getMatchReactions(matchIds, currentPlayer.id);

          // Transformer les données de réactions
          const reactionsMap: { [matchId: string]: { [reaction: string]: number } } = {};
          const userReactionsMap: { [matchId: string]: string | null } = {};
          
          Object.entries(reactionsData).forEach(([matchId, data]) => {
            reactionsMap[matchId] = data.reactions || {};
            userReactionsMap[matchId] = data.userReaction || null;
          });
          
          setMatchReactions(reactionsMap);
          setUserReactions(userReactionsMap);
        } catch (error) {
          console.error('Erreur chargement réactions:', error);
        }
      }
      
      // Transformer les matchs pour l'ActivityFeed
      const feedItems = validMatches.map((match) => {
        const playerA = players.find(p => p.id === match.player_a_id);
        const playerB = players.find(p => p.id === match.player_b_id);
        
        if (!playerA || !playerB) return null;
        
        // Déterminer qui a joué ce match (le joueur suivi)
        const playedBy = followedIds.includes(match.player_a_id) ? playerA : playerB;
        
        // Déterminer si c'est un cas spécial
        const isWin = playedBy.id === match.player_a_id 
          ? (match.score_a !== null && match.score_b !== null && match.score_a > match.score_b)
          : (match.score_a !== null && match.score_b !== null && match.score_b > match.score_a);
        const specialStatus = getMatchSpecialStatus(match, playedBy.id, isWin);
        const isSpecialCase = !!(match.no_show_player_id || match.retired_player_id || match.delayed_player_id);
        
        return {
          match,
          playerA,
          playerB,
          playerAScore: match.score_a,
          playerBScore: match.score_b,
          isSpecialCase,
          specialStatus,
          playedBy,
          playedAt: match.scheduled_at ? new Date(match.scheduled_at) : (match.played_at ? new Date(match.played_at) : new Date()),
        };
      }).filter((item): item is NonNullable<typeof item> => item !== null);
      
      setFollowedPlayersMatches(feedItems);
    } catch (error: any) {
      console.error('Erreur chargement joueurs suivis:', error);
      // Ne pas vider les états en cas d'erreur pour éviter les boucles
      // Si l'API n'est pas encore implémentée, on ignore silencieusement
      if (error.message?.includes('404') || error.message?.includes('Not Found')) {
        console.log('Endpoint getFollowing non implémenté, ignoré');
        setFollowedPlayers([]);
        setFollowedPlayersMatches([]);
      }
    } finally {
      isLoadingFollowedPlayersRef.current = false;
    }
  }, [currentPlayer?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (currentPlayer?.id) {
      loadFollowedPlayers();
    }
  }, [currentPlayer?.id, loadFollowedPlayers]);

  // Recharger les données quand on revient sur l'onglet
  useFocusEffect(
    useCallback(() => {
      loadData();
      loadFollowedPlayers();
    }, [loadData, loadFollowedPlayers])
  );

  const handleRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    await Promise.all([loadData(), loadFollowedPlayers()]);
  };

  const handleCall = async (phone: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = `tel:${phone}`;
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
    }
  };

  const handleMessage = async (phone: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = `sms:${phone}`;
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
    }
  };

  const handleViewBox = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(tabs)/box');
  };

  const handleReaction = async (matchId: string, reaction: string) => {
    if (!currentPlayer) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    try {
      // Toggle reaction: si déjà réagi avec cette réaction, la retirer, sinon l'ajouter
      const currentReaction = userReactions[matchId];
      const newReaction = currentReaction === reaction ? null : reaction;
      
      // Appel API pour sauvegarder la réaction
      await api.reactToMatch(matchId, currentPlayer.id, newReaction);
      
      // Mise à jour locale optimiste
      setUserReactions(prev => ({
        ...prev,
        [matchId]: newReaction,
      }));
      
      setMatchReactions(prev => {
        const current = prev[matchId] || {};
        const newCounts = { ...current };
        
        // Retirer l'ancienne réaction
        if (currentReaction && newCounts[currentReaction]) {
          newCounts[currentReaction] = Math.max(0, newCounts[currentReaction] - 1);
          if (newCounts[currentReaction] === 0) {
            delete newCounts[currentReaction];
          }
        }
        
        // Ajouter la nouvelle réaction
        if (newReaction) {
          newCounts[newReaction] = (newCounts[newReaction] || 0) + 1;
        }
        
        return {
          ...prev,
          [matchId]: newCounts,
        };
      });
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error('Erreur réaction:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erreur', error.message || 'Impossible d\'ajouter la réaction');
    }
  };

  const handleComment = async (matchId: string, text: string) => {
    if (!currentPlayer) return;
    
    try {
      const comment = await api.addMatchComment(matchId, currentPlayer.id, text);
      
      // Mettre à jour les commentaires locaux
      setMatchComments(prev => ({
        ...prev,
        [matchId]: [...(prev[matchId] || []), comment],
      }));
    } catch (error: any) {
      console.error('Erreur commentaire:', error);
      throw error;
    }
  };

  const handleLoadComments = async (matchId: string) => {
    try {
      return await api.getMatchComments(matchId);
    } catch (error: any) {
      console.error('Erreur chargement commentaires:', error);
      // En cas d'erreur, retourner les commentaires locaux s'ils existent
      return matchComments[matchId] || [];
    }
  };

  const handleDeleteComment = async (commentId: string, matchId: string) => {
    if (!currentPlayer) return;
    
    try {
      await api.deleteMatchComment(commentId, currentPlayer.id);
      
      // Mettre à jour les commentaires locaux
      setMatchComments(prev => ({
        ...prev,
        [matchId]: (prev[matchId] || []).filter(c => c.id !== commentId),
      }));
    } catch (error: any) {
      console.error('Erreur suppression commentaire:', error);
      Alert.alert('Erreur', error.message || 'Impossible de supprimer le commentaire');
    }
  };

  const handleRequestDelay = async (matchId: string) => {
    if (!currentPlayer) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      await api.requestMatchDelay(matchId, currentPlayer.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Demande envoyée', 'Votre demande de report a été envoyée à votre adversaire');
      await loadData();
    } catch (error: any) {
      console.error('Erreur demande report:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erreur', error.message || 'Impossible d\'envoyer la demande de report');
    }
  };

  const handleAcceptDelay = async (matchId: string) => {
    if (!currentPlayer) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      await api.acceptMatchDelay(matchId, currentPlayer.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Report accepté', 'Le report a été accepté. Le match sera reprogrammé.');
      await loadData();
    } catch (error: any) {
      console.error('Erreur acceptation report:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erreur', error.message || 'Impossible d\'accepter le report');
    }
  };

  const handleRejectDelay = async (matchId: string) => {
    if (!currentPlayer) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    Alert.alert(
      'Refuser le report ?',
      'Êtes-vous sûr de vouloir refuser cette demande de report ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Refuser',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.rejectMatchDelay(matchId, currentPlayer.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Report refusé', 'La demande de report a été refusée.');
              await loadData();
            } catch (error: any) {
              console.error('Erreur refus report:', error);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Erreur', error.message || 'Impossible de refuser le report');
            }
          },
        },
      ]
    );
  };


  const handleCancelDelay = async (matchId: string) => {
    if (!currentPlayer) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    Alert.alert(
      'Annuler la demande ?',
      'Êtes-vous sûr de vouloir annuler votre demande de report ?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.cancelMatchDelay(matchId, currentPlayer.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Demande annulée', 'Votre demande de report a été annulée.');
              await loadData();
            } catch (error: any) {
              console.error('Erreur annulation report:', error);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Erreur', error.message || 'Impossible d\'annuler la demande');
            }
          },
        },
      ]
    );
  };

  // Helper function pour obtenir les infos de statut de report (sans affichage)
  const getDelayStatusInfo = (match: MatchDTO, opponent: PlayerDTO) => {
    if (!currentPlayer || !match.delayed_requested_by) return null;
    
    const isPlayerA = match.player_a_id === currentPlayer.id;
    const isRequestingPlayer = match.delayed_requested_by === currentPlayer.id;
    const opponentId = isPlayerA ? match.player_b_id : match.player_a_id;
    const isOpponent = match.delayed_requested_by === opponentId;
    const delayStatus = match.delayed_status;
    
    // Si ce n'est pas une demande qui concerne le joueur actuel, ne rien retourner
    if (!isRequestingPlayer && !isOpponent) return null;
    
    // Déterminer le texte et la couleur selon le statut
    let statusText = '';
    let statusColor = colors.text;
    let statusBg = colors.text + '10';
    
    if (isRequestingPlayer) {
      // Le joueur actuel a demandé
      if (delayStatus === 'pending' || (delayStatus === null && match.delayed_requested_at && !match.delayed_resolved_at)) {
        statusText = 'Report demandé';
        statusColor = '#f59e0b';
        statusBg = '#f59e0b' + '20';
      } else if (delayStatus === 'accepted') {
        statusText = 'Report accepté';
        statusColor = '#10b981';
        statusBg = '#10b981' + '20';
      } else if (delayStatus === 'rejected') {
        statusText = 'Report refusé';
        statusColor = '#ef4444';
        statusBg = '#ef4444' + '20';
      } else if (delayStatus === 'cancelled') {
        return null; // Ne pas afficher si annulé
      }
    } else if (isOpponent) {
      // L'adversaire a demandé
      if (delayStatus === 'pending' || (delayStatus === null && match.delayed_requested_at && !match.delayed_resolved_at)) {
        statusText = 'Report demandé';
        statusColor = '#f59e0b';
        statusBg = '#f59e0b' + '20';
      } else if (delayStatus === 'accepted') {
        statusText = 'Report accepté';
        statusColor = '#10b981';
        statusBg = '#10b981' + '20';
      } else if (delayStatus === 'rejected') {
        statusText = 'Report refusé';
        statusColor = '#ef4444';
        statusBg = '#ef4444' + '20';
      }
    }
    
    if (!statusText) return null;
    
    return { statusText, statusColor, statusBg, delayStatus };
  };

  // Helper function pour afficher le statut de report (badge)
  const renderDelayStatus = (match: MatchDTO, opponent: PlayerDTO) => {
    const statusInfo = getDelayStatusInfo(match, opponent);
    if (!statusInfo) return null;
    
    return (
      <View style={[styles.delayStatusBadge, { backgroundColor: statusInfo.statusBg }]}>
        <IconSymbol 
          name={statusInfo.delayStatus === 'accepted' ? 'checkmark.circle.fill' : statusInfo.delayStatus === 'rejected' ? 'xmark.circle.fill' : 'exclamationmark.triangle.fill'} 
          size={12} 
          color={statusInfo.statusColor} 
        />
        <ThemedText style={[styles.delayStatusText, { color: statusInfo.statusColor }]}>
          {statusInfo.statusText}
        </ThemedText>
      </View>
    );
  };

  // Helper function pour afficher le statut de report comme tag (remplace score)
  const renderDelayStatusTag = (match: MatchDTO, opponent: PlayerDTO) => {
    const statusInfo = getDelayStatusInfo(match, opponent);
    if (!statusInfo) return null;
    
    return (
      <View style={[styles.scoreTag, { backgroundColor: statusInfo.statusBg }]}>
        <ThemedText style={[styles.scoreTagText, { color: statusInfo.statusColor }]}>
          {statusInfo.statusText}
        </ThemedText>
      </View>
    );
  };

  // Helper function pour rendre les actions de report pour un match (petit bouton inline)
  const renderDelayButtonInline = (match: MatchDTO, opponent: PlayerDTO) => {
    if (!currentPlayer) return null;
    
    const isPlayerA = match.player_a_id === currentPlayer.id;
    const isRequestingPlayer = match.delayed_requested_by === currentPlayer.id;
    const opponentId = isPlayerA ? match.player_b_id : match.player_a_id;
    const isOpponent = match.delayed_requested_by && match.delayed_requested_by === opponentId;
    const delayStatus = match.delayed_status;
    
    // Aucune demande en cours, le joueur peut demander un report
    const canRequestDelay = !match.delayed_requested_by || 
                           delayStatus === 'cancelled' || 
                           delayStatus === 'rejected';
    
    // Ne permettre la demande que si le match n'est pas joué
    const isMatchNotPlayed = !match.score_a && !match.score_b;
    
    // Seulement afficher le petit bouton "Report" si on peut demander
    if (canRequestDelay && isMatchNotPlayed) {
      return (
        <TouchableOpacity
          style={[styles.delayButtonSmall, { backgroundColor: colors.text + '05', borderColor: colors.text + '15' }]}
          onPress={() => handleRequestDelay(match.id)}
          activeOpacity={0.7}
        >
          <IconSymbol name="calendar.badge.exclamationmark" size={12} color={colors.text + '80'} />
          <ThemedText style={[styles.delayButtonTextSmall, { color: colors.text + '80' }]}>
            Reporter
          </ThemedText>
        </TouchableOpacity>
      );
    }
    
    return null;
  };

  // Helper function pour rendre les actions de report pour un match (actions complètes)
  const renderDelayActions = (match: MatchDTO, opponent: PlayerDTO) => {
    if (!currentPlayer) return null;
    
    const isPlayerA = match.player_a_id === currentPlayer.id;
    const isRequestingPlayer = match.delayed_requested_by === currentPlayer.id;
    const opponentId = isPlayerA ? match.player_b_id : match.player_a_id;
    const isOpponent = match.delayed_requested_by && match.delayed_requested_by === opponentId;
    const delayStatus = match.delayed_status;
    
    // Le joueur a demandé un report et c'est en attente
    if (isRequestingPlayer && (delayStatus === 'pending' || delayStatus === null || !delayStatus)) {
      return (
        <TouchableOpacity
          style={[styles.delayButton, styles.delayButtonCancel, { backgroundColor: '#ef4444' + '15', borderColor: '#ef4444' + '40' }]}
          onPress={() => handleCancelDelay(match.id)}
          activeOpacity={0.7}
        >
          <IconSymbol name="xmark.circle.fill" size={16} color="#ef4444" />
          <ThemedText style={[styles.delayButtonText, { color: '#ef4444' }]}>
            Annuler la demande
          </ThemedText>
        </TouchableOpacity>
      );
    }
    
    // L'adversaire a demandé un report et c'est en attente
    if (isOpponent && (delayStatus === 'pending' || delayStatus === null || !delayStatus)) {
      return (
        <View style={styles.delayActions}>
          <ThemedText style={[styles.delayRequestText, { color: colors.text, opacity: 0.7 }]}>
            {opponent.first_name} a demandé un report
          </ThemedText>
          <View style={styles.delayButtonsRow}>
            <TouchableOpacity
              style={[styles.delayButton, styles.delayButtonAccept, { backgroundColor: '#10b981' + '15', borderColor: '#10b981' + '40' }]}
              onPress={() => handleAcceptDelay(match.id)}
              activeOpacity={0.7}
            >
              <IconSymbol name="checkmark.circle.fill" size={16} color="#10b981" />
              <ThemedText style={[styles.delayButtonText, { color: '#10b981' }]}>
                Accepter
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.delayButton, styles.delayButtonReject, { backgroundColor: '#ef4444' + '15', borderColor: '#ef4444' + '40' }]}
              onPress={() => handleRejectDelay(match.id)}
              activeOpacity={0.7}
            >
              <IconSymbol name="xmark.circle.fill" size={16} color="#ef4444" />
              <ThemedText style={[styles.delayButtonText, { color: '#ef4444' }]}>
                Refuser
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    
    return null;
  };


  // Helper pour obtenir le nom d'un joueur
  const getPlayerName = (playerId: string): string => {
    const player = allPlayers.find((p) => p.id === playerId);
    if (!player) return 'Joueur inconnu';
    return `${player.first_name} ${player.last_name}`;
  };

  const handleJoinWaitingList = async () => {
    if (!currentPlayer) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      const boxNum = desiredBoxNumber ? parseInt(desiredBoxNumber) : null;
      
      const entry = await api.addToWaitingList(currentPlayer.id, boxNum);
      setMyWaitingEntry(entry);
      
      // Recharger la liste complète
      const allWaitingList = await api.getWaitingList();
      setWaitingList(allWaitingList.filter((e) => !e.processed));
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Succès', 'Vous avez rejoint la file d\'attente !');
    } catch (error: any) {
      console.error('Erreur ajout file d\'attente:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erreur', error.message || 'Impossible de rejoindre la file d\'attente');
    }
  };

  const handleLeaveWaitingList = async () => {
    if (!myWaitingEntry) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      await api.removeFromWaitingList(myWaitingEntry.id);
      setMyWaitingEntry(null);
      
      // Recharger la liste complète
      const allWaitingList = await api.getWaitingList();
      setWaitingList(allWaitingList.filter((e) => !e.processed));
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Succès', 'Vous avez quitté la file d\'attente');
    } catch (error: any) {
      console.error('Erreur sortie file d\'attente:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erreur', error.message || 'Impossible de quitter la file d\'attente');
    }
  };

  if (loading) {
  return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.text + '80'} />
        </View>
      </ThemedView>
    );
  }

  // Vue publique (non connecté)
  if (!isAuthenticated) {
    return (
      <ThemedView style={styles.container}>
        <AuthModal visible={showAuthModal} onClose={() => setShowAuthModal(false)} />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 10, paddingBottom: 60 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Section */}
          <View style={styles.heroSection}>
            <View style={styles.logoContainer}>
              <Image
                source={require('@/favicon-logo-header.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <ThemedText style={styles.heroTitle}>Squash 22</ThemedText>
            <ThemedText style={[styles.heroSubtitle, { color: colors.text + '70' }]}>
              Lundi des box
            </ThemedText>
          </View>

          {/* CTA Principal */}
          <View style={styles.ctaSection}>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: PRIMARY_COLOR }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowAuthModal(true);
              }}
              activeOpacity={0.8}
            >
              <ThemedText style={styles.primaryButtonText}>S'identifier</ThemedText>
              <IconSymbol name="arrow.right.circle.fill" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          {/* Features Grid */}
          <View style={styles.featuresGrid}>
            <View style={[styles.featureCard, { backgroundColor: colors.background }]}>
              <View style={[styles.featureIconContainer, { backgroundColor: PRIMARY_COLOR + '15' }]}>
                <IconSymbol name="calendar.badge.clock" size={28} color={PRIMARY_COLOR} />
              </View>
              <ThemedText style={styles.featureCardTitle}>Matchs réguliers</ThemedText>
              <ThemedText style={[styles.featureCardDescription, { color: colors.text + '70' }]}>
                Compétitions chaque lundi soir
              </ThemedText>
            </View>

            <View style={[styles.featureCard, { backgroundColor: colors.background }]}>
              <View style={[styles.featureIconContainer, { backgroundColor: PRIMARY_COLOR + '15' }]}>
                <IconSymbol name="square.grid.2x2.fill" size={28} color={PRIMARY_COLOR} />
              </View>
              <ThemedText style={styles.featureCardTitle}>Système de Box</ThemedText>
              <ThemedText style={[styles.featureCardDescription, { color: colors.text + '70' }]}>
                Jouez selon votre niveau
              </ThemedText>
            </View>

            <View style={[styles.featureCard, { backgroundColor: colors.background }]}>
              <View style={[styles.featureIconContainer, { backgroundColor: PRIMARY_COLOR + '15' }]}>
                <IconSymbol name="chart.line.uptrend.xyaxis" size={28} color={PRIMARY_COLOR} />
              </View>
              <ThemedText style={styles.featureCardTitle}>Statistiques</ThemedText>
              <ThemedText style={[styles.featureCardDescription, { color: colors.text + '70' }]}>
                Suivez votre progression
              </ThemedText>
            </View>

            <View style={[styles.featureCard, { backgroundColor: colors.background }]}>
              <View style={[styles.featureIconContainer, { backgroundColor: PRIMARY_COLOR + '15' }]}>
                <IconSymbol name="person.3.fill" size={28} color={PRIMARY_COLOR} />
              </View>
              <ThemedText style={styles.featureCardTitle}>Communauté</ThemedText>
              <ThemedText style={[styles.featureCardDescription, { color: colors.text + '70' }]}>
                Rencontrez d'autres joueurs
              </ThemedText>
            </View>
          </View>

          {/* Info Section */}
          <View style={[styles.infoSection, { backgroundColor: colors.background }]}>
            <IconSymbol name="info.circle.fill" size={24} color={PRIMARY_COLOR} />
            <View style={styles.infoContent}>
              <ThemedText style={styles.infoTitle}>Comment ça marche ?</ThemedText>
              <ThemedText style={[styles.infoDescription, { color: colors.text + '70' }]}>
                Inscrivez-vous, rejoignez un box adapté à votre niveau, et participez aux tournois hebdomadaires pour progresser et vous amuser.
        </ThemedText>
            </View>
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  // Vue file d'attente (connecté sans membership)
  if (isAuthenticated && currentPlayer && !currentPlayer.current_box) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: Math.max(insets.top, 20) + 20 },
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
          <View style={styles.welcomeHeader}>
            <ThemedText style={styles.welcomeName}>
              {currentPlayer.first_name} {currentPlayer.last_name}
            </ThemedText>
          </View>

          {/* Message d'information */}
          <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
            <View style={[styles.infoIconContainer, { backgroundColor: PRIMARY_COLOR + '15' }]}>
              <IconSymbol name="info.circle.fill" size={32} color={PRIMARY_COLOR} />
            </View>
            <ThemedText style={styles.waitingTitle}>Aucun box actif</ThemedText>
            <ThemedText style={[styles.waitingDescription, { color: colors.text + '70' }]}>
              Vous n'avez pas de membership actif pour cette saison. Rejoignez la file d'attente pour participer au prochain box !
            </ThemedText>
          </View>

          {/* Formulaire d'inscription à la file */}
          {!myWaitingEntry && (
            <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
              <ThemedText style={styles.cardTitle}>Rejoindre la file d'attente</ThemedText>
              
              <View style={styles.inputGroup}>
                <ThemedText style={[styles.inputLabel, { color: colors.text + '80' }]}>
                  Box souhaité (optionnel)
                </ThemedText>
                <TextInput
                  style={[styles.boxInput, { backgroundColor: colors.text + '05', color: colors.text, borderColor: colors.text + '20' }]}
                  value={desiredBoxNumber}
                  onChangeText={setDesiredBoxNumber}
                  placeholder="Ex: 16"
                  placeholderTextColor={colors.text + '40'}
                  keyboardType="number-pad"
                />
              </View>

              <TouchableOpacity
                style={[styles.joinButton, { backgroundColor: PRIMARY_COLOR }]}
                onPress={handleJoinWaitingList}
                activeOpacity={0.7}
              >
                <IconSymbol name="person.badge.plus" size={20} color="#000" />
                <ThemedText style={styles.joinButtonText}>Rejoindre la file</ThemedText>
              </TouchableOpacity>
            </View>
          )}

          {/* Ma position dans la file */}
          {myWaitingEntry && (
            <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
              <View style={[styles.statusIconContainer, { backgroundColor: '#10b981' + '15' }]}>
                <IconSymbol name="checkmark.circle.fill" size={32} color="#10b981" />
              </View>
              <ThemedText style={styles.waitingTitle}>Vous êtes dans la file !</ThemedText>
              
              <View style={styles.positionInfo}>
                <View style={styles.positionBadge}>
                  <ThemedText style={styles.positionNumber}>
                    #{myWaitingEntry.order_no || '?'}
                  </ThemedText>
                  <ThemedText style={[styles.positionLabel, { color: colors.text + '70' }]}>
                    Position
                  </ThemedText>
                </View>
                
                {myWaitingEntry.target_box_number && (
                  <View style={styles.positionBadge}>
                    <ThemedText style={styles.positionNumber}>
                      Box {myWaitingEntry.target_box_number}
                    </ThemedText>
                    <ThemedText style={[styles.positionLabel, { color: colors.text + '70' }]}>
                      Souhaité
                    </ThemedText>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[styles.leaveButton, { backgroundColor: colors.text + '10' }]}
                onPress={handleLeaveWaitingList}
                activeOpacity={0.7}
              >
                <IconSymbol name="xmark.circle" size={20} color={colors.text + '60'} />
                <ThemedText style={[styles.leaveButtonText, { color: colors.text }]}>
                  Quitter la file
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}

          {/* Liste d'attente complète */}
          <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
            <ThemedText style={styles.cardTitle}>
              File d'attente ({waitingList.length} {waitingList.length > 1 ? 'personnes' : 'personne'})
            </ThemedText>
            
            {waitingList.length === 0 ? (
              <ThemedText style={[styles.emptyText, { color: colors.text + '60' }]}>
                Aucune personne en attente pour le moment
              </ThemedText>
            ) : (
              <View style={styles.waitingListContainer}>
                {waitingList.map((entry, index) => (
                  <View
                    key={entry.id}
                    style={[
                      styles.waitingListItem,
                      { borderBottomColor: colors.text + '10' },
                      index === waitingList.length - 1 && styles.waitingListItemLast,
                      entry.id === myWaitingEntry?.id && { backgroundColor: PRIMARY_COLOR + '08' }
                    ]}
                  >
                    <View style={styles.waitingListLeft}>
                      <ThemedText style={styles.waitingListPosition}>
                        #{entry.order_no || index + 1}
                      </ThemedText>
                      <View style={styles.waitingListInfo}>
                        <ThemedText style={styles.waitingListText}>
                          {entry.id === myWaitingEntry?.id ? 'Vous' : getPlayerName(entry.player_id)}
                        </ThemedText>
                        {entry.target_box_number && (
                          <ThemedText style={[styles.waitingListBox, { color: colors.text + '60' }]}>
                            Box {entry.target_box_number} souhaité
                          </ThemedText>
                        )}
                      </View>
                    </View>
                    <ThemedText style={[styles.waitingListDate, { color: colors.text + '60' }]}>
                      {new Date(entry.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </ThemedText>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </ThemedView>
    );
  }

  // Vue connectée (personnalisée)
  return (
    <ThemedView style={styles.container}>
      <AuthModal visible={showAuthModal} onClose={() => setShowAuthModal(false)} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(insets.top, 20) + 20 },
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
        {/* Header d'accueil */}
        {currentPlayer && (
          <View style={[styles.welcomeHeader, { backgroundColor: colors.background }]}>
            <View style={styles.welcomeRow}>
              <ThemedText style={styles.welcomeGreeting}>
                Bonjour, {currentPlayer.first_name} 👋
              </ThemedText>
              
              {/* Chip réinscrit à droite */}
              {currentPlayer.current_box && (
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor:
                        currentPlayer.current_box.next_box_status === 'continue'
                          ? '#10b981' + '20'
                          : currentPlayer.current_box.next_box_status === 'stop'
                          ? '#ef4444' + '20'
                          : colors.text + '10',
                      borderWidth: 1,
                      borderColor:
                        currentPlayer.current_box.next_box_status === 'continue'
                          ? '#10b981'
                          : currentPlayer.current_box.next_box_status === 'stop'
                          ? '#ef4444'
                          : colors.text + '30',
                    },
                  ]}
                >
                  <IconSymbol
                    name={
                      currentPlayer.current_box.next_box_status === 'continue'
                        ? 'checkmark.circle.fill'
                        : currentPlayer.current_box.next_box_status === 'stop'
                        ? 'xmark.circle.fill'
                        : 'questionmark.circle.fill'
                    }
                    size={12}
                    color={
                      currentPlayer.current_box.next_box_status === 'continue'
                        ? '#10b981'
                        : currentPlayer.current_box.next_box_status === 'stop'
                        ? '#ef4444'
                        : colors.text
                    }
                  />
                  <ThemedText
                    style={[
                      styles.statusPillText,
                      {
                        color:
                          currentPlayer.current_box.next_box_status === 'continue'
                            ? '#10b981'
                            : currentPlayer.current_box.next_box_status === 'stop'
                            ? '#ef4444'
                            : colors.text,
                      },
                    ]}
                  >
                    {currentPlayer.current_box.next_box_status === 'continue'
                      ? 'Réinscrit'
                      : currentPlayer.current_box.next_box_status === 'stop'
                      ? 'Arrêt'
                      : 'Indécis'}
                  </ThemedText>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Mon box */}
        {currentPlayer?.current_box && (
          <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={[styles.iconContainer, { backgroundColor: PRIMARY_COLOR + '20' }]}>
                  <IconSymbol name="square.grid.2x2.fill" size={20} color={PRIMARY_COLOR} />
                </View>
                <ThemedText style={styles.cardTitle}>Mes matchs</ThemedText>
              </View>
              <TouchableOpacity onPress={handleViewBox}>
                <View style={styles.cardHeaderRight}>
                  <ThemedText style={[styles.boxNumber, { color: colors.text, opacity: 0.6 }]}>
                    {currentPlayer.current_box.box_name}
                  </ThemedText>
                  <IconSymbol name="chevron.right" size={16} color={colors.text + '40'} />
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.matchesList}>
              {boxMatches.map((item, index) => {
                console.log('[MES MATCHS DEBUG] Match:', {
                  matchId: item.match.id,
                  opponent: `${item.opponent.first_name} ${item.opponent.last_name}`,
                  delayedPlayerId: item.match.delayed_player_id,
                  delayedStatus: item.match.delayed_status,
                  delayedRequestedAt: item.match.delayed_requested_at,
                  delayedResolvedAt: item.match.delayed_resolved_at,
                  isCompleted: item.isCompleted,
                });
                
                return (
                <View key={item.match.id}>
                  <View
                    style={[
                      styles.matchItem,
                      index !== boxMatches.length - 1 && [
                        styles.matchItemBorder,
                        { borderBottomColor: colors.text + '30', borderBottomWidth: 1 },
                      ],
                    ]}
                  >
                    <TouchableOpacity 
                      style={styles.matchItemLeft}
                      onPress={() => {
                        setSelectedPlayerId(item.opponent.id);
                        setShowPlayerModal(true);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.smallAvatar, { backgroundColor: AVATAR_COLOR }]}>
                        <ThemedText style={styles.smallAvatarText}>
                          {getInitials(item.opponent.first_name, item.opponent.last_name)}
                        </ThemedText>
                      </View>
                      <View style={styles.matchItemInfo}>
                        <ThemedText style={styles.matchOpponentName}>
                          {item.opponent.first_name} {item.opponent.last_name}
                        </ThemedText>
                        {item.match.scheduled_at ? (() => {
                          const date = new Date(item.match.scheduled_at);
                          const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
                          const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
                          const day = days[date.getDay()];
                          const month = months[date.getMonth()];
                          const dayNumber = date.getDate();
                          const hours = date.getHours().toString().padStart(2, '0');
                          const minutes = date.getMinutes().toString().padStart(2, '0');
                          return (
                            <View style={styles.matchDateContainer}>
                              <ThemedText style={[styles.matchDate, { color: colors.text }]}>
                                {day} {dayNumber} {month}
                              </ThemedText>
                              <ThemedText style={[styles.matchTime, { color: colors.text, opacity: 0.5 }]}>
                                {' • '}{hours}:{minutes}
                              </ThemedText>
                            </View>
                          );
                        })() : (
                          <ThemedText style={[styles.matchDate, { color: colors.text, opacity: 0.5 }]}>
                            Date non définie
                          </ThemedText>
                        )}
                      </View>
                  </TouchableOpacity>
                  <View style={styles.matchItemRight}>
                    {item.isCompleted ? (
                      (() => {
                        const isPlayerA = item.match.player_a_id === currentPlayer.id;
                        const playerScore = isPlayerA ? item.match.score_a! : item.match.score_b!;
                        const opponentScore = isPlayerA ? item.match.score_b! : item.match.score_a!;
                        const isWin = playerScore > opponentScore;
                        const specialStatus = getMatchSpecialStatus(item.match, currentPlayer.id, isWin);
                        const scoreText = formatMatchScore(item.match, currentPlayer.id, playerScore, opponentScore);
                        
                        // Vérifier si le match a des points (a été joué)
                        const hasPoints = (item.match.points_a !== null && item.match.points_a !== undefined) ||
                                         (item.match.points_b !== null && item.match.points_b !== undefined);

                        return (
                          <View style={styles.scoreTagContainer}>
                            <View
                              style={[
                                styles.scoreTag,
                                { backgroundColor: specialStatus.backgroundColor },
                              ]}
                            >
                              <ThemedText
                                style={[
                                  styles.scoreTagText,
                                  { color: specialStatus.textColor },
                                ]}
                              >
                                {scoreText}
                              </ThemedText>
                            </View>
                          </View>
                        );
                      })()
                      ) : (
                        <View style={styles.matchItemRightContent}>
                          <View style={[styles.pendingTag, { backgroundColor: colors.text + '10' }]}>
                            <ThemedText style={[styles.pendingTagText, { color: colors.text, opacity: 0.6 }]}>
                              À venir
                            </ThemedText>
                          </View>
                          {renderDelayButtonInline(item.match, item.opponent) && (
                            <View style={styles.delayButtonWrapper}>
                              {renderDelayButtonInline(item.match, item.opponent)}
                            </View>
                          )}
                        </View>
                      )}
                  </View>
                </View>
                </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Mini classement du box */}
        {currentPlayer?.current_box && boxRanking.length > 0 && (
          <View style={[styles.rankingCard, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
            <View style={[styles.cardHeader, { marginBottom: 8 }]}>
              <View style={styles.cardHeaderLeft}>
                <View style={[styles.iconContainer, { backgroundColor: PRIMARY_COLOR + '20', width: 24, height: 24 }]}>
                  <IconSymbol name="trophy.fill" size={14} color={PRIMARY_COLOR} />
                </View>
                <ThemedText style={[styles.cardTitle, { fontSize: 15 }]}>Classement {currentPlayer.current_box.box_name}</ThemedText>
              </View>
            </View>
            
            <View style={styles.rankingList}>
              {/* Header */}
              <View style={[styles.rankingItem, styles.rankingHeader]}>
                <View style={styles.rankingPosition}>
                  <ThemedText style={[styles.rankingHeaderText, { color: colors.text, opacity: 0.6, fontSize: 10 }]}>
                    #
                  </ThemedText>
                </View>
                <View style={styles.rankingPlayerInfo}>
                  <ThemedText style={[styles.rankingHeaderText, { color: colors.text, opacity: 0.6, fontSize: 10 }]}>
                    Joueur
                  </ThemedText>
                </View>
                <View style={styles.rankingStats}>
                  <View style={styles.rankingStatsRow}>
                    <ThemedText style={[styles.rankingHeaderText, { color: colors.text, opacity: 0.6, fontSize: 10, minWidth: 20, textAlign: 'right' }]}>
                      M
                    </ThemedText>
                    <ThemedText style={[styles.rankingHeaderText, { color: colors.text, opacity: 0.6, fontSize: 10, minWidth: 20, textAlign: 'right' }]}>
                      {' '}V
                    </ThemedText>
                    <ThemedText style={[styles.rankingHeaderText, { color: colors.text, opacity: 0.6, fontSize: 10, minWidth: 20, textAlign: 'right' }]}>
                      {' '}D
                    </ThemedText>
                    <ThemedText style={[styles.rankingHeaderText, { color: colors.text, opacity: 0.6, fontSize: 10, minWidth: 25, textAlign: 'right' }]}>
                      {' '}pts
                    </ThemedText>
                  </View>
                </View>
              </View>
              
              {boxRanking.map((item, index) => {
                const isFirst = item.position === 1;
                const isLast = item.position === boxRanking.length;
                const isCurrentUser = item.player.id === currentPlayer.id;
                return (
                  <View
                    key={item.player.id}
                    style={[
                      styles.rankingItem,
                      index !== boxRanking.length - 1 && [
                        styles.rankingItemBorder,
                        { borderBottomColor: colors.text + '30', borderBottomWidth: 1 },
                      ],
                    ]}
                  >
                    <View style={styles.rankingPosition}>
                      <ThemedText style={[styles.rankingPositionText, { 
                        color: isFirst ? '#10b981' : isLast ? '#ef4444' : colors.text + '60',
                        fontSize: 11,
                      }]}>
                        #{item.position}
                      </ThemedText>
                    </View>
                    <View style={styles.rankingPlayerInfo}>
                      <ThemedText style={[styles.rankingPlayerName, { color: colors.text, fontSize: 12 }]} numberOfLines={1}>
                        {item.player.first_name} {item.player.last_name}
                      </ThemedText>
                    </View>
                    <View style={styles.rankingStats}>
                      <View style={styles.rankingStatsRow}>
                        <ThemedText style={[styles.rankingStatsText, { color: colors.text, opacity: 0.6, fontSize: 10, fontWeight: '500', minWidth: 20, textAlign: 'right' }]}>
                          {item.matches}
                        </ThemedText>
                        <ThemedText style={[styles.rankingStatsText, { color: '#10b981', fontSize: 10, fontWeight: '500', minWidth: 20, textAlign: 'right' }]}>
                          {item.wins}
                        </ThemedText>
                        <ThemedText style={[styles.rankingStatsText, { color: '#ef4444', fontSize: 10, fontWeight: '500', minWidth: 20, textAlign: 'right' }]}>
                          {item.losses}
                        </ThemedText>
                        <ThemedText style={[styles.rankingStatsText, { color: colors.text, fontSize: 10, fontWeight: '500', minWidth: 25, textAlign: 'right' }]}>
                          {item.points}
                        </ThemedText>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Feed d'actualité - Matchs des joueurs suivis */}
        {followedPlayersMatches.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={[styles.iconContainer, { backgroundColor: PRIMARY_COLOR + '20' }]}>
                  <IconSymbol name="sparkles" size={18} color={PRIMARY_COLOR} />
                </View>
                <ThemedText style={[styles.cardTitle, { fontSize: 15 }]}>Derniers matchs des joueurs suivis</ThemedText>
              </View>
            </View>

            <ActivityFeed
              matches={followedPlayersMatches}
              currentPlayerId={currentPlayer?.id}
              onPlayerPress={(playerId) => {
                setSelectedPlayerId(playerId);
                setShowPlayerModal(true);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              onReaction={handleReaction}
              reactions={matchReactions}
              userReactions={userReactions}
              onComment={handleComment}
              onLoadComments={handleLoadComments}
              onDeleteComment={handleDeleteComment}
            />
          </View>
        )}
        
        {followedPlayersMatches.length === 0 && currentPlayer && (
          <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
            <ThemedText style={[styles.emptyText, { color: colors.text, opacity: 0.6 }]}>
              Suivez des joueurs pour voir leurs matchs dans votre feed
            </ThemedText>
          </View>
        )}

        {/* Section Demandes de report */}
        {currentPlayer && boxMatches.length > 0 && (() => {
          console.log('[DELAY REQUESTS DEBUG] Total boxMatches:', boxMatches.length);
          console.log('[DELAY REQUESTS DEBUG] CurrentPlayer ID:', currentPlayer.id);
          
          // Récupérer toutes les demandes de report en cours qui concernent le joueur actuel
          const delayRequests = boxMatches
            .filter(item => {
              const match = item.match;
              const isPlayerA = match.player_a_id === currentPlayer.id;
              const opponentId = isPlayerA ? match.player_b_id : match.player_a_id;
              
              console.log('[DELAY REQUESTS DEBUG] Match:', {
                matchId: match.id,
                currentPlayerId: currentPlayer.id,
                playerAId: match.player_a_id,
                playerBId: match.player_b_id,
                delayedPlayerId: match.delayed_player_id,
                delayStatus: match.delayed_status,
                isPlayerA,
                opponentId,
              });
              
 
  
              const delayStatus = match.delayed_status;
              
              // Exclure les demandes acceptées, rejetées ou annulées
              // Une demande est en attente si :
              // - delayStatus est 'pending' OU
              // - delayStatus est null/undefined ET delayed_requested_at existe ET delayed_resolved_at n'existe pas
              const hasRequestedAt = !!match.delayed_requested_at;
              const hasResolvedAt = !!match.delayed_resolved_at;
              const isPending = delayStatus === 'pending' || 
                               (delayStatus === null && hasRequestedAt && !hasResolvedAt) ||
                               (!delayStatus && hasRequestedAt && !hasResolvedAt);
              
              console.log('[DELAY REQUESTS DEBUG] Delay status check:', {
                delayStatus,
                delayedRequestedAt: match.delayed_requested_at,
                delayedResolvedAt: match.delayed_resolved_at,
                hasRequestedAt,
                hasResolvedAt,
                isPending,
                willInclude: isPending,
              });
              
              // Inclure seulement les demandes en attente qui concernent le joueur actuel
              if (!isPending) {
                console.log('[DELAY REQUESTS DEBUG] Request is not pending (accepted/rejected/cancelled or no request), skipping');
                return false;
              }
              
              // Vérifier qu'il y a bien une demande (delayed_requested_at doit exister)
              if (!hasRequestedAt) {
                console.log('[DELAY REQUESTS DEBUG] No delayed_requested_at, skipping');
                return false;
              }
              
              return true;
            })
            .map(item => ({
              match: item.match,
              opponent: item.opponent,
            }));

          console.log('[DELAY REQUESTS DEBUG] Filtered delayRequests:', delayRequests.length);
          delayRequests.forEach((req, idx) => {
            console.log(`[DELAY REQUESTS DEBUG] Request ${idx + 1}:`, {
              matchId: req.match.id,
              opponent: `${req.opponent.first_name} ${req.opponent.last_name}`,
              delayedPlayerId: req.match.delayed_player_id,
              delayStatus: req.match.delayed_status,
            });
          });

          if (delayRequests.length === 0) {
            console.log('[DELAY REQUESTS DEBUG] No delay requests to display');
            return null;
          }
          
          console.log('[DELAY REQUESTS DEBUG] Displaying', delayRequests.length, 'delay requests');

          return (
            <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <View style={[styles.iconContainer, { backgroundColor: '#f59e0b' + '20' }]}>
                    <IconSymbol name="exclamationmark.triangle.fill" size={18} color="#f59e0b" />
                  </View>
                  <ThemedText style={styles.cardTitle}>Demandes de report</ThemedText>
                </View>
              </View>

              <View style={styles.delayRequestsList}>
                {delayRequests.map((delayItem, index) => (
                  <View
                    key={delayItem.match.id}
                    style={[
                      styles.delayRequestItem,
                      index !== delayRequests.length - 1 && [
                        styles.delayRequestItemBorder,
                        { borderBottomColor: colors.text + '30', borderBottomWidth: 1 },
                      ],
                    ]}
                  >
                    <View style={styles.delayRequestInfo}>
                      <View style={[styles.smallAvatar, { backgroundColor: AVATAR_COLOR }]}>
                        <ThemedText style={styles.smallAvatarText}>
                          {getInitials(delayItem.opponent.first_name, delayItem.opponent.last_name)}
                        </ThemedText>
                      </View>
                      <View style={styles.delayRequestDetails}>
                        <ThemedText style={styles.delayRequestOpponent}>
                          {delayItem.opponent.first_name} {delayItem.opponent.last_name}
                        </ThemedText>
                        {delayItem.match.scheduled_at ? (() => {
                          const date = new Date(delayItem.match.scheduled_at);
                          const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
                          const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
                          const day = days[date.getDay()];
                          const month = months[date.getMonth()];
                          const dayNumber = date.getDate();
                          const hours = date.getHours().toString().padStart(2, '0');
                          const minutes = date.getMinutes().toString().padStart(2, '0');
                          return (
                            <View style={styles.matchDateContainer}>
                              <ThemedText style={[styles.delayRequestDate, { color: colors.text }]}>
                                {day} {dayNumber} {month}
                              </ThemedText>
                              <ThemedText style={[styles.delayRequestTime, { color: colors.text, opacity: 0.5 }]}>
                                {' • '}{hours}:{minutes}
                              </ThemedText>
                            </View>
                          );
                        })() : (
                          <ThemedText style={[styles.delayRequestDate, { color: colors.text, opacity: 0.5 }]}>
                            Date non définie
                          </ThemedText>
                        )}
                      </View>
                    </View>
                    <View style={styles.delayRequestActions}>
                      {renderDelayActions(delayItem.match, delayItem.opponent)}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          );
        })()}

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
  welcomeHeader: {
    padding: 16,
    borderRadius: 16,
  },
  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  welcomeTopSection: {
    marginBottom: 16,
  },
  welcomeGreeting: {
    fontSize: 24,
    fontWeight: '700',
  },
  welcomeSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    textTransform: 'capitalize',
  },
  welcomeName: {
    fontSize: 24,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  boxPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  boxPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  nextMatchCompact: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    gap: 8,
    minWidth: 0,
  },
  nextMatchCompactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  nextMatchCompactTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  nextMatchCompactContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nextMatchCompactAvatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  nextMatchCompactInfo: {
    flex: 1,
    minWidth: 0,
  },
  nextMatchCompactName: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  nextMatchCompactDate: {
    fontSize: 11,
    fontWeight: '400',
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  rankingCard: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  boxNumber: {
    fontSize: 15,
    fontWeight: '500',
    marginRight: 8,
  },
  matchContent: {
    gap: 12,
  },
  matchOpponent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  opponentInfo: {
    flex: 1,
  },
  opponentName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '500',
  },
  matchActions: {
    marginTop: 12,
    gap: 12,
  },
  contactActions: {
    flexDirection: 'row',
    gap: 6,
  },
  contactButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  contactButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  delayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  delayButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  delayButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  delayButtonTextSmall: {
    fontSize: 11,
    fontWeight: '500',
  },
  delayStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  delayStatusText: {
    fontSize: 11,
    fontWeight: '500',
  },
  delayActions: {
    gap: 8,
  },
  delayRequestText: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 4,
  },
  delayButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  delayButtonAccept: {
    flex: 1,
  },
  delayButtonReject: {
    flex: 1,
  },
  delayButtonCancel: {
    width: '100%',
  },
  matchDelayActions: {
    marginTop: 8,
    paddingTop: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  delayRequestsList: {
    gap: 0,
  },
  delayRequestItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  delayRequestItemBorder: {
    borderBottomWidth: 1,
  },
  rankingList: {
    gap: 0,
  },
  rankingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    gap: 8,
  },
  rankingHeader: {
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  rankingHeaderText: {
    fontSize: 10,
    fontWeight: '600',
  },
  rankingItemBorder: {
    borderBottomWidth: 1,
  },
  rankingPosition: {
    minWidth: 28,
    alignItems: 'flex-start',
  },
  rankingPositionText: {
    fontSize: 11,
    fontWeight: '600',
  },
  rankingPlayerInfo: {
    flex: 1,
    minWidth: 0,
  },
  rankingPlayerName: {
    fontSize: 12,
    fontWeight: '400',
  },
  rankingStats: {
    minWidth: 80,
    alignItems: 'flex-end',
  },
  rankingStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankingStatsText: {
    fontSize: 10,
    fontWeight: '500',
  },
  delayRequestInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  delayRequestDetails: {
    flex: 1,
    marginLeft: 12,
  },
  delayRequestOpponent: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  delayRequestDate: {
    fontSize: 13,
    fontWeight: '400',
  },
  delayRequestTime: {
    fontSize: 13,
    fontWeight: '400',
  },
  matchDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  matchTime: {
    fontSize: 13,
    fontWeight: '400',
  },
  delayRequestActions: {
    marginTop: 8,
  },
  noMatch: {
    fontSize: 15,
    textAlign: 'center',
    opacity: 0.6,
  },
  matchesList: {
    gap: 0,
  },
  matchItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  matchItemBorder: {
    borderBottomWidth: 1,
  },
  matchItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  smallAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  smallAvatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  matchItemInfo: {
    flex: 1,
  },
  matchOpponentName: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  matchDate: {
    fontSize: 12,
    fontWeight: '400',
  },
  matchItemRight: {
    marginLeft: 8,
  },
  matchItemRightContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  delayButtonWrapper: {
    marginLeft: 4,
  },
  scoreTagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scoreTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  shareButtonSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreTagText: {
    fontSize: 13,
    fontWeight: '600',
  },
  pendingTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pendingTagText: {
    fontSize: 12,
    fontWeight: '500',
  },
  // Styles pour la vue publique - Design moderne
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  logoContainer: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#000',
    letterSpacing: -1,
  },
  heroTitle: {
    fontSize: 25,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: 0,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  ctaSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 36,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 0.3,
  },
  ctaSubtext: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 32,
  },
  featureCard: {
    width: '47%',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  featureIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  featureCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  featureCardDescription: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 18,
  },
  infoSection: {
    flexDirection: 'row',
    padding: 20,
    borderRadius: 16,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  infoDescription: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  // Styles pour la vue file d'attente
  infoIconContainer: {
    alignSelf: 'center',
    marginBottom: 16,
  },
  statusIconContainer: {
    alignSelf: 'center',
    marginBottom: 16,
  },
  waitingTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  waitingDescription: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  boxInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 6,
  },
  inputHelper: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  joinButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  positionInfo: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginVertical: 20,
  },
  positionBadge: {
    alignItems: 'center',
  },
  positionNumber: {
    fontSize: 25,
    fontWeight: '800',
    marginBottom: 4,
  },
  positionLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  leaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  leaveButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  waitingListContainer: {
    marginTop: 12,
  },
  waitingListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderRadius: 8,
  },
  waitingListItemLast: {
    borderBottomWidth: 0,
  },
  waitingListLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  waitingListPosition: {
    fontSize: 16,
    fontWeight: '700',
    minWidth: 32,
  },
  waitingListInfo: {
    flex: 1,
  },
  waitingListText: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  waitingListBox: {
    fontSize: 13,
    fontWeight: '500',
  },
  waitingListDate: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
});

