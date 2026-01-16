import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, RefreshControl, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ProfileScreen from '@/app/(tabs)/profil';
import { AppBar } from '@/components/app-bar';
import { AuthModal } from '@/components/auth-modal';
import { PlayerChatModal } from '@/components/player-chat-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/services/api';
import type { MatchDTO, PlayerDTO, WaitingListEntryDTO } from '@/types/api';
import { formatMatchScore, getMatchSpecialStatus } from '@/utils/match-helpers';
import { getDefaultSeason, getSeasonFromBoxMembership } from '@/utils/season-helpers';

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
  const { notifications } = useNotifications();
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
  const [showDelayConfirmModal, setShowDelayConfirmModal] = useState(false);
  const [pendingDelayMatchId, setPendingDelayMatchId] = useState<string | null>(null);
  const [showChatModal, setShowChatModal] = useState(false);
  const [selectedPlayerForChat, setSelectedPlayerForChat] = useState<{ id: string; name: string; matchId?: string } | null>(null);
  const [boxRanking, setBoxRanking] = useState<Array<{
    player: PlayerDTO;
    points: number;
    wins: number;
    losses: number;
    matches: number;
    position: number;
  }>>([]);
  const [lastFocusTime, setLastFocusTime] = useState<number>(0);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!isAuthenticated || !user) {
      setLoading(false);
      return;
    }
    
    try {
      if (!isRefresh) {
        setLoading(true);
      }
      
      // 1. Trouver le joueur par email
      let player: PlayerDTO | undefined;
      let players: PlayerDTO[];
      
      // Si on a déjà le joueur en cache et c'est un refresh, utiliser son box_id directement
      if (isRefresh && currentPlayer?.current_box?.box_id) {
        // Recharger uniquement les joueurs du box du joueur
        players = await api.getPlayersCached(true, currentPlayer.current_box.box_id);
        // Le joueur actuel devrait être dans cette liste
        player = players.find((p) => p.id === currentPlayer.id) || currentPlayer;
      } else {
        // Premier chargement ou pas de box : charger tous les joueurs
        // Forcer le refresh pour s'assurer d'avoir les données à jour (notamment après inscription)
        players = await api.getPlayersCached(isRefresh);
        player = players.find((p) => p.email?.toLowerCase() === user.email.toLowerCase());
      }
      
      if (!player) {
        // Si le joueur n'est pas trouvé, essayer de recharger depuis l'API directement
        console.warn('Joueur non trouvé dans le cache, tentative de rechargement...');
        try {
          api.clearPlayersCache();
          players = await api.getPlayersCached(true);
          player = players.find((p) => p.email?.toLowerCase() === user.email.toLowerCase());
        } catch (retryError) {
          console.error('Erreur lors du rechargement:', retryError);
        }
        
        if (!player) {
          Alert.alert('Erreur', 'Joueur non trouvé dans la base de données');
          return;
        }
      }
      
      setCurrentPlayer(player);
      setAllPlayers(players); // Sauvegarder les joueurs (filtrés ou non selon le cas)
      
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
      // Pour la page d'accueil, utiliser la saison du box où le joueur a un membership
      const seasons = await api.getSeasonsCached(isRefresh);
      const currentSeason = getSeasonFromBoxMembership(player, seasons) || getDefaultSeason(seasons);
      
      if (!currentSeason) return;
      
      // 3. Récupérer les matchs du joueur (filtrer par box_id si le joueur a un box pour réduire la taille)
      const boxId = player.current_box?.box_id;
      const matches = await api.getMatches(currentSeason.id, boxId);

      console.log('boxId', boxId) 
      console.log(currentSeason)
      console.log('matches', matches)

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
          .slice(0, 6); // Top 5 seulement
        
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
  }, [user, isAuthenticated]);

  useEffect(() => {
    // Toujours charger avec refresh au premier chargement pour éviter les problèmes de cache
    if (isAuthenticated && user) {
      loadData(true);
    } else {
      // Réinitialiser l'état si on n'est plus connecté
      setCurrentPlayer(null);
      setLoading(false);
    }
  }, [loadData, isAuthenticated, user]);

  // Recharger les données quand on revient sur l'onglet (pour mettre à jour après modification du profil)
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      // Recharger seulement si on n'a pas rechargé récemment (évite les rechargements trop fréquents)
      // ou si le cache a été invalidé (détecté par le fait qu'on revient après un délai)
      if (now - lastFocusTime > 1000 || lastFocusTime === 0) {
        setLastFocusTime(now);
        // Recharger avec refresh pour avoir les données à jour (notamment après modification de membership)
        loadData(true);
      }
    }, [loadData, lastFocusTime])
  );

  const handleRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    // loadData(true) va déjà forcer le refresh des caches avec isRefresh=true
    await loadData(true);
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
    } finally {
      setShowDelayConfirmModal(false);
      setPendingDelayMatchId(null);
    }
  };

  const handleRequestDelayPress = (matchId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingDelayMatchId(matchId);
    setShowDelayConfirmModal(true);
  };

  const confirmRequestDelay = () => {
    if (pendingDelayMatchId) {
      handleRequestDelay(pendingDelayMatchId);
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
          style={styles.delayButtonIconOnly}
          onPress={() => handleRequestDelayPress(match.id)}
          activeOpacity={0.6}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSymbol name="calendar.badge.exclamationmark" size={14} color="#f59e0b" />
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
        <AppBar />
        <AuthModal visible={showAuthModal} onClose={() => setShowAuthModal(false)} />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top - 30, paddingBottom: 30 },
          ]}
          showsVerticalScrollIndicator={false}
        >


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
      <AppBar />
      <AuthModal visible={showAuthModal} onClose={() => setShowAuthModal(false)} />
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
        {/* Mon box */}
        {currentPlayer?.current_box && (
          <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={[styles.iconContainer, { backgroundColor: PRIMARY_COLOR + '20', width: 24, height: 24 }]}>
                  <IconSymbol name="square.grid.2x2.fill" size={16} color={PRIMARY_COLOR} />
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
                return (
                  <View
                    key={item.match.id}
                    style={[
                      styles.matchItem,
                      index !== boxMatches.length - 1 && [
                        styles.matchItemBorder,
                        { borderBottomColor: colors.text + '15', borderBottomWidth: 1 },
                      ],
                    ]}
                  >
                    <View style={styles.matchItemContent}>
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
                        <View style={styles.matchItemRightContent}>
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
                              // Afficher les chips de statut de report si nécessaire
                              (() => {
                                const delayStatus = item.match.delayed_status;
                                const delayedRequestedBy = item.match.delayed_requested_by;
                                const isCurrentPlayerRequesting = delayedRequestedBy === currentPlayer.id;
                                
                                if (delayStatus === 'pending' && delayedRequestedBy) {
                                  return (
                                    <View style={[styles.pendingTag, { 
                                      backgroundColor: isCurrentPlayerRequesting ? '#FFA50015' : '#FFA50015',
                                    }]}>
                                      <ThemedText style={[styles.pendingTagText, { 
                                        color: isCurrentPlayerRequesting ? '#FFA500' : '#FFA500',
                                      }]}>
                                        {isCurrentPlayerRequesting ? 'Rep. demandé' : 'Rep. attente'}
                                      </ThemedText>
                                    </View>
                                  );
                                }
                                
                                // Ne rien afficher si pas de statut
                                return null;
                              })()
                            )}
                          {/* Boutons d'action compacts */}
                          <View style={styles.matchActionsCompact}>
                            {(() => {
                              // Vérifier s'il y a des messages non lus pour cette conversation
                              const hasUnreadMessages = notifications.some(
                                (notif) =>
                                  !notif.read &&
                                  notif.data?.entity_id === item.match.id
                              );

                              return (
                                <TouchableOpacity
                                  onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    setSelectedPlayerForChat({
                                      id: item.opponent.id,
                                      name: `${item.opponent.first_name} ${item.opponent.last_name}`,
                                      matchId: item.match.id,
                                    });
                                    setShowChatModal(true);
                                  }}
                                  style={styles.matchActionIconButton}
                                  activeOpacity={0.7}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <View style={styles.chatButtonContainer}>
                                    <IconSymbol name="bubble.left.and.bubble.right.fill" size={18} color={colors.text + 'CC'} />
                                    {hasUnreadMessages && (
                                      <View style={[styles.unreadBadge, { backgroundColor: '#ef4444' }]} />
                                    )}
                                  </View>
                                </TouchableOpacity>
                              );
                            })()}
                          </View>
                        </View>
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

        {/* Section Demandes de report */}
        {currentPlayer && boxMatches.length > 0 && (() => {

          // Récupérer toutes les demandes de report en cours qui concernent le joueur actuel
          const delayRequests = boxMatches
            .filter(item => {
              const match = item.match;
              const isPlayerA = match.player_a_id === currentPlayer.id;
              const opponentId = isPlayerA ? match.player_b_id : match.player_a_id;

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
              

              // Inclure seulement les demandes en attente qui concernent le joueur actuel
              if (!isPending) {
                return false;
              }
              
              // Vérifier qu'il y a bien une demande (delayed_requested_at doit exister)
              if (!hasRequestedAt) {
                return false;
              }
              
              return true;
            })
            .map(item => ({
              match: item.match,
              opponent: item.opponent,
            }));

          if (delayRequests.length === 0) {
            return null;
          }
     
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
          onStartChat={(playerId: string, playerName: string) => {
            setShowPlayerModal(false);
            setSelectedPlayerId(null);
            setSelectedPlayerForChat({ id: playerId, name: playerName });
            setShowChatModal(true);
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
          matchId={selectedPlayerForChat.matchId || undefined}
          onClose={() => {
            setShowChatModal(false);
            setSelectedPlayerForChat(null);
          }}
        />
      )}

      {/* Modal de confirmation pour le report */}
      <Modal
        visible={showDelayConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowDelayConfirmModal(false);
          setPendingDelayMatchId(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.confirmModal, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
            <View style={styles.confirmModalHeader}>
              <View style={[styles.confirmModalIconContainer, { backgroundColor: '#f59e0b' + '20' }]}>
                <IconSymbol name="exclamationmark.triangle.fill" size={24} color="#f59e0b" />
              </View>
              <ThemedText style={styles.confirmModalTitle}>Reporter le match ?</ThemedText>
            </View>
            
            <ThemedText style={[styles.confirmModalMessage, { color: colors.text + '80' }]}>
              Êtes-vous sûr de vouloir reporter ce match ? Une demande sera envoyée à votre adversaire.
            </ThemedText>

            <View style={styles.confirmModalActions}>
              <TouchableOpacity
                style={[styles.confirmModalButton, styles.confirmModalButtonCancel, { borderColor: colors.text + '20' }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowDelayConfirmModal(false);
                  setPendingDelayMatchId(null);
                }}
                activeOpacity={0.7}
              >
                <ThemedText style={[styles.confirmModalButtonText, { color: colors.text }]}>
                  Annuler
                </ThemedText>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.confirmModalButton, styles.confirmModalButtonConfirm, { backgroundColor: '#f59e0b' }]}
                onPress={confirmRequestDelay}
                activeOpacity={0.8}
              >
                <ThemedText style={[styles.confirmModalButtonText, { color: '#000' }]}>
                  Confirmer
                </ThemedText>
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
    padding: 14,
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
    marginBottom: 8,
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
  delayButtonIconOnly: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
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
    marginTop: 1,
  },
  matchTime: {
    fontSize: 11,
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
    paddingVertical: 12,
  },
  matchItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  matchItemBorder: {
    borderBottomWidth: 1,
  },
  matchItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  smallAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  smallAvatarText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  matchItemInfo: {
    flex: 1,
  },
  matchOpponentName: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 0,
  },
  matchDate: {
    fontSize: 11,
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
  matchActionsCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  matchActionIconButton: {
    padding: 6,
    borderRadius: 8,
  },
  chatButtonContainer: {
    position: 'relative',
  },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#fff',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmModal: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  confirmModalHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  confirmModalIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  confirmModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  confirmModalMessage: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  confirmModalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmModalButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmModalButtonCancel: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  confirmModalButtonConfirm: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  confirmModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

