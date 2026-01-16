import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBar } from '@/components/app-bar';
import { AuthModal } from '@/components/auth-modal';
import { PlayerAvatar } from '@/components/player-avatar';
import { EditProfileForm } from '@/components/profile/edit-profile-form';
import { ReactionAnimation } from '@/components/reaction-animation';
import { ReactionsDisplay } from '@/components/reactions-display';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useImagePicker } from '@/hooks/use-image-picker';
import { api } from '@/services/api';
import type { MatchCommentDTO, PlayerDTO } from '@/types/api';
import { formatMatchScore, getMatchSpecialStatus, isSpecialCaseMatch } from '@/utils/match-helpers';
import { getSeasonFromBoxMembership, getDefaultSeason } from '@/utils/season-helpers';

// Couleur d'avatar sobre
const AVATAR_COLOR = '#9ca3af';

const REACTIONS = [
  { emoji: '❤️', name: 'heart' },
  { emoji: '🔥', name: 'fire' },
  { emoji: '👏', name: 'clap' },
  { emoji: '👍', name: 'thumbs_up' },
  { emoji: '👎', name: 'thumbs_down' },
  { emoji: '😢', name: 'sad' },
];
const getInitials = (name: string): string => {
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

const formatDate = (date: Date): string => {
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  
  const day = days[date.getDay()];
  const month = months[date.getMonth()];
  const dayNumber = date.getDate();
  const year = date.getFullYear();

  return `${day} ${dayNumber} ${month} ${year}`;
};

const formatCommentDate = (date: Date): string => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'À l\'instant';
  if (minutes < 60) return `Il y a ${minutes} min`;
  if (hours < 24) return `Il y a ${hours}h`;
  if (days < 7) return `Il y a ${days}j`;
  
  const daysOfWeek = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  return `${daysOfWeek[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
};

type SortOption = 'date' | 'score' | 'opponent';
type SortDirection = 'asc' | 'desc';
type FilterOption = 'all' | 'won' | 'lost';

interface ProfileScreenProps {
  isModal?: boolean;
  playerId?: string;
  onClose?: () => void;
  onStartChat?: (playerId: string, playerName: string) => void;
}

export default function ProfileScreen({ isModal = false, playerId, onClose, onStartChat }: ProfileScreenProps = {}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { user, logout, isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerDTO | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowingLoading, setIsFollowingLoading] = useState(false);
  const [followingPlayers, setFollowingPlayers] = useState<PlayerDTO[]>([]);
  const [followersPlayers, setFollowersPlayers] = useState<PlayerDTO[]>([]);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [followingModalType, setFollowingModalType] = useState<'following' | 'followers'>('following');
  const [stats, setStats] = useState({ wins: 0, losses: 0, winRate: 0 });
  const [advancedStats, setAdvancedStats] = useState({
    currentStreak: { type: 'win' as 'win' | 'loss', count: 0 },
    bestStreak: { type: 'win' as 'win' | 'loss', count: 0, matches: [] as any[] },
    worstStreak: { type: 'loss' as 'win' | 'loss', count: 0, matches: [] as any[] },
    bestOpponent: { name: '', winRate: 0, matches: 0, wins: 0, losses: 0, matchList: [] as any[], player: null as PlayerDTO | null },
    worstOpponent: { name: '', winRate: 0, matches: 0, wins: 0, losses: 0, matchList: [] as any[], player: null as PlayerDTO | null },
    rival: { name: '', matches: 0, wins: 0, losses: 0, matchList: [] as any[], player: null as PlayerDTO | null },
    totalPoints: 0,
    rankingPosition: 0,
    form: [] as Array<'win' | 'loss' | 'draw'>,
  });
  const [nextMatch, setNextMatch] = useState<{
    match: any; // MatchDTO
    opponent: PlayerDTO;
  } | null>(null);
  const [matchDetailsModal, setMatchDetailsModal] = useState<{
    visible: boolean;
    title: string;
    matches: Array<{
      match: any; // MatchDTO
      opponent: string;
      score: string;
      date: Date;
      won: boolean;
    }>;
  }>({
    visible: false,
    title: '',
    matches: [],
  });
  const [recentMatches, setRecentMatches] = useState<Array<{
    matchData: any; // MatchDTO complet pour accéder aux IDs spéciaux
    opponent: string;
    score: string;
    won: boolean;
    date: Date;
  }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [matchReactions, setMatchReactions] = useState<{ [matchId: string]: { [reaction: string]: number } }>({});
  const [userReactions, setUserReactions] = useState<{ [matchId: string]: string | null }>({});
  const [matchComments, setMatchComments] = useState<{ [matchId: string]: MatchCommentDTO[] }>({});
  const [commentTexts, setCommentTexts] = useState<{ [matchId: string]: string }>({});
  const [postingComment, setPostingComment] = useState<Set<string>>(new Set());
  const [showCommentInput, setShowCommentInput] = useState<Set<string>>(new Set());
  const [showReactionsPicker, setShowReactionsPicker] = useState<Set<string>>(new Set());
  const [activeAnimations, setActiveAnimations] = useState<{ [matchId: string]: string | null }>({});
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [reactionPlayersModal, setReactionPlayersModal] = useState<{
    visible: boolean;
    entityType: 'match';
    entityId: string;
  } | null>(null);
  const [reactionPlayersByType, setReactionPlayersByType] = useState<{ [reactionType: string]: PlayerDTO[] }>({});
  const [loadingReactionPlayers, setLoadingReactionPlayers] = useState(false);
  const [editForm, setEditForm] = useState({
    email: '',
    phone: '',
    schedulePreference: 'peu_importe' as 'tot' | 'tard' | 'peu_importe',
  });
  const { image: newProfileImage, pickImage, clearImage } = useImagePicker();

  const handleToggleFollow = async () => {
    if (!user || !currentPlayer || currentPlayer.id === user.id) return;
    
    // Trouver le joueur actuel (celui qui est connecté)
    const players = await api.getPlayersCached();
    const currentUserPlayer = players.find((p) => p.email?.toLowerCase() === user.email.toLowerCase());
    if (!currentUserPlayer) {
      Alert.alert('Erreur', 'Joueur non trouvé');
      return;
    }
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsFollowingLoading(true);
    
    try {
      if (isFollowing) {
        await api.unfollowPlayer(currentPlayer.id, currentUserPlayer.id);
        setIsFollowing(false);
        // Mettre à jour la liste des joueurs suivis si on est sur notre propre profil
        if (currentPlayer.id === user.id) {
          const following = await api.getFollowing(currentUserPlayer.id);
          setFollowingPlayers(following);
        }
      } else {
        await api.followPlayer(currentPlayer.id, currentUserPlayer.id);
        setIsFollowing(true);
        // Mettre à jour la liste des joueurs suivis si on est sur notre propre profil
        if (currentPlayer.id === user.id) {
          const following = await api.getFollowing(currentUserPlayer.id);
          setFollowingPlayers(following);
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error('Erreur follow/unfollow:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erreur', error.message || 'Impossible de modifier le suivi');
    } finally {
      setIsFollowingLoading(false);
    }
  };

  const handleUnfollowPlayer = async (playerToUnfollow: PlayerDTO) => {
    if (!user || !currentPlayer) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      await api.unfollowPlayer(playerToUnfollow.id, currentPlayer.id);
      
      // Mettre à jour la liste des joueurs suivis
      setFollowingPlayers(prev => prev.filter(p => p.id !== playerToUnfollow.id));
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error('Erreur unfollow:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erreur', error.message || 'Impossible de retirer le suivi');
    }
  };

  const loadData = useCallback(async () => {
    // En mode modal, on charge le joueur spécifié
    if (isModal && playerId) {
      try {
        setLoading(true);
        const players = await api.getPlayersCached();
        const player = players.find((p) => p.id === playerId);
        if (!player) {
          setLoading(false);
          return;
        }
        setCurrentPlayer(player);
        // Continuer avec le chargement des données pour ce joueur
      } catch (err) {
        console.error('Erreur lors du chargement du joueur:', err);
        setLoading(false);
        return;
      }
    }
    
    // Mode normal : nécessite authentification
    if (!isModal && (!isAuthenticated || !user)) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      
      // 1. Trouver le joueur
      const players = await api.getPlayersCached();
      let player: PlayerDTO | undefined;
      
      if (isModal && playerId) {
        player = players.find((p) => p.id === playerId);
      } else if (!isModal && user) {
        player = players.find((p) => p.email?.toLowerCase() === user.email.toLowerCase());
      }
      
      if (!player) {
        setLoading(false);
        return;
      }
      
      setCurrentPlayer(player);
      
      // Si c'est un autre joueur (pas le joueur connecté), vérifier le statut de suivi
      const currentUserPlayer = players.find((p) => p.email?.toLowerCase() === user?.email.toLowerCase());
      if (user && player && player.id !== user.id && currentUserPlayer) {
        try {
          const followStatus = await api.getFollowStatus(currentUserPlayer.id, player.id);
          setIsFollowing(followStatus.isFollowing);
        } catch (error) {
          console.error('Erreur chargement statut follow:', error);
          setIsFollowing(false);
        }
      }
      
      // Si c'est le profil de l'utilisateur connecté, charger les joueurs suivis et followers
      if (user && player && player.id === user.id && currentUserPlayer) {
        try {
          const following = await api.getFollowing(player.id);
          setFollowingPlayers(following);
          try {
            const followers = await api.getFollowers(player.id);
            setFollowersPlayers(followers);
          } catch (error) {
            console.error('Erreur chargement followers:', error);
            setFollowersPlayers([]);
          }
        } catch (error) {
          console.error('Erreur chargement joueurs suivis:', error);
          setFollowingPlayers([]);
          setFollowersPlayers([]);
        }
      } else {
        setFollowingPlayers([]);
        setFollowersPlayers([]);
      }
      
      // 2. Récupérer la saison en cours
      // Pour le profil, utiliser la saison du box où le joueur a un membership
      const seasons = await api.getSeasonsCached();
      const currentSeason = getSeasonFromBoxMembership(player, seasons) || getDefaultSeason(seasons);
      
      if (!currentSeason) return;
      
      // 3. Récupérer TOUS les matchs du joueur (toutes saisons confondues)
      const matches = await api.getMatches(undefined, undefined, player.id);
      const playerMatches = matches; // Déjà filtrés par player_id côté serveur
      
   
      // Filtrer uniquement les matchs VRAIMENT terminés pour les stats (avec score, pas 0-0, sans cas spéciaux)
      const completedMatchesForStats = playerMatches.filter(
        (m) => m.score_a !== null && 
               m.score_b !== null && 
               !(m.score_a === 0 && m.score_b === 0) &&
               !m.no_show_player_id && 
               !m.retired_player_id && 
               !m.delayed_player_id
      );

      // Calculer les stats
      let wins = 0;
      let losses = 0;
      
      completedMatchesForStats.forEach((match) => {
        const isPlayerA = match.player_a_id === player.id;
        const playerScore = isPlayerA ? match.score_a! : match.score_b!;
        const opponentScore = isPlayerA ? match.score_b! : match.score_a!;
        
        if (playerScore > opponentScore) {
          wins++;
        } else {
          losses++;
        }
      });
      
      const total = wins + losses;
      const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
      

      setStats({ wins, losses, winRate });
      
      // Calculer les statistiques avancées
      // 1. État de forme (5 derniers matchs sans incidents)
      const formMatches = completedMatchesForStats
        .sort((a, b) => {
          const dateA = a.played_at ? new Date(a.played_at).getTime() : new Date(a.scheduled_at || 0).getTime();
          const dateB = b.played_at ? new Date(b.played_at).getTime() : new Date(b.scheduled_at || 0).getTime();
          return dateB - dateA; // Plus récent en premier
        })
        .slice(0, 5); // 5 derniers matchs
      
      const form: Array<'win' | 'loss'> = formMatches.map((match) => {
        const isPlayerA = match.player_a_id === player.id;
        const playerScore = isPlayerA ? match.score_a! : match.score_b!;
        const opponentScore = isPlayerA ? match.score_b! : match.score_a!;
        return playerScore > opponentScore ? 'win' : 'loss';
      });
      
      // 2. Série actuelle (win/loss streak)
      let currentStreak: { type: 'win' | 'loss', count: number } = { type: 'win', count: 0 };
      if (completedMatchesForStats.length > 0) {
        const sortedByDate = [...completedMatchesForStats].sort((a, b) => {
          const dateA = a.played_at ? new Date(a.played_at).getTime() : new Date(a.scheduled_at || 0).getTime();
          const dateB = b.played_at ? new Date(b.played_at).getTime() : new Date(b.scheduled_at || 0).getTime();
          return dateB - dateA; // Plus récent en premier
        });
        
        const mostRecent = sortedByDate[0];
        const isPlayerA = mostRecent.player_a_id === player.id;
        const playerScore = isPlayerA ? mostRecent.score_a! : mostRecent.score_b!;
        const opponentScore = isPlayerA ? mostRecent.score_b! : mostRecent.score_a!;
        const won = playerScore > opponentScore;
        
        currentStreak.type = won ? 'win' : 'loss';
        currentStreak.count = 1;
        
        for (let i = 1; i < sortedByDate.length; i++) {
          const match = sortedByDate[i];
          const isPlayerA2 = match.player_a_id === player.id;
          const playerScore2 = isPlayerA2 ? match.score_a! : match.score_b!;
          const opponentScore2 = isPlayerA2 ? match.score_b! : match.score_a!;
          const won2 = playerScore2 > opponentScore2;
          
          if ((won && won2) || (!won && !won2)) {
            currentStreak.count++;
          } else {
            break;
          }
        }
      }
      
      // 3. Meilleure série de victoires et pire série de défaites (sans incidents)
      let bestStreak: { type: 'win' | 'loss', count: number, matches: any[] } = { type: 'win', count: 0, matches: [] };
      let worstStreak: { type: 'win' | 'loss', count: number, matches: any[] } = { type: 'loss', count: 0, matches: [] };
      
      if (completedMatchesForStats.length > 0) {
        const sortedByDate = [...completedMatchesForStats].sort((a, b) => {
          const dateA = a.played_at ? new Date(a.played_at).getTime() : new Date(a.scheduled_at || 0).getTime();
          const dateB = b.played_at ? new Date(b.played_at).getTime() : new Date(b.scheduled_at || 0).getTime();
          return dateB - dateA; // Plus récent en premier
        });
        
        let currentWinStreak = 0;
        let currentLossStreak = 0;
        let maxWinStreak = 0;
        let maxLossStreak = 0;
        let currentWinStreakMatches: any[] = [];
        let currentLossStreakMatches: any[] = [];
        let bestWinStreakMatches: any[] = [];
        let worstLossStreakMatches: any[] = [];
        
        for (const match of sortedByDate) {
          const isPlayerA = match.player_a_id === player.id;
          const playerScore = isPlayerA ? match.score_a! : match.score_b!;
          const opponentScore = isPlayerA ? match.score_b! : match.score_a!;
          const won = playerScore > opponentScore;
          
          if (won) {
            currentWinStreak++;
            currentWinStreakMatches.push(match);
            currentLossStreak = 0;
            currentLossStreakMatches = [];
            if (currentWinStreak > maxWinStreak) {
              maxWinStreak = currentWinStreak;
              bestWinStreakMatches = [...currentWinStreakMatches];
            }
          } else {
            currentLossStreak++;
            currentLossStreakMatches.push(match);
            currentWinStreak = 0;
            currentWinStreakMatches = [];
            if (currentLossStreak > maxLossStreak) {
              maxLossStreak = currentLossStreak;
              worstLossStreakMatches = [...currentLossStreakMatches];
            }
          }
        }
        
        bestStreak = { type: 'win', count: maxWinStreak, matches: bestWinStreakMatches.reverse() }; // Plus ancien en premier
        worstStreak = { type: 'loss', count: maxLossStreak, matches: worstLossStreakMatches.reverse() };
      }
      
      // 2. Meilleur et pire adversaire
      const opponentStats = new Map<string, { wins: number, losses: number, matchList: any[], player: PlayerDTO }>();
      
      completedMatchesForStats.forEach((match) => {
        const isPlayerA = match.player_a_id === player.id;
        const opponentId = isPlayerA ? match.player_b_id : match.player_a_id;
        const opponent = players.find((p) => p.id === opponentId);
        if (!opponent) return;
        
        const opponentName = `${opponent.first_name} ${opponent.last_name}`;
        const playerScore = isPlayerA ? match.score_a! : match.score_b!;
        const opponentScore = isPlayerA ? match.score_b! : match.score_a!;
        const won = playerScore > opponentScore;
        
        if (!opponentStats.has(opponentName)) {
          opponentStats.set(opponentName, { wins: 0, losses: 0, matchList: [], player: opponent });
        }
        const stats = opponentStats.get(opponentName)!;
        stats.matchList.push(match);
        if (won) {
          stats.wins++;
        } else {
          stats.losses++;
        }
      });
      
      let bestOpponent = { name: '', winRate: 0, matches: 0, wins: 0, losses: 0, matchList: [] as any[], player: null as PlayerDTO | null };
      let worstOpponent = { name: '', winRate: 100, matches: 0, wins: 0, losses: 0, matchList: [] as any[], player: null as PlayerDTO | null };
      let rival = { name: '', matches: 0, wins: 0, losses: 0, matchList: [] as any[], player: null as PlayerDTO | null };
      
      opponentStats.forEach((stats, name) => {
        const total = stats.wins + stats.losses;
        if (total >= 2) { // Au moins 2 matchs pour être significatif
          const winRate = (stats.wins / total) * 100;
          if (winRate > bestOpponent.winRate) {
            bestOpponent = { name, winRate: Math.round(winRate), matches: total, wins: stats.wins, losses: stats.losses, matchList: stats.matchList, player: stats.player };
          }
          // Pour la bête noire : prioriser le nombre de défaites, puis le taux de victoire le plus bas, puis le plus de matchs
          const isWorse = 
            stats.losses > worstOpponent.losses || // Plus de défaites
            (stats.losses === worstOpponent.losses && winRate < worstOpponent.winRate) || // Même nombre de défaites mais pire taux
            (stats.losses === worstOpponent.losses && winRate === worstOpponent.winRate && total > worstOpponent.matches); // Même nombre de défaites et même taux mais plus de matchs
          
          if (isWorse) {
            worstOpponent = { name, winRate: Math.round(winRate), matches: total, wins: stats.wins, losses: stats.losses, matchList: stats.matchList, player: stats.player };
          }
        }
        
        // Rival : adversaire avec le plus grand nombre de matchs total
        if (total > rival.matches) {
          rival = { name, matches: total, wins: stats.wins, losses: stats.losses, matchList: stats.matchList, player: stats.player };
        }
      });
      
      // 3. Total de points (Golden Ranking) - calculer depuis toutes les saisons
      let totalPoints = 0;
      const allSeasons = await api.getSeasonsCached();
      const currentYear = new Date().getFullYear();
      
      for (const season of allSeasons) {
        const seasonYear = new Date(season.start_date).getFullYear();
        if (seasonYear === currentYear) {
          const seasonMatches = matches.filter((m) => {
            // Vérifier si le match appartient à cette saison (par date)
            const matchDate = m.played_at ? new Date(m.played_at) : new Date(m.scheduled_at || 0);
            const seasonStart = new Date(season.start_date);
            const seasonEnd = new Date(season.end_date);
            return matchDate >= seasonStart && matchDate <= seasonEnd;
          });
          
          seasonMatches.forEach((match) => {
            if (match.score_a !== null && match.score_b !== null && 
                !(match.score_a === 0 && match.score_b === 0) &&
                !match.no_show_player_id && !match.retired_player_id && !match.delayed_player_id) {
              const isPlayerA = match.player_a_id === player.id;
              const playerScore = isPlayerA ? match.score_a : match.score_b;
              const opponentScore = isPlayerA ? match.score_b : match.score_a;
              
              if (playerScore > opponentScore) {
                totalPoints += 3; // Victoire = 3 points
              } else if (playerScore === opponentScore) {
                totalPoints += 1; // Match nul = 1 point (si applicable)
              }
            }
          });
        }
      }
      
      // 4. Position dans le classement (calculer depuis le ranking)
      let rankingPosition = 0;
      try {
        const allPlayers = await api.getPlayersCached();
        // Calculer les points de tous les joueurs pour l'année en cours
        const playerRankings = await Promise.all(
          allPlayers.map(async (p) => {
            let points = 0;
            for (const season of allSeasons) {
              const seasonYear = new Date(season.start_date).getFullYear();
              if (seasonYear === currentYear) {
                const seasonMatches = matches.filter((m) => {
                  const matchDate = m.played_at ? new Date(m.played_at) : new Date(m.scheduled_at || 0);
                  const seasonStart = new Date(season.start_date);
                  const seasonEnd = new Date(season.end_date);
                  return matchDate >= seasonStart && matchDate <= seasonEnd;
                });
                
                seasonMatches.forEach((match) => {
                  if (match.score_a !== null && match.score_b !== null && 
                      !(match.score_a === 0 && match.score_b === 0) &&
                      !match.no_show_player_id && !match.retired_player_id && !match.delayed_player_id) {
                    const isPlayerA = match.player_a_id === p.id;
                    const playerScore = isPlayerA ? match.score_a : match.score_b;
                    const opponentScore = isPlayerA ? match.score_b : match.score_a;
                    
                    if (playerScore > opponentScore) {
                      points += 3;
                    } else if (playerScore === opponentScore) {
                      points += 1;
                    }
                  }
                });
              }
            }
            return { playerId: p.id, points };
          })
        );
        
        // Trier par points décroissants
        playerRankings.sort((a, b) => b.points - a.points);
        
        // Trouver la position du joueur
        const position = playerRankings.findIndex((r) => r.playerId === player.id);
        rankingPosition = position >= 0 ? position + 1 : 0;
      } catch (error) {
        console.error('Erreur calcul position ranking:', error);
      }
      
      setAdvancedStats({
        currentStreak,
        bestStreak,
        worstStreak,
        bestOpponent,
        worstOpponent,
        rival,
        totalPoints,
        rankingPosition,
        form,
      });
      
      // 4. Prochain match (à venir, non joué)
      const upcomingMatches = playerMatches.filter(
        (m) => {
          if (!m.scheduled_at) return false;
          if (new Date(m.scheduled_at) <= new Date()) return false;
          
          // Vérifier si le match a été joué ou a un cas spécial
          const hasScore = (m.score_a !== null && m.score_a !== undefined) || 
                          (m.score_b !== null && m.score_b !== undefined);
          const hasSpecialStatus = m.no_show_player_id || m.retired_player_id || m.delayed_player_id;
          
          return !hasScore && !hasSpecialStatus;
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
        } else {
          setNextMatch(null);
        }
      } else {
        setNextMatch(null);
      }
      
      // 5. Historique complet (matchs terminés + matchs remis)
      const completedMatchesForHistory = playerMatches.filter(
        (m) => {
          // Matchs avec score (terminés)
          const hasScore = m.score_a !== null && m.score_b !== null && !(m.score_a === 0 && m.score_b === 0);
          // Matchs remis (sans score mais avec delayed_player_id)
          const isDelayed = m.delayed_player_id !== null;
          // Blessures et absences (avec score ou sans)
          const hasSpecialStatus = m.no_show_player_id !== null || m.retired_player_id !== null;
          
          return hasScore || isDelayed || hasSpecialStatus;
        }
      );
      
      const sortedMatches = [...completedMatchesForHistory]
        .sort((a, b) => {
          const dateA = a.played_at ? new Date(a.played_at).getTime() : new Date(a.scheduled_at || 0).getTime();
          const dateB = b.played_at ? new Date(b.played_at).getTime() : new Date(b.scheduled_at || 0).getTime();
          return dateB - dateA;
        });
      

      const history = sortedMatches.map((match) => {
        const isPlayerA = match.player_a_id === player.id;
        const opponentId = isPlayerA ? match.player_b_id : match.player_a_id;
        const opponent = players.find((p) => p.id === opponentId);
        
        // Gérer les matchs sans score (remis, blessures, absences)
        const playerScore = (match.score_a !== null && match.score_b !== null) 
          ? (isPlayerA ? match.score_a : match.score_b)
          : 0;
        const opponentScore = (match.score_a !== null && match.score_b !== null)
          ? (isPlayerA ? match.score_b : match.score_a)
          : 0;
        
        const matchDate = match.played_at 
          ? new Date(match.played_at) 
          : (match.scheduled_at ? new Date(match.scheduled_at) : new Date());
        
        return {
          matchData: match, // Garder le match complet pour les cas spéciaux
          opponent: opponent ? `${opponent.first_name} ${opponent.last_name}` : 'Inconnu',
          score: `${playerScore}-${opponentScore}`,
          won: playerScore > opponentScore,
          date: matchDate,
        };
      });
 
      setRecentMatches(history);
      
      // Charger les réactions et commentaires pour tous les matchs (API unifiée)
      if (history.length > 0 && player) {
        const matchIds = history.map(m => m.matchData.id);
        try {
          // Utiliser l'API unifiée pour les réactions
          const entities = matchIds.map(id => ({ type: 'match' as const, id }));
          const reactionsData = await api.getReactions(entities, player.id);
          const reactionsMap: { [matchId: string]: { [reaction: string]: number } } = {};
          const userReactionsMap: { [matchId: string]: string | null } = {};
          
          Object.entries(reactionsData).forEach(([entityId, data]) => {
            reactionsMap[entityId] = data.reactions || {};
            userReactionsMap[entityId] = data.userReaction || null;
          });
          
          setMatchReactions(reactionsMap);
          setUserReactions(userReactionsMap);
        } catch (error) {
          console.error('Erreur chargement réactions:', error);
        }
        
        // Charger les commentaires en batch pour avoir les compteurs (API unifiée)
        try {
          const entities = matchIds.map(id => ({ type: 'match' as const, id }));
          const commentsData = await api.getCommentsBatch(entities, player.id);
          setMatchComments(commentsData);
        } catch (error) {
          console.error('Erreur chargement commentaires:', error);
        }
      }
    } catch (error) {
      console.error('Erreur chargement profil:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Déconnexion', 'Êtes-vous sûr ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Déconnexion',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(tabs)');
        },
      },
    ]);
  };

  const handleUpdateNextBoxStatus = async (status: string | null) => {
    if (!currentPlayer || !user || currentPlayer.id !== user.id) return; // Seulement pour le joueur connecté
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    try {
      setUpdatingStatus(true);
      try {
        await api.updatePlayerNextBoxStatus(currentPlayer.id, status);
      } catch (error) {
        Alert.alert('Erreur', 'Impossible de mettre à jour le statut');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      
      // Invalider le cache des joueurs pour que l'appbar se mette à jour
      api.clearPlayersCache();
      
      // Mettre à jour l'état local uniquement
      setCurrentPlayer({
        ...currentPlayer,
        current_box: currentPlayer.current_box ? {
          ...currentPlayer.current_box,
          next_box_status: status,
        } : null,
      });
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Erreur mise à jour statut:', error);
      Alert.alert('Erreur', 'Impossible de mettre à jour le statut');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleEditProfile = () => {
    if (!currentPlayer || !user || currentPlayer.id !== user.id) return; // Seulement pour le joueur connecté
    
    setEditForm({
      email: currentPlayer.email || '',
      phone: currentPlayer.phone || '',
      schedulePreference: (currentPlayer.schedule_preference || 'peu_importe') as 'tot' | 'tard' | 'peu_importe',
    });
    clearImage(); // Reset de l'image
    setIsEditingProfile(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleCancelEdit = () => {
    setIsEditingProfile(false);
    clearImage();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveProfile = async () => {
    if (!currentPlayer) return;
    
    // Validation
    if (!editForm.email.trim() || !editForm.email.includes('@')) {
      Alert.alert('Erreur', 'Veuillez entrer un email valide');
      return;
    }
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      setUpdatingStatus(true);
      await api.updatePlayerInfo(currentPlayer.id, {
        first_name: currentPlayer.first_name,
        last_name: currentPlayer.last_name,
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        schedule_preference: editForm.schedulePreference,
        profile_image: newProfileImage || undefined,
      });
      
      // Invalider le cache des joueurs pour que l'appbar se mette à jour
      api.clearPlayersCache();
      
      // Recharger les données
      await loadData();
      
      setIsEditingProfile(false);
      clearImage();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Succès', 'Profil mis à jour avec succès');
    } catch (error) {
      console.error('Erreur mise à jour profil:', error);
      Alert.alert('Erreur', 'Impossible de mettre à jour le profil');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const openMatchDetailsModal = (title: string, matches: any[], players: PlayerDTO[]) => {
    if (!currentPlayer) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const matchDetails = matches.map((match) => {
      const isPlayerA = match.player_a_id === currentPlayer.id;
      const opponentId = isPlayerA ? match.player_b_id : match.player_a_id;
      const opponent = players.find((p) => p.id === opponentId);
      
      const playerScore = isPlayerA ? match.score_a! : match.score_b!;
      const opponentScore = isPlayerA ? match.score_b! : match.score_a!;
      const matchDate = match.played_at 
        ? new Date(match.played_at) 
        : (match.scheduled_at ? new Date(match.scheduled_at) : new Date());
      
      return {
        match,
        opponent: opponent ? `${opponent.first_name} ${opponent.last_name}` : 'Inconnu',
        score: `${playerScore}-${opponentScore}`,
        date: matchDate,
        won: playerScore > opponentScore,
      };
    });
    
    setMatchDetailsModal({
      visible: true,
      title,
      matches: matchDetails,
    });
  };

  const closeMatchDetailsModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMatchDetailsModal({ visible: false, title: '', matches: [] });
  };

  const handleReaction = async (matchId: string, reaction: string) => {
    if (!currentPlayer) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Trouver l'emoji correspondant et lancer l'animation seulement si on ajoute une réaction (pas si on la retire)
    const currentReaction = userReactions[matchId];
    const newReaction = currentReaction === reaction ? null : reaction;
    
    if (newReaction) {
      const reactionEmoji = REACTIONS.find(r => r.name === newReaction);
      if (reactionEmoji) {
        // Lancer l'animation
        setActiveAnimations(prev => ({ ...prev, [matchId]: reactionEmoji.emoji }));
        // Retirer l'animation après qu'elle soit terminée
        setTimeout(() => {
          setActiveAnimations(prev => {
            const next = { ...prev };
            delete next[matchId];
            return next;
          });
        }, 900);
      }
    }
    
    try {
      // Utiliser l'API unifiée pour les réactions
      await api.reactToEntity('match', matchId, currentPlayer.id, newReaction);
      
      setUserReactions(prev => ({
        ...prev,
        [matchId]: newReaction,
      }));
      
      setMatchReactions(prev => {
        const current = prev[matchId] || {};
        const newCounts = { ...current };
        
        if (currentReaction && newCounts[currentReaction]) {
          newCounts[currentReaction] = Math.max(0, newCounts[currentReaction] - 1);
          if (newCounts[currentReaction] === 0) {
            delete newCounts[currentReaction];
          }
        }
        
        if (newReaction) {
          newCounts[newReaction] = (newCounts[newReaction] || 0) + 1;
        }
        
        return {
          ...prev,
          [matchId]: newCounts,
        };
      });
      
      // Le panneau de réactions est géré par le composant ReactionsDisplay
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error('Erreur réaction:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erreur', error.message || 'Impossible d\'ajouter la réaction');
    }
  };

  const handlePostComment = async (matchId: string) => {
    const text = commentTexts[matchId]?.trim();
    if (!text || !currentPlayer) return;

    setPostingComment(prev => new Set(prev).add(matchId));

    try {
      // Utiliser l'API unifiée pour les commentaires
      await api.addComment('match', matchId, currentPlayer.id, text);
      setCommentTexts(prev => {
        const next = { ...prev };
        delete next[matchId];
        return next;
      });
      
      const comments = await api.getComments('match', matchId);
      setMatchComments(prev => ({ ...prev, [matchId]: comments }));
      
      // Ne pas fermer le panneau de commentaires pour voir le nouveau commentaire
    } catch (error) {
      console.error('Erreur commentaire:', error);
      Alert.alert('Erreur', 'Impossible d\'ajouter le commentaire');
    } finally {
      setPostingComment(prev => {
        const next = new Set(prev);
        next.delete(matchId);
        return next;
      });
    }
  };


  const handleDeleteComment = async (commentId: string, matchId: string) => {
    if (!currentPlayer) return;
    
    Alert.alert(
      'Supprimer le commentaire',
      'Êtes-vous sûr de vouloir supprimer ce commentaire ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              // Utiliser l'API unifiée pour les commentaires
              await api.deleteComment(commentId, currentPlayer.id);
              
              // Mettre à jour les commentaires locaux
              setMatchComments(prev => ({
                ...prev,
                [matchId]: (prev[matchId] || []).filter(c => c.id !== commentId),
              }));
            } catch (error: any) {
              console.error('Erreur suppression commentaire:', error);
              Alert.alert('Erreur', error.message || 'Impossible de supprimer le commentaire');
            }
          },
        },
      ]
    );
  };


  // Filtrer et trier les matchs
  const filteredMatches = recentMatches
    .filter((match) => {
      // Filtre par recherche
      if (searchQuery && !match.opponent.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      
      // Filtre par résultat
      const isSpecialCase = isSpecialCaseMatch(match.matchData);
      
      // Si on filtre par victoires/défaites, exclure les cas spéciaux
      if (filterBy === 'won') {
        return !isSpecialCase && match.won;
      }
      if (filterBy === 'lost') {
        return !isSpecialCase && !match.won;
      }
      
      // Si filtre "tous", tout afficher
      return true;
    })
    .sort((a, b) => {
      let result = 0;
      switch (sortBy) {
        case 'date':
          result = a.date.getTime() - b.date.getTime();
          break;
        case 'opponent':
          result = a.opponent.localeCompare(b.opponent);
          break;
        case 'score':
          const [scoreA1, scoreA2] = a.score.split('-').map(Number);
          const [scoreB1, scoreB2] = b.score.split('-').map(Number);
          result = (scoreA1 - scoreA2) - (scoreB1 - scoreB2);
          break;
        default:
          return 0;
      }
      return sortDirection === 'desc' ? -result : result;
    });

  // Ne pas afficher un écran de chargement complet, on affichera un spinner discret dans le contenu

  // Vue publique (non connecté) - seulement si pas en mode modal
  if (!isModal && !isAuthenticated) {
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
        >
          {/* Avatar et invitation */}
          <View style={styles.profileHeader}>
            <View style={[styles.avatar, { backgroundColor: AVATAR_COLOR }]}>
              <IconSymbol name="person.fill" size={48} color="#FFFFFF" />
            </View>
            <ThemedText style={styles.profileName}>Connectez-vous</ThemedText>
              <ThemedText style={[styles.profilePhone, { color: colors.text + '60' }]}>
              Accédez à votre profil personnalisé
            </ThemedText>
          </View>

          {/* Carte d'invitation */}
          <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={[styles.iconContainer, { backgroundColor: PRIMARY_COLOR + '20' }]}>
                  <IconSymbol name="star.fill" size={16} color={PRIMARY_COLOR} />
                </View>
                <ThemedText style={styles.sectionTitle}>Fonctionnalités</ThemedText>
              </View>
            </View>
            
            <View style={styles.featuresList}>
              <View style={styles.featureItem}>
                <IconSymbol name="chart.bar.fill" size={20} color={PRIMARY_COLOR} />
                <ThemedText style={[styles.featureText, { color: colors.text }]}>
                  Statistiques détaillées
                </ThemedText>
              </View>
              <View style={styles.featureItem}>
                <IconSymbol name="list.bullet" size={20} color={PRIMARY_COLOR} />
                <ThemedText style={[styles.featureText, { color: colors.text }]}>
                  Historique complet de vos matchs
                </ThemedText>
              </View>
              <View style={styles.featureItem}>
                <IconSymbol name="calendar.badge.plus" size={20} color={PRIMARY_COLOR} />
                <ThemedText style={[styles.featureText, { color: colors.text }]}>
                  Export vers votre calendrier
                </ThemedText>
              </View>
              <View style={styles.featureItem}>
                <IconSymbol name="square.grid.2x2.fill" size={20} color={PRIMARY_COLOR} />
                <ThemedText style={[styles.featureText, { color: colors.text }]}>
                  Suivi de votre box et classement
                </ThemedText>
              </View>
            </View>
          </View>

          {/* Bouton de connexion */}
          <TouchableOpacity
            style={[styles.loginButton, { backgroundColor: PRIMARY_COLOR }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowAuthModal(true);
            }}
            activeOpacity={0.8}
          >
            <ThemedText style={styles.loginButtonText}>Se connecter</ThemedText>
            <IconSymbol name="arrow.right" size={20} color="#000" />
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </ThemedView>
    );
  }

  // Contenu du profil
  const profileContent = (
    <>
      {!isModal && <AppBar />}
      <AuthModal visible={showAuthModal} onClose={() => setShowAuthModal(false)} />
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.text + '80'} />
          <ThemedText style={[styles.loadingText, { color: colors.text, opacity: 0.5 }]}>
            Chargement...
          </ThemedText>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: isModal ? 20 : 20 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            !isModal ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.text + '80'}
                colors={[colors.text + '80']}
              />
            ) : undefined
          }
        >
          {/* Header avec profil */}
          <View style={[styles.profileHeader, isModal && styles.profileHeaderModal]}>
          {user && currentPlayer && user.id === currentPlayer.id && (
            <TouchableOpacity
              style={[styles.editIconButton, styles.editIconButtonLeft, { backgroundColor: colors.text + '08' }]}
              onPress={handleEditProfile}
              activeOpacity={0.7}
            >
              <IconSymbol name="pencil.circle.fill" size={28} color={colors.text} />
            </TouchableOpacity>
          )}
          {isModal && (
            <View style={[styles.modalHeaderButtons, { backgroundColor: colors.background }]}>
              {user && currentPlayer && user.id !== currentPlayer.id && onStartChat && (
                <TouchableOpacity
                  style={[styles.chatIconButton, { backgroundColor: PRIMARY_COLOR + '15' }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onStartChat(currentPlayer.id, `${currentPlayer.first_name} ${currentPlayer.last_name}`);
                  }}
                  activeOpacity={0.7}
                >
                  <IconSymbol name="bubble.left.and.bubble.right.fill" size={24} color={PRIMARY_COLOR} />
                </TouchableOpacity>
              )}
              {onClose && (
                <TouchableOpacity
                  style={[styles.chatIconButton, { backgroundColor: colors.text + '08' }]}
                  onPress={onClose}
                  activeOpacity={0.7}
                >
                  <IconSymbol name="xmark" size={24} color={colors.text} />
                </TouchableOpacity>
              )}
            </View>
          )}
          
          <PlayerAvatar
            firstName={currentPlayer?.first_name || user?.name.split(' ')[0] || 'User'}
            lastName={currentPlayer?.last_name || user?.name.split(' ')[1] || ''}
            pictureUrl={currentPlayer?.picture}
            size={isModal ? 70 : 80}
            backgroundColor={AVATAR_COLOR}
          />
          {currentPlayer && (
            <>




              <ThemedText style={[styles.profileName, isModal && styles.profileNameModal]}>
                {currentPlayer.first_name} {currentPlayer.last_name}
              </ThemedText>
              {currentPlayer.phone && (
                <ThemedText style={[styles.profilePhone, { color: colors.text, opacity: 0.6 }]}>
                  {currentPlayer.phone}
                </ThemedText>
              )}
              
              {/* Badges et bouton Follow sur une seule ligne */}
              <View style={[styles.badgesContainer, isModal && styles.badgesContainerModal]}>
                {currentPlayer.current_box && (
                  <View style={[styles.infoBadge, { backgroundColor: PRIMARY_COLOR + '15', borderColor: PRIMARY_COLOR + '40' }]}>
                    <IconSymbol name="square.grid.2x2.fill" size={12} color={PRIMARY_COLOR} />
                    <ThemedText style={[styles.infoBadgeText, { color: PRIMARY_COLOR }]}>
                      {currentPlayer.current_box.box_name}
                    </ThemedText>
                  </View>
                )}
                
                {advancedStats.rankingPosition > 0 && (
                  <TouchableOpacity
                    style={[styles.infoBadge, { backgroundColor: PRIMARY_COLOR + '15', borderColor: PRIMARY_COLOR + '40' }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push('/(tabs)/ranking');
                    }}
                    activeOpacity={0.7}
                  >
                    <IconSymbol name="trophy.fill" size={12} color={PRIMARY_COLOR} />
                    <ThemedText style={[styles.infoBadgeText, { color: PRIMARY_COLOR }]}>
                      #{advancedStats.rankingPosition}
                    </ThemedText>
                  </TouchableOpacity>
                )}
                
                {/* Bouton Follow/Unfollow (seulement en modal et si ce n'est pas le joueur actuel) */}
                {isModal && user && currentPlayer && currentPlayer.id && user.id && currentPlayer.id !== user.id && (
                  <TouchableOpacity
                    style={[
                      styles.followButton,
                      {
                        backgroundColor: isFollowing ? colors.text + '10' : PRIMARY_COLOR,
                        borderColor: isFollowing ? colors.text + '25' : PRIMARY_COLOR,
                      },
                    ]}
                    onPress={handleToggleFollow}
                    disabled={isFollowingLoading}
                    activeOpacity={0.7}
                  >
                    <IconSymbol 
                      name={isFollowing ? "person.badge.minus.fill" : "person.badge.plus.fill"} 
                      size={13} 
                      color={isFollowing ? colors.text : '#000'} 
                    />
                    <ThemedText style={[
                      styles.followButtonText,
                      { color: isFollowing ? colors.text : '#000' }
                    ]}>
                      {isFollowing ? 'Ne plus suivre' : 'Suivre'}
                    </ThemedText>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </View>

        {/* Modal d'édition du profil */}
        {isEditingProfile && currentPlayer && (
          <EditProfileForm
            firstName={currentPlayer.first_name}
            lastName={currentPlayer.last_name}
            email={editForm.email}
            phone={editForm.phone}
            pictureUrl={currentPlayer.picture}
            schedulePreference={editForm.schedulePreference}
            onEmailChange={(email) => setEditForm({ ...editForm, email })}
            onPhoneChange={(phone) => setEditForm({ ...editForm, phone })}
            onSchedulePreferenceChange={(pref) => setEditForm({ ...editForm, schedulePreference: pref })}
            onPickImage={pickImage}
            newImageUri={newProfileImage?.uri || null}
            onCancel={handleCancelEdit}
            onSave={handleSaveProfile}
            isSaving={updatingStatus}
          />
        )}

        {/* Next Box Status - uniquement pour l'utilisateur actuel */}
        {currentPlayer?.current_box && user && currentPlayer.id === user.id && (
          <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
            <View style={styles.sectionTitleContainer}>
              <IconSymbol name="square.grid.2x2.fill" size={18} color={colors.text + '80'} />
              <ThemedText style={styles.sectionTitle}>Prochain Box</ThemedText>
            </View>
            <ThemedText style={[styles.sectionSubtitle, { color: colors.text, opacity: 0.6 }]}>
              Souhaitez-vous continuer dans le prochain box ?
            </ThemedText>
            
            <View style={styles.statusButtons}>
                <TouchableOpacity
                  style={[
                    styles.statusButton,
                    currentPlayer.current_box.next_box_status === 'continue' && [
                      styles.statusButtonActive,
                      { backgroundColor: '#10b981' + '20', borderColor: '#10b981' },
                    ],
                    { borderColor: colors.text + '20' },
                    (!user || currentPlayer.id !== user.id) && styles.statusButtonReadonly,
                  ]}
                  onPress={(!user || currentPlayer.id !== user.id) ? undefined : () => handleUpdateNextBoxStatus('continue')}
                  disabled={(!user || currentPlayer.id !== user.id) || updatingStatus}
                  activeOpacity={(!user || currentPlayer.id !== user.id) ? 1 : 0.7}
                >
                  <IconSymbol 
                    name="checkmark.circle.fill" 
                    size={24} 
                    color={currentPlayer.current_box.next_box_status === 'continue' ? '#10b981' : colors.text + '60'} 
                  />
                  <ThemedText 
                    style={[
                      styles.statusButtonText,
                      currentPlayer.current_box.next_box_status === 'continue' && { color: '#10b981', fontWeight: '600' },
                    ]}
                  >
                    Continuer
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.statusButton,
                    currentPlayer.current_box.next_box_status === 'stop' && [
                      styles.statusButtonActive,
                      { backgroundColor: '#ef4444' + '20', borderColor: '#ef4444' },
                    ],
                    { borderColor: colors.text + '20' },
                    (!user || currentPlayer.id !== user.id) && styles.statusButtonReadonly,
                  ]}
                  onPress={(!user || currentPlayer.id !== user.id) ? undefined : () => handleUpdateNextBoxStatus('stop')}
                  disabled={(!user || currentPlayer.id !== user.id) || updatingStatus}
                  activeOpacity={(!user || currentPlayer.id !== user.id) ? 1 : 0.7}
                >
                  <IconSymbol 
                    name="xmark.circle.fill" 
                    size={24} 
                    color={currentPlayer.current_box.next_box_status === 'stop' ? '#ef4444' : colors.text + '60'} 
                  />
                  <ThemedText 
                    style={[
                      styles.statusButtonText,
                      currentPlayer.current_box.next_box_status === 'stop' && { color: '#ef4444', fontWeight: '600' },
                    ]}
                  >
                    Arrêter
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.statusButton,
                    !currentPlayer.current_box.next_box_status && [
                      styles.statusButtonActive,
                      { backgroundColor: colors.text + '10', borderColor: colors.text + '30' },
                    ],
                    { borderColor: colors.text + '20' },
                    (!user || currentPlayer.id !== user.id) && styles.statusButtonReadonly,
                  ]}
                  onPress={(!user || currentPlayer.id !== user.id) ? undefined : () => handleUpdateNextBoxStatus(null)}
                  disabled={(!user || currentPlayer.id !== user.id) || updatingStatus}
                  activeOpacity={(!user || currentPlayer.id !== user.id) ? 1 : 0.7}
                >
                  <IconSymbol 
                    name="questionmark.circle.fill" 
                    size={24} 
                    color={!currentPlayer.current_box.next_box_status ? colors.text : colors.text + '60'} 
                  />
                  <ThemedText 
                    style={[
                      styles.statusButtonText,
                      !currentPlayer.current_box.next_box_status && { fontWeight: '600' },
                    ]}
                  >
                    Indécis
                  </ThemedText>
                </TouchableOpacity>
              </View>
          </View>
        )}

        {/* Statistiques principales */}
        <View style={[styles.statsCard, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
          <View style={styles.sectionTitleContainer}>
            <IconSymbol name="chart.bar.fill" size={18} color={colors.text + '80'} />
            <ThemedText style={styles.sectionTitle}>Statistiques</ThemedText>
          </View>
          <View style={styles.statsGrid}>
            <View style={[styles.statBox, { backgroundColor: '#10b981' + '10', borderColor: '#10b981' + '20' }]}>
              <ThemedText style={[styles.statValue, { color: '#10b981' }]}>
                {stats.wins}
              </ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.text, opacity: 0.6 }]}>
                Victoires
              </ThemedText>
            </View>
            <View style={[styles.statBox, { backgroundColor: '#ef4444' + '10', borderColor: '#ef4444' + '20' }]}>
              <ThemedText style={[styles.statValue, { color: '#ef4444' }]}>
                {stats.losses}
              </ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.text, opacity: 0.6 }]}>
                Défaites
              </ThemedText>
            </View>
            <View style={[styles.statBox, { backgroundColor: (stats.winRate >= 50 ? '#10b981' : stats.winRate >= 30 ? '#fbbf24' : '#ef4444') + '10', borderColor: (stats.winRate >= 50 ? '#10b981' : stats.winRate >= 30 ? '#fbbf24' : '#ef4444') + '20' }]}>
              <ThemedText style={[styles.statValue, { color: stats.winRate >= 50 ? '#10b981' : stats.winRate >= 30 ? '#fbbf24' : '#ef4444' }]}>
                {stats.winRate}%
              </ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.text, opacity: 0.6 }]}>
                Victoires
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Statistiques avancées */}
        <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
          <View style={styles.sectionTitleContainer}>
            <IconSymbol name="chart.bar.fill" size={18} color={colors.text + '80'} />
            <ThemedText style={styles.sectionTitle}>Statistiques avancées</ThemedText>
          </View>
          
          {/* État de forme - remplace la série actuelle */}
          {advancedStats.form.length > 0 && (
            <View style={[styles.formCard, { backgroundColor: colors.text + '05', borderColor: colors.text + '15' }]}>
              <View style={styles.formHeader}>
                <ThemedText style={[styles.formTitle, { color: colors.text }]}>
                  État de forme
                </ThemedText>
                <ThemedText style={[styles.formSubtitle, { color: colors.text, opacity: 0.6 }]}>
                  5 derniers matchs
                </ThemedText>
              </View>
              <View style={styles.formPills}>
                {advancedStats.form.map((result, index) => (
                  <View
                    key={index}
                    style={[
                      styles.formPill,
                      {
                        backgroundColor: result === 'win' ? '#10b981' : '#ef4444',
                        borderWidth: 1.5,
                        borderColor: result === 'win' ? '#059669' : '#dc2626',
                        alignItems: 'center',
                        justifyContent: 'center',
                      },
                    ]}
                  >
                    <IconSymbol
                      name={result === 'win' ? 'checkmark' : 'xmark'}
                      size={6}
                      color="#FFFFFF"
                    />
                  </View>
                ))}
                {/* Remplir jusqu'à 5 si moins de matchs */}
                {Array.from({ length: 5 - advancedStats.form.length }).map((_, index) => (
                  <View
                    key={`empty-${index}`}
                    style={[
                      styles.formPill,
                      {
                        backgroundColor: colors.text + '15',
                        borderWidth: 1.5,
                        borderColor: colors.text + '30',
                      },
                    ]}
                  />
                ))}
              </View>
            </View>
          )}
          
          {/* Meilleure et pire série - côte à côte */}
          <View style={styles.streaksRow}>
            {advancedStats.bestStreak.count > 0 && (
              <TouchableOpacity
                style={[styles.streakCard, { backgroundColor: '#10b981' + '10', borderColor: '#10b981' + '30', flex: 1 }]}
                onPress={async () => {
                  const players = await api.getPlayersCached();
                  openMatchDetailsModal(
                    `Meilleure série de victoires (${advancedStats.bestStreak.count})`,
                    advancedStats.bestStreak.matches,
                    players
                  );
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.streakIconContainer, { backgroundColor: '#10b981' + '20' }]}>
                  <IconSymbol name="flame.fill" size={24} color="#10b981" />
                </View>
                <ThemedText style={[styles.streakValue, { color: '#10b981' }]}>
                  {advancedStats.bestStreak.count}
                </ThemedText>
                <ThemedText style={[styles.streakLabel, { color: colors.text, opacity: 0.7 }]}>
                  Meilleure série
                </ThemedText>
              </TouchableOpacity>
            )}
            
            {advancedStats.worstStreak.count > 0 && (
              <TouchableOpacity
                style={[styles.streakCard, { backgroundColor: '#ef4444' + '10', borderColor: '#ef4444' + '30', flex: 1 }]}
                onPress={async () => {
                  const players = await api.getPlayersCached();
                  openMatchDetailsModal(
                    `Pire série de défaites (${advancedStats.worstStreak.count})`,
                    advancedStats.worstStreak.matches,
                    players
                  );
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.streakIconContainer, { backgroundColor: '#ef4444' + '20' }]}>
                  <IconSymbol name="exclamationmark.triangle.fill" size={24} color="#ef4444" />
                </View>
                <ThemedText style={[styles.streakValue, { color: '#ef4444' }]}>
                  {advancedStats.worstStreak.count}
                </ThemedText>
                <ThemedText style={[styles.streakLabel, { color: colors.text, opacity: 0.7 }]}>
                  Pire série
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
          
          {advancedStats.totalPoints > 0 && (
            <View style={[styles.advancedStatBox, { backgroundColor: colors.text + '05', marginTop: 12 }]}>
              <IconSymbol name="trophy.fill" size={20} color={PRIMARY_COLOR} />
              <ThemedText style={[styles.advancedStatValue, { color: colors.text }]}>
                {advancedStats.totalPoints}
              </ThemedText>
              <ThemedText style={[styles.advancedStatLabel, { color: colors.text, opacity: 0.6 }]}>
                Points (année)
              </ThemedText>
            </View>
          )}
        </View>

        {/* Adversaires */}
        {(advancedStats.rival.name || advancedStats.bestOpponent.name || advancedStats.worstOpponent.name) && (
          <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
            <View style={styles.sectionTitleContainer}>
              <IconSymbol name="person.2.fill" size={18} color={colors.text + '80'} />
              <ThemedText style={styles.sectionTitle}>Adversaires</ThemedText>
            </View>
            
            {/* Adversaires - tous côte à côte */}
            <View style={styles.opponentsRow}>
              {advancedStats.rival.name && advancedStats.rival.player && (
                <TouchableOpacity
                  style={[styles.opponentBox, { backgroundColor: colors.text + '05', borderColor: PRIMARY_COLOR + '30', flex: 1 }]}
                  onPress={async () => {
                    const players = await api.getPlayersCached();
                    openMatchDetailsModal(
                      `Matchs contre ${advancedStats.rival.name}`,
                      advancedStats.rival.matchList,
                      players
                    );
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.opponentEmojiContainer}>
                    <ThemedText style={styles.opponentEmoji}>🤝</ThemedText>
                  </View>
                  <ThemedText 
                    style={[styles.opponentTitle, { color: colors.text }]}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    Meilleur ami
                  </ThemedText>
                  <View style={styles.opponentAvatarContainer}>
                    <PlayerAvatar
                      firstName={advancedStats.rival.player.first_name}
                      lastName={advancedStats.rival.player.last_name}
                      pictureUrl={advancedStats.rival.player.picture}
                      size={36}
                      backgroundColor={AVATAR_COLOR}
                    />
                  </View>
                  <View style={styles.opponentNamesContainer}>
                    <ThemedText 
                      style={[styles.opponentFirstName, { color: colors.text }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {advancedStats.rival.player.first_name}
                    </ThemedText>
                    <ThemedText 
                      style={[styles.opponentLastName, { color: colors.text, opacity: 0.7 }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {advancedStats.rival.player.last_name}
                    </ThemedText>
                  </View>
                  <View style={styles.opponentStatsContainer}>
                    <ThemedText style={[styles.opponentStatsLabel, { color: colors.text, opacity: 0.5 }]}>
                      {advancedStats.rival.matches} matchs
                    </ThemedText>
                    <View style={styles.opponentStatsRow}>
                      <View style={[styles.opponentStatBadge, { backgroundColor: '#10b981' + '15' }]}>
                        <ThemedText style={[styles.opponentStatValue, { color: '#10b981' }]}>
                          {advancedStats.rival.wins}V
                        </ThemedText>
                      </View>
                      <View style={[styles.opponentStatBadge, { backgroundColor: '#ef4444' + '15' }]}>
                        <ThemedText style={[styles.opponentStatValue, { color: '#ef4444' }]}>
                          {advancedStats.rival.losses}D
                        </ThemedText>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
              {advancedStats.bestOpponent.name && advancedStats.bestOpponent.player && (
                <TouchableOpacity
                  style={[styles.opponentBox, { backgroundColor: colors.text + '05', borderColor: '#10b981' + '30', flex: 1 }]}
                  onPress={async () => {
                    const players = await api.getPlayersCached();
                    openMatchDetailsModal(
                      `Matchs contre ${advancedStats.bestOpponent.name}`,
                      advancedStats.bestOpponent.matchList,
                      players
                    );
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.opponentEmojiContainer}>
                    <ThemedText style={styles.opponentEmoji}>⭐</ThemedText>
                  </View>
                  <ThemedText 
                    style={[styles.opponentTitle, { color: colors.text }]}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    Victoires faciles
                  </ThemedText>
                  <View style={styles.opponentAvatarContainer}>
                    <PlayerAvatar
                      firstName={advancedStats.bestOpponent.player.first_name}
                      lastName={advancedStats.bestOpponent.player.last_name}
                      pictureUrl={advancedStats.bestOpponent.player.picture}
                      size={36}
                      backgroundColor={AVATAR_COLOR}
                    />
                  </View>
                  <View style={styles.opponentNamesContainer}>
                    <ThemedText 
                      style={[styles.opponentFirstName, { color: colors.text }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {advancedStats.bestOpponent.player.first_name}
                    </ThemedText>
                    <ThemedText 
                      style={[styles.opponentLastName, { color: colors.text, opacity: 0.7 }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {advancedStats.bestOpponent.player.last_name}
                    </ThemedText>
                  </View>
                  <View style={styles.opponentStatsContainer}>
                    <ThemedText style={[styles.opponentStatsLabel, { color: colors.text, opacity: 0.5 }]}>
                      {advancedStats.bestOpponent.matches} matchs
                    </ThemedText>
                    <View style={styles.opponentStatsRow}>
                      <View style={[styles.opponentStatBadge, { backgroundColor: '#10b981' + '15' }]}>
                        <ThemedText style={[styles.opponentStatValue, { color: '#10b981' }]}>
                          {advancedStats.bestOpponent.wins}V
                        </ThemedText>
                      </View>
                      <View style={[styles.opponentStatBadge, { backgroundColor: '#ef4444' + '15' }]}>
                        <ThemedText style={[styles.opponentStatValue, { color: '#ef4444' }]}>
                          {advancedStats.bestOpponent.losses}D
                        </ThemedText>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
              
              {advancedStats.worstOpponent.name && advancedStats.worstOpponent.name !== advancedStats.bestOpponent.name && advancedStats.worstOpponent.player && (
                <TouchableOpacity
                  style={[styles.opponentBox, { backgroundColor: colors.text + '05', borderColor: '#ef4444' + '30', flex: 1 }]}
                  onPress={async () => {
                    const players = await api.getPlayersCached();
                    openMatchDetailsModal(
                      `Matchs contre ${advancedStats.worstOpponent.name}`,
                      advancedStats.worstOpponent.matchList,
                      players
                    );
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.opponentEmojiContainer}>
                    <ThemedText style={styles.opponentEmoji}>😈</ThemedText>
                  </View>
                  <ThemedText 
                    style={[styles.opponentTitle, { color: colors.text }]}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    Bête noire
                  </ThemedText>
                  <View style={styles.opponentAvatarContainer}>
                    <PlayerAvatar
                      firstName={advancedStats.worstOpponent.player.first_name}
                      lastName={advancedStats.worstOpponent.player.last_name}
                      pictureUrl={advancedStats.worstOpponent.player.picture}
                      size={36}
                      backgroundColor={AVATAR_COLOR}
                    />
                  </View>
                  <View style={styles.opponentNamesContainer}>
                    <ThemedText 
                      style={[styles.opponentFirstName, { color: colors.text }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {advancedStats.worstOpponent.player.first_name}
                    </ThemedText>
                    <ThemedText 
                      style={[styles.opponentLastName, { color: colors.text, opacity: 0.7 }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {advancedStats.worstOpponent.player.last_name}
                    </ThemedText>
                  </View>
                  <View style={styles.opponentStatsContainer}>
                    <ThemedText style={[styles.opponentStatsLabel, { color: colors.text, opacity: 0.5 }]}>
                      {advancedStats.worstOpponent.matches} matchs
                    </ThemedText>
                    <View style={styles.opponentStatsRow}>
                      <View style={[styles.opponentStatBadge, { backgroundColor: '#10b981' + '15' }]}>
                        <ThemedText style={[styles.opponentStatValue, { color: '#10b981' }]}>
                          {advancedStats.worstOpponent.wins}V
                        </ThemedText>
                      </View>
                      <View style={[styles.opponentStatBadge, { backgroundColor: '#ef4444' + '15' }]}>
                        <ThemedText style={[styles.opponentStatValue, { color: '#ef4444' }]}>
                          {advancedStats.worstOpponent.losses}D
                        </ThemedText>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Historique des matchs */}
        {recentMatches.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
            <TouchableOpacity
              style={[styles.historyHeader, { marginBottom: isHistoryExpanded ? 16 : 0 }]}
              onPress={() => {
                setIsHistoryExpanded(!isHistoryExpanded);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.historyHeaderLeft}>
                <IconSymbol name="clock.fill" size={18} color={colors.text + '80'} />
                <ThemedText style={styles.sectionTitle}>
                  Historique ({filteredMatches.length} {filteredMatches.length > 1 ? 'matchs' : 'match'})
                </ThemedText>
              </View>
              <IconSymbol 
                name="chevron.right" 
                size={16} 
                color={colors.text + '60'} 
                style={[
                  styles.expandIcon,
                  isHistoryExpanded && styles.expandIconExpanded
                ]}
              />
            </TouchableOpacity>
            
            {isHistoryExpanded && (
              <>
                {/* Barre de recherche */}
                <View style={[styles.searchBar, { backgroundColor: colors.text + '05', borderColor: colors.text + '10' }]}>
                  <IconSymbol name="magnifyingglass" size={18} color={colors.text + '60'} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.text }]}
                    placeholder="Rechercher un adversaire..."
                    placeholderTextColor={colors.text + '60'}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <IconSymbol name="xmark.circle.fill" size={18} color={colors.text + '60'} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Filtres et tri */}
                <View style={styles.filtersContainer}>
                  {/* Filtre par résultat - Segmented Control */}
                  <View style={styles.filterSection}>
                    <ThemedText style={[styles.filterSectionTitle, { color: colors.text, opacity: 0.7 }]}>
                      Résultat
                    </ThemedText>
                    <View style={[styles.segmentedControl, { backgroundColor: colors.text + '08' }]}>
                      <TouchableOpacity
                        style={[
                          styles.segmentButton,
                          filterBy === 'all' && [styles.segmentButtonActive, { backgroundColor: colors.text + '15' }],
                        ]}
                        onPress={() => {
                          setFilterBy('all');
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                      >
                        <ThemedText 
                          style={[
                            styles.segmentButtonText, 
                            { color: filterBy === 'all' ? colors.text : colors.text + '60' },
                            filterBy === 'all' && { fontWeight: '600' }
                          ]}
                        >
                          Tous
                        </ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.segmentButton,
                          filterBy === 'won' && [styles.segmentButtonActive, { backgroundColor: '#10b981' + '20' }],
                        ]}
                        onPress={() => {
                          setFilterBy('won');
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                      >
                        <IconSymbol 
                          name="checkmark.circle.fill" 
                          size={16} 
                          color={filterBy === 'won' ? '#10b981' : colors.text + '60'} 
                        />
                        <ThemedText 
                          style={[
                            styles.segmentButtonText, 
                            { color: filterBy === 'won' ? '#10b981' : colors.text + '60' },
                            filterBy === 'won' && { fontWeight: '600' }
                          ]}
                        >
                          Victoires
                        </ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.segmentButton,
                          filterBy === 'lost' && [styles.segmentButtonActive, { backgroundColor: '#ef4444' + '20' }],
                        ]}
                        onPress={() => {
                          setFilterBy('lost');
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                      >
                        <IconSymbol 
                          name="xmark.circle.fill" 
                          size={16} 
                          color={filterBy === 'lost' ? '#ef4444' : colors.text + '60'} 
                        />
                        <ThemedText 
                          style={[
                            styles.segmentButtonText, 
                            { color: filterBy === 'lost' ? '#ef4444' : colors.text + '60' },
                            filterBy === 'lost' && { fontWeight: '600' }
                          ]}
                        >
                          Défaites
                        </ThemedText>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Tri - Boutons horizontaux */}
                  <View style={styles.filterSection}>
                    <ThemedText style={[styles.filterSectionTitle, { color: colors.text, opacity: 0.7 }]}>
                      Trier par
                    </ThemedText>
                    <View style={styles.sortButtons}>
                      <TouchableOpacity
                        style={[
                          styles.sortButton,
                          sortBy === 'date' && [styles.sortButtonActive, { backgroundColor: PRIMARY_COLOR + '15', borderColor: PRIMARY_COLOR }],
                          { borderColor: colors.text + '20' },
                        ]}
                        onPress={() => {
                          if (sortBy === 'date') {
                            setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                          } else {
                            setSortBy('date');
                            setSortDirection('desc');
                          }
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                      >
                        <IconSymbol 
                          name="calendar" 
                          size={16} 
                          color={sortBy === 'date' ? PRIMARY_COLOR : colors.text + '60'} 
                        />
                        <ThemedText 
                          style={[
                            styles.sortButtonText, 
                            { color: sortBy === 'date' ? PRIMARY_COLOR : colors.text + '60' },
                            sortBy === 'date' && { fontWeight: '600' }
                          ]}
                        >
                          Date
                        </ThemedText>
                        {sortBy === 'date' && (
                          <IconSymbol 
                            name={sortDirection === 'desc' ? 'arrow.down' : 'arrow.up'} 
                            size={12} 
                            color={PRIMARY_COLOR} 
                          />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.sortButton,
                          sortBy === 'opponent' && [styles.sortButtonActive, { backgroundColor: PRIMARY_COLOR + '15', borderColor: PRIMARY_COLOR }],
                          { borderColor: colors.text + '20' },
                        ]}
                        onPress={() => {
                          if (sortBy === 'opponent') {
                            setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                          } else {
                            setSortBy('opponent');
                            setSortDirection('desc');
                          }
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                      >
                        <IconSymbol 
                          name="person.fill" 
                          size={16} 
                          color={sortBy === 'opponent' ? PRIMARY_COLOR : colors.text + '60'} 
                        />
                        <ThemedText 
                          style={[
                            styles.sortButtonText, 
                            { color: sortBy === 'opponent' ? PRIMARY_COLOR : colors.text + '60' },
                            sortBy === 'opponent' && { fontWeight: '600' }
                          ]}
                        >
                          Adversaire
                        </ThemedText>
                        {sortBy === 'opponent' && (
                          <IconSymbol 
                            name={sortDirection === 'desc' ? 'arrow.down' : 'arrow.up'} 
                            size={12} 
                            color={PRIMARY_COLOR} 
                          />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.sortButton,
                          sortBy === 'score' && [styles.sortButtonActive, { backgroundColor: PRIMARY_COLOR + '15', borderColor: PRIMARY_COLOR }],
                          { borderColor: colors.text + '20' },
                        ]}
                        onPress={() => {
                          if (sortBy === 'score') {
                            setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                          } else {
                            setSortBy('score');
                            setSortDirection('desc');
                          }
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                      >
                        <IconSymbol 
                          name="chart.bar.fill" 
                          size={16} 
                          color={sortBy === 'score' ? PRIMARY_COLOR : colors.text + '60'} 
                        />
                        <ThemedText 
                          style={[
                            styles.sortButtonText, 
                            { color: sortBy === 'score' ? PRIMARY_COLOR : colors.text + '60' },
                            sortBy === 'score' && { fontWeight: '600' }
                          ]}
                        >
                          Score
                        </ThemedText>
                        {sortBy === 'score' && (
                          <IconSymbol 
                            name={sortDirection === 'desc' ? 'arrow.down' : 'arrow.up'} 
                            size={12} 
                            color={PRIMARY_COLOR} 
                          />
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Liste des matchs */}
                <View style={styles.matchHistoryList}>
                  {filteredMatches.map((match, index) => {
                    const matchId = match.matchData.id;
                    const matchReactionsData = matchReactions[matchId] || {};
                    const userReaction = userReactions[matchId];
                    const totalReactions = Object.values(matchReactionsData).reduce((sum, count) => sum + count, 0);
                    const comments = matchComments[matchId] || [];
                    const commentsCount = comments.length;

                    return (
                      <View
                        key={index}
                        style={[
                          styles.matchHistoryItem,
                          { backgroundColor: index % 2 === 0 ? 'transparent' : colors.text + '03' },
                          index !== filteredMatches.length - 1 && [
                            styles.matchHistoryBorder,
                            { borderBottomColor: colors.text + '25' },
                          ],
                        ]}
                      >
                        {/* Animation de réaction */}
                        {activeAnimations[matchId] && (
                          <View style={styles.animationContainer}>
                            <ReactionAnimation
                              emoji={activeAnimations[matchId]!}
                              onComplete={() => {
                                setActiveAnimations(prev => {
                                  const next = { ...prev };
                                  delete next[matchId];
                                  return next;
                                });
                              }}
                            />
                          </View>
                        )}
                        <View style={styles.matchHistoryContent}>
                          <View style={styles.matchHistoryLeft}>
                            <ThemedText style={styles.matchHistoryOpponent}>
                              {match.opponent}
                            </ThemedText>
                            <ThemedText style={[styles.matchHistoryDate, { color: colors.text, opacity: 0.5 }]}>
                              {formatDate(match.date)}
                            </ThemedText>
                          </View>
                          
                          {/* Boutons actions à droite */}
                          <View style={styles.matchHistoryRight}>
                            {/* Boutons emoji et commentaire */}
                            {currentPlayer && (
                              <View style={styles.reactionsActionsLeft}>
                                {/* Bouton emoji pour ajouter une réaction */}
                                <TouchableOpacity
                                  style={[
                                    styles.reactionAddButton,
                                    { 
                                      borderColor: colors.text + '20',
                                      backgroundColor: colors.text + '08',
                                    }
                                  ]}
                                  onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    setShowReactionsPicker(prev => {
                                      const next = new Set(prev);
                                      if (next.has(matchId)) {
                                        next.delete(matchId);
                                      } else {
                                        next.add(matchId);
                                      }
                                      return next;
                                    });
                                  }}
                                  activeOpacity={0.7}
                                >
                                  <IconSymbol name="face.smiling.fill" size={14} color={colors.text + '70'} />
                                </TouchableOpacity>

                                {/* Bouton commentaire */}
                                <TouchableOpacity
                                  style={[
                                    styles.reactionAddButton,
                                    { 
                                      borderColor: colors.text + '20',
                                      backgroundColor: colors.text + '08',
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      paddingHorizontal: commentsCount > 0 ? 6 : 0,
                                      gap: 2,
                                    }
                                  ]}
                                  onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    setShowCommentInput(prev => {
                                      const next = new Set(prev);
                                      if (next.has(matchId)) {
                                        next.delete(matchId);
                                      } else {
                                        next.add(matchId);
                                        if (!matchComments[matchId]) {
                                          // Charger les commentaires si pas encore chargés
                                          api.getComments('match', matchId).then(comments => {
                                            setMatchComments(prev => ({ ...prev, [matchId]: comments }));
                                          }).catch(console.error);
                                        }
                                      }
                                      return next;
                                    });
                                  }}
                                  activeOpacity={0.7}
                                >
                                  <IconSymbol name="bubble.left" size={14} color={colors.text + '70'} />
                                  {commentsCount > 0 && (
                                    <ThemedText style={[styles.reactionCount, { color: colors.text + '70' }]}>
                                      {commentsCount}
                                    </ThemedText>
                                  )}
                                </TouchableOpacity>
                              </View>
                            )}

                            {/* Score */}
                            <View
                              style={[
                                styles.matchHistoryScore,
                                { 
                                  backgroundColor: (() => {
                                    if (!currentPlayer) return colors.text + '10';
                                    const specialStatus = getMatchSpecialStatus(match.matchData, currentPlayer.id, match.won);
                                    return specialStatus.backgroundColor;
                                  })()
                                },
                              ]}
                            >
                              <ThemedText
                                style={[
                                  styles.matchHistoryScoreText,
                                  { 
                                    color: (() => {
                                      if (!currentPlayer) return colors.text;
                                      const specialStatus = getMatchSpecialStatus(match.matchData, currentPlayer.id, match.won);
                                      return specialStatus.textColor;
                                    })()
                                  },
                                ]}
                              >
                                {(() => {
                                  if (!currentPlayer) return match.score;
                                  const [playerScore, opponentScore] = match.score.split('-').map(Number);
                                  return formatMatchScore(match.matchData, currentPlayer.id, playerScore, opponentScore);
                                })()}
                              </ThemedText>
                            </View>
                          </View>
                        </View>

                        {/* Réactions existantes - affichées en dessous si elles existent */}
                        {currentPlayer && totalReactions > 0 && (
                          <View style={[styles.reactionsContainerCompact, { borderTopWidth: 1, borderTopColor: colors.text + '15' }]}>
                            <View style={styles.reactionsBadgesRight}>
                              {REACTIONS.map((reaction) => {
                                const count = matchReactionsData[reaction.name] || 0;
                                if (count === 0) return null;
                                
                                const hasThisReaction = userReaction === reaction.name;
                                
                                return (
                                  <TouchableOpacity
                                    key={reaction.name}
                                    style={[
                                      styles.reactionBadge,
                                      { 
                                        borderColor: hasThisReaction ? PRIMARY_COLOR + '80' : colors.text + '20',
                                        borderWidth: hasThisReaction ? 1.5 : 1,
                                        backgroundColor: hasThisReaction ? PRIMARY_COLOR + '20' : colors.text + '08',
                                      }
                                    ]}
                                    onPress={() => handleReaction(matchId, reaction.name)}
                                    onLongPress={async () => {
                                      try {
                                        const playersByType = await api.getReactionPlayers('match', matchId);
                                        setReactionPlayersModal({
                                          visible: true,
                                          entityType: 'match',
                                          entityId: matchId,
                                        });
                                        setReactionPlayersByType(playersByType);
                                      } catch (error) {
                                        console.error('Erreur chargement joueurs réaction:', error);
                                        Alert.alert('Erreur', 'Impossible de charger la liste des joueurs');
                                      }
                                    }}
                                    activeOpacity={0.7}
                                  >
                                    <ThemedText style={styles.reactionEmoji}>{reaction.emoji}</ThemedText>
                                    <ThemedText style={[styles.reactionCount, { color: colors.text + (hasThisReaction ? '90' : '70') }]}>
                                      {count}
                                    </ThemedText>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </View>
                        )}

                        {/* Panneau de réactions (picker) */}
                        {currentPlayer && showReactionsPicker.has(matchId) && (
                          <View style={[styles.reactionsPanel, { borderTopColor: colors.text + '10' }]}>
                            <View style={styles.reactionsPickerContainer}>
                              {REACTIONS.map((reaction) => {
                                const hasThisReaction = userReaction === reaction.name;
                                return (
                                  <TouchableOpacity
                                    key={reaction.name}
                                    style={[
                                      styles.reactionPickerButton,
                                      hasThisReaction && { backgroundColor: colors.text + '15' },
                                    ]}
                                    onPress={() => {
                                      handleReaction(matchId, reaction.name);
                                      setShowReactionsPicker(prev => {
                                        const next = new Set(prev);
                                        next.delete(matchId);
                                        return next;
                                      });
                                    }}
                                    activeOpacity={0.7}
                                  >
                                    <ThemedText style={styles.reactionEmojiButton}>{reaction.emoji}</ThemedText>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </View>
                        )}

                        {/* Commentaires et input - affichés uniquement si toggle activé */}
                        {currentPlayer && showCommentInput.has(matchId) && (
                          <>
                            {/* Séparateur entre réactions et commentaires */}
                            {totalReactions > 0 && comments.length > 0 && (
                              <View style={[styles.reactionsCommentsSeparator, { borderTopColor: colors.text + '10' }]} />
                            )}

                            {/* Séparateur entre le post et les commentaires (si pas de réactions) */}
                            {totalReactions === 0 && comments.length > 0 && (
                              <View style={[styles.postSeparator, { borderTopColor: colors.text + '15' }]} />
                            )}

                            {/* Commentaires - affichés quand toggle activé */}
                            {comments.length > 0 && (
                              <View style={styles.commentsSection}>
                                {comments.map((comment) => {
                                  // Vérifier si le commentaire appartient à l'utilisateur actuel
                                  const isOwnComment = currentPlayer && (
                                    comment.player_id === currentPlayer.id || 
                                    comment.player?.id === currentPlayer.id
                                  );
                                  return (
                                    <View key={comment.id} style={styles.commentItem}>
                                      <TouchableOpacity
                                        onPress={() => {
                                          // Optionnel: naviguer vers le profil du joueur
                                        }}
                                        activeOpacity={0.7}
                                      >
                                        <PlayerAvatar
                                          firstName={comment.player.first_name}
                                          lastName={comment.player.last_name}
                                          pictureUrl={comment.player.picture}
                                          size={32}
                                        />
                                      </TouchableOpacity>
                                      <View style={styles.commentBubbleContainer}>
                                        <View style={[styles.commentBubble, { backgroundColor: colors.text + '08' }]}>
                                          <TouchableOpacity
                                            onPress={() => {
                                              // Optionnel: naviguer vers le profil du joueur
                                            }}
                                            activeOpacity={0.7}
                                          >
                                            <ThemedText style={[styles.commentAuthor, { color: colors.text, fontWeight: '600' }]}>
                                              {comment.player.first_name} {comment.player.last_name}
                                            </ThemedText>
                                          </TouchableOpacity>
                                          <ThemedText style={[styles.commentTextContent, { color: colors.text }]}>
                                            {comment.text}
                                          </ThemedText>
                                        </View>
                                        {comment.created_at && (
                                          <ThemedText style={[styles.commentDate, { color: colors.text + '50' }]}>
                                            {formatCommentDate(new Date(comment.created_at))}
                                          </ThemedText>
                                        )}
                                      </View>
                                      {isOwnComment && (
                                        <TouchableOpacity
                                          style={styles.commentDeleteButton}
                                          onPress={() => handleDeleteComment(comment.id, matchId)}
                                          activeOpacity={0.7}
                                        >
                                          <IconSymbol name="trash" size={14} color={colors.text + '60'} />
                                        </TouchableOpacity>
                                      )}
                                    </View>
                                  );
                                })}
                              </View>
                            )}

                            {/* Séparateur avant le champ de commentaire (si pas de réactions et pas de commentaires existants) */}
                            {totalReactions === 0 && comments.length === 0 && (
                              <View style={[styles.postSeparator, { borderTopColor: colors.text + '15' }]} />
                            )}

                            {/* Champ de saisie de commentaire */}
                            <View style={[styles.commentInputSection, { borderTopColor: comments.length > 0 ? colors.text + '10' : 'transparent' }]}>
                            <TextInput
                              style={[
                                styles.commentInput,
                                {
                                  backgroundColor: colors.text + '08',
                                  color: colors.text,
                                  borderColor: colors.text + '20',
                                },
                              ]}
                              placeholder="Ajouter un commentaire..."
                              placeholderTextColor={colors.text + '60'}
                              value={commentTexts[matchId] || ''}
                              onChangeText={(text) =>
                                setCommentTexts(prev => ({ ...prev, [matchId]: text }))
                              }
                              multiline
                              maxLength={500}
                              textAlignVertical="top"
                            />
                            <TouchableOpacity
                              style={[
                                styles.commentSendButton,
                                {
                                  backgroundColor: PRIMARY_COLOR,
                                  opacity: (commentTexts[matchId]?.trim() && !postingComment.has(matchId)) ? 1 : 0.5,
                                },
                              ]}
                              onPress={() => handlePostComment(matchId)}
                              disabled={!commentTexts[matchId]?.trim() || postingComment.has(matchId)}
                              activeOpacity={0.7}
                            >
                              <IconSymbol name="paperplane.fill" size={16} color="#fff" />
                            </TouchableOpacity>
                          </View>
                          </>
                        )}
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        )}

        {/* Suivis - uniquement dans le profil de l'utilisateur connecté */}
        {currentPlayer && user && currentPlayer.id === user.id && (
          <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
            <View style={styles.sectionTitleContainer}>
              <IconSymbol name="square.and.arrow.up" size={18} color={colors.text + '80'} />
              <ThemedText style={styles.sectionTitle}>Joueurs suivis</ThemedText>
            </View>
            <View style={styles.followingSectionButtons}>
              <TouchableOpacity
                style={[styles.followingSectionButton, { backgroundColor: colors.text + '05', borderColor: colors.text + '20' }]}
                onPress={() => {
                  setFollowingModalType('following');
                  setShowFollowingModal(true);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                activeOpacity={0.7}
              >
                <ThemedText style={[styles.followingSectionButtonText, { color: colors.text }]}>
                  Suivi ({followingPlayers.length})
                </ThemedText>
                <IconSymbol name="chevron.right" size={14} color={colors.text + '60'} />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.followingSectionButton, { backgroundColor: colors.text + '05', borderColor: colors.text + '20' }]}
                onPress={() => {
                  setFollowingModalType('followers');
                  setShowFollowingModal(true);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                activeOpacity={0.7}
              >
                <ThemedText style={[styles.followingSectionButtonText, { color: colors.text }]}>
                  Suivi par ({followersPlayers.length})
                </ThemedText>
                <IconSymbol name="chevron.right" size={14} color={colors.text + '60'} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Se déconnecter - seulement pour le joueur connecté */}
        {currentPlayer && user && currentPlayer.id === user.id && (
          <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
            <TouchableOpacity
              style={[styles.logoutButton, { backgroundColor: '#ef4444' + '15' }]}
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <View style={styles.logoutButtonLeft}>
                <IconSymbol name="arrow.right.square.fill" size={20} color="#ef4444" />
                <ThemedText style={[styles.logoutButtonText, { color: '#ef4444' }]}>
                  Se déconnecter
                </ThemedText>
              </View>
              <IconSymbol name="chevron.right" size={16} color="#ef4444" />
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Modal de suivis */}
      <Modal
        visible={showFollowingModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFollowingModal(false)}
      >
        <ThemedView style={styles.modalContainer}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.text + '15' }]}>
            <View style={styles.modalHeaderTitleContainer}>
              <IconSymbol 
                name="person.2.fill" 
                size={20} 
                color={colors.text + '80'} 
              />
              <ThemedText style={[styles.modalTitle, { color: colors.text }]}>
                {followingModalType === 'following' ? 'Joueurs suivis' : 'Suivi par'}
              </ThemedText>
            </View>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowFollowingModal(false)}
              activeOpacity={0.7}
            >
              <IconSymbol name="xmark" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalContent}>
            <View style={styles.modalContentContainer}>
              {followingModalType === 'following' ? (
                followingPlayers.length > 0 ? (
                  <View style={styles.followingList}>
                    {followingPlayers.map((player) => (
                      <View key={player.id} style={[styles.followingItem, { borderBottomColor: colors.text + '30', borderBottomWidth: 1 }]}>
                        <TouchableOpacity
                          style={styles.followingPlayerInfo}
                          onPress={() => {
                            setShowFollowingModal(false);
                            router.push({
                              pathname: '/(tabs)/profil',
                              params: { playerId: player.id },
                            });
                          }}
                          activeOpacity={0.7}
                        >
                          <PlayerAvatar
                            firstName={player.first_name}
                            lastName={player.last_name}
                            pictureUrl={player.picture}
                            size={40}
                          />
                          <View style={styles.followingPlayerName}>
                            <ThemedText style={[styles.followingPlayerFirstName, { color: colors.text }]}>
                              {player.first_name}
                            </ThemedText>
                            <ThemedText style={[styles.followingPlayerLastName, { color: colors.text, opacity: 0.7 }]}>
                              {player.last_name}
                            </ThemedText>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.unfollowButton, { borderColor: colors.text + '30' }]}
                          onPress={() => {
                            handleUnfollowPlayer(player);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                          activeOpacity={0.7}
                        >
                          <IconSymbol name="trash" size={14} color={colors.text + '80'} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.modalEmpty}>
                    <ThemedText style={[styles.modalEmptyText, { color: colors.text, opacity: 0.6 }]}>
                      Vous ne suivez aucun joueur pour le moment
                    </ThemedText>
                  </View>
                )
              ) : (
                followersPlayers.length > 0 ? (
                  <View style={styles.followingList}>
                    {followersPlayers.map((player) => (
                      <TouchableOpacity
                        key={player.id}
                        style={[styles.followingItem, { borderBottomColor: colors.text + '15' }]}
                        onPress={() => {
                          setShowFollowingModal(false);
                          router.push({
                            pathname: '/(tabs)/profil',
                            params: { playerId: player.id },
                          });
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.followingPlayerInfo}>
                          <PlayerAvatar
                            firstName={player.first_name}
                            lastName={player.last_name}
                            pictureUrl={player.picture}
                            size={40}
                          />
                          <View style={styles.followingPlayerName}>
                            <ThemedText style={[styles.followingPlayerFirstName, { color: colors.text }]}>
                              {player.first_name}
                            </ThemedText>
                            <ThemedText style={[styles.followingPlayerLastName, { color: colors.text, opacity: 0.7 }]}>
                              {player.last_name}
                            </ThemedText>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <View style={styles.modalEmpty}>
                    <ThemedText style={[styles.modalEmptyText, { color: colors.text, opacity: 0.6 }]}>
                      Personne ne vous suit pour le moment
                    </ThemedText>
                  </View>
                )
              )}
            </View>
          </ScrollView>
        </ThemedView>
      </Modal>

      {/* Modal de détails des matchs */}
      <Modal
        visible={matchDetailsModal.visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeMatchDetailsModal}
      >
        <ThemedView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <ThemedText style={styles.modalTitle}>{matchDetailsModal.title}</ThemedText>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={closeMatchDetailsModal}
              activeOpacity={0.7}
            >
              <IconSymbol name="xmark.circle.fill" size={28} color={colors.text + '60'} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalContent}
            contentContainerStyle={styles.modalContentContainer}
            showsVerticalScrollIndicator={false}
          >
            {matchDetailsModal.matches.length === 0 ? (
              <View style={styles.modalEmpty}>
                <ThemedText style={[styles.modalEmptyText, { color: colors.text, opacity: 0.6 }]}>
                  Aucun match trouvé
                </ThemedText>
              </View>
            ) : (
              matchDetailsModal.matches.map((match, index) => (
                <View
                  key={index}
                  style={[
                    styles.modalMatchItem,
                    index !== matchDetailsModal.matches.length - 1 && [
                      styles.modalMatchBorder,
                      { borderBottomColor: colors.text + '15' },
                    ],
                  ]}
                >
                  <View style={styles.modalMatchLeft}>
                    <ThemedText style={[styles.modalMatchOpponent, { color: colors.text }]}>
                      {match.opponent}
                    </ThemedText>
                    <ThemedText style={[styles.modalMatchDate, { color: colors.text, opacity: 0.5 }]}>
                      {formatDate(match.date)}
                    </ThemedText>
                  </View>
                  <View
                    style={[
                      styles.modalMatchScore,
                      {
                        backgroundColor: match.won ? '#10b981' + '20' : '#ef4444' + '20',
                      },
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.modalMatchScoreText,
                        {
                          color: match.won ? '#10b981' : '#ef4444',
                          fontWeight: '700',
                        },
                      ]}
                    >
                      {match.score}
                    </ThemedText>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </ThemedView>
      </Modal>

      {/* Modal pour afficher les joueurs qui ont réagi */}
      <Modal
        visible={reactionPlayersModal?.visible || false}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setReactionPlayersModal(null);
          setReactionPlayersByType({});
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setReactionPlayersModal(null);
            setReactionPlayersByType({});
          }}
        >
          <View
            style={[styles.reactionPlayersModal, { backgroundColor: colors.background }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.reactionPlayersModalHeader}>
              <ThemedText style={[styles.reactionPlayersModalTitle, { color: colors.text }]}>
                Réactions
              </ThemedText>
              <TouchableOpacity
                onPress={() => {
                  setReactionPlayersModal(null);
                  setReactionPlayersByType({});
                }}
                style={styles.reactionPlayersModalCloseButton}
                activeOpacity={0.7}
              >
                <IconSymbol name="xmark" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {loadingReactionPlayers ? (
              <View style={styles.reactionPlayersModalLoading}>
                <ActivityIndicator size="large" color={colors.text + '80'} />
              </View>
            ) : (
              <ScrollView style={styles.reactionPlayersModalList}>
                {(() => {
                  // Aplatir les données : créer une liste de { player, reactionType }
                  const playersWithReactions: Array<{ player: PlayerDTO; reactionType: string }> = [];
                  Object.entries(reactionPlayersByType).forEach(([reactionType, players]) => {
                    players.forEach(player => {
                      playersWithReactions.push({ player, reactionType });
                    });
                  });

                  // Trier par nom (prénom + nom) en ordre ascendant
                  playersWithReactions.sort((a, b) => {
                    const nameA = `${a.player.first_name} ${a.player.last_name}`.toLowerCase();
                    const nameB = `${b.player.first_name} ${b.player.last_name}`.toLowerCase();
                    return nameA.localeCompare(nameB);
                  });

                  return playersWithReactions.map(({ player, reactionType }) => {
                    const reaction = REACTIONS.find(r => r.name === reactionType);
                    return (
                      <TouchableOpacity
                        key={`${player.id}-${reactionType}`}
                        style={[styles.reactionPlayerItem, { borderBottomColor: colors.text + '10' }]}
                        onPress={() => {
                          setReactionPlayersModal(null);
                          setReactionPlayersByType({});
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                        activeOpacity={0.7}
                      >
                        <PlayerAvatar
                          firstName={player.first_name}
                          lastName={player.last_name}
                          pictureUrl={player.picture}
                          size={40}
                        />
                        <View style={styles.reactionPlayerInfo}>
                          <ThemedText style={[styles.reactionPlayerName, { color: colors.text }]}>
                            {player.first_name} {player.last_name}
                          </ThemedText>
                        </View>
                        {reaction && (
                          <ThemedText style={styles.reactionPlayerEmoji}>
                            {reaction.emoji}
                          </ThemedText>
                        )}
                      </TouchableOpacity>
                    );
                  });
                })()}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );

  // Vue connectée (personnalisée)
  if (isModal) {
    return (
      <Modal
        visible={true}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        <ThemedView style={styles.container}>
          {profileContent}
        </ThemedView>
      </Modal>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {profileContent}
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
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '500',
    opacity: 0.7,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 4,
    position: 'relative',
  },
  profileHeaderModal: {
    marginTop: 0,
    marginBottom: 12,
  },
  editIconButton: {
    position: 'absolute',
    top: 0,
    borderRadius: 16,
    padding: 8,
    zIndex: 1,
  },
  editIconButtonLeft: {
    left: 0,
  },
  editIconButtonRight: {
    right: 0,
  },
  modalHeaderButtons: {
    position: 'absolute',
    top: 0,
    right: 0,
    flexDirection: 'row',
    gap: 8,
    zIndex: 10,
    padding: 4,
    borderRadius: 16,
  },
  chatIconButton: {
    padding: 8,
    borderRadius: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 32,
  },
  profileName: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 2,
    marginTop: 8,
  },
  profileNameModal: {
    fontSize: 18,
    marginTop: 4,
    marginBottom: 2,
  },
  profilePhone: {
    fontSize: 13,
    fontWeight: '400',
    marginBottom: 8,
  },
  followButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  followButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
  },
  badgesContainerModal: {
    marginTop: 6,
    marginBottom: 2,
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    gap: 5,
  },
  infoBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  preferenceBadge: {
    // Styles additionnels si besoin
  },
  preferenceBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  boxBadge: {
    // Styles additionnels si besoin
  },
  boxBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    marginBottom: 16,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 0,
    flex: 1,
    lineHeight: 24,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
    minHeight: 24,
  },
  historyHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    minHeight: 24,
  },
  expandIcon: {
    transform: [{ rotate: '0deg' }],
  },
  expandIconExpanded: {
    transform: [{ rotate: '90deg' }],
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    marginBottom: 16,
    lineHeight: 20,
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  statusButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    gap: 8,
  },
  statusButtonActive: {
    borderWidth: 2,
  },
  statusButtonReadonly: {
    opacity: 0.7,
  },
  statusButtonText: {
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  filtersContainer: {
    gap: 16,
    marginBottom: 16,
  },
  filterSection: {
    gap: 8,
  },
  filterSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  segmentButtonActive: {
    borderWidth: 0,
  },
  segmentButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  sortButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  sortButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 6,
  },
  sortButtonActive: {
    borderWidth: 1.5,
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 6,
    lineHeight: 36,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  matchHistoryList: {
    gap: 0,
  },
  matchHistoryItem: {
    paddingVertical: 12,
    position: 'relative',
  },
  animationContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 200,
    height: 200,
    marginLeft: -100,
    marginTop: -100,
    zIndex: 1000,
  },
  matchHistoryBorder: {
    borderBottomWidth: 1,
  },
  matchHistoryContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  matchHistoryLeft: {
    flex: 1,
  },
  matchHistoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  matchHistoryOpponent: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  matchHistoryDate: {
    fontSize: 13,
    fontWeight: '400',
  },
  matchHistoryScore: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  matchHistoryScoreText: {
    fontSize: 14,
    fontWeight: '600',
  },
  matchHistoryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 4,
    gap: 6,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  reactionsSummary: {
    flexDirection: 'row',
    gap: 6,
  },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
  },
  reactionEmoji: {
    fontSize: 12,
  },
  reactionCount: {
    fontSize: 11,
    fontWeight: '500',
  },
  reactionsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  reactionsContainerCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  reactionsActionsLeft: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  reactionsBadgesRight: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  reactionAddButton: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionsPanel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  reactionsPickerContainer: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  reactionPickerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'transparent',
  },
  reactionEmojiButton: {
    fontSize: 24,
  },
  reactionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionButtonActive: {
    borderWidth: 2,
  },
  reactionsSection: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    gap: 6,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 36,
    justifyContent: 'center',
  },
  toggleButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  commentsSection: {
    paddingHorizontal: 16,
    paddingTop: 6,
    gap: 10,
  },
  commentItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  commentBubbleContainer: {
    flex: 1,
    gap: 4,
  },
  commentBubble: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    gap: 4,
  },
  commentAuthor: {
    fontSize: 14,
    marginBottom: 2,
  },
  commentTextContent: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '400',
  },
  commentDate: {
    fontSize: 11,
    marginLeft: 4,
    marginTop: 2,
  },
  commentDeleteButton: {
    padding: 6,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  // Input commentaire
  commentInputSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    minHeight: 36,
    maxHeight: 100,
  },
  commentSendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Séparateurs
  postSeparator: {
    borderTopWidth: 1,
    marginTop: 4,
    marginBottom: 4,
    marginHorizontal: 16,
  },
  reactionsCommentsSeparator: {
    borderTopWidth: 1,
    marginTop: 4,
    marginBottom: 4,
    marginHorizontal: 16,
  },
  followingList: {
    gap: 0,
  },
  followingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  followingPlayerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  followingPlayerName: {
    flex: 1,
  },
  followingPlayerFirstName: {
    fontSize: 15,
    fontWeight: '600',
  },
  followingPlayerLastName: {
    fontSize: 13,
    fontWeight: '400',
  },
  unfollowButton: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 36,
    minHeight: 36,
  },
  emptyFollowingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyFollowingText: {
    fontSize: 14,
    textAlign: 'center',
  },
  followingSectionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  followingSectionButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  followingSectionButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '400',
  },
  logoutButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  logoutButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Styles pour la vue publique
  featuresList: {
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 15,
    fontWeight: '500',
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 12,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  nextMatchContainer: {
    marginTop: 8,
  },
  nextMatchInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nextMatchOpponent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  nextMatchDetails: {
    flex: 1,
  },
  nextMatchName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  nextMatchDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nextMatchDateText: {
    fontSize: 13,
    fontWeight: '400',
  },
  advancedStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  currentStreakBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 12,
  },
  currentStreakContent: {
    flex: 1,
  },
  currentStreakValue: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  currentStreakLabel: {
    fontSize: 13,
    fontWeight: '400',
  },
  streaksRow: {
    flexDirection: 'row',
    gap: 12,
  },
  advancedStatBox: {
    flex: 1,
    minWidth: '45%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
  },
  advancedStatValue: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  advancedStatLabel: {
    fontSize: 12,
    fontWeight: '400',
    textAlign: 'center',
  },
  formCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 12,
    gap: 12,
  },
  formHeader: {
    alignItems: 'center',
    gap: 4,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  formSubtitle: {
    fontSize: 12,
    fontWeight: '400',
  },
  formContainer: {
    alignItems: 'center',
    gap: 12,
  },
  formPills: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formPill: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '400',
  },
  streakCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: 8,
    minHeight: 140,
    justifyContent: 'center',
  },
  streakIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  streakValue: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28,
  },
  streakLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  streakSubLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  opponentsContainer: {
    gap: 12,
  },
  opponentsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  rivalBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  rivalContent: {
    flex: 1,
  },
  rivalName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  rivalLabel: {
    fontSize: 13,
    fontWeight: '400',
  },
  opponentBox: {
    padding: 12,
    borderRadius: 16,
    gap: 6,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  opponentEmojiContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    width: '100%',
    minHeight: 28,
  },
  opponentEmoji: {
    fontSize: 20,
    lineHeight: 24,
  },
  opponentIconContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  opponentTitle: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
    minHeight: 28,
    lineHeight: 14,
  },
  opponentAvatarContainer: {
    alignItems: 'center',
    marginBottom: 4,
  },
  opponentNamesContainer: {
    alignItems: 'center',
    marginBottom: 4,
    width: '100%',
    gap: 1,
  },
  opponentFirstName: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 16,
  },
  opponentLastName: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 14,
  },
  opponentStatsContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 4,
  },
  opponentStatsLabel: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  opponentStatsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  opponentStatBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 40,
    alignItems: 'center',
  },
  opponentStatValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  opponentStats: {
    fontSize: 13,
    fontWeight: '400',
  },
  // Styles pour le modal de détails
  modalContainer: {
    flex: 1,
    paddingTop: 60,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalHeaderTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
  },
  modalContentContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  modalEmpty: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  modalEmptyText: {
    fontSize: 16,
    fontWeight: '400',
  },
  modalMatchItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  modalMatchBorder: {
    borderBottomWidth: 1,
  },
  modalMatchLeft: {
    flex: 1,
  },
  modalMatchOpponent: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  modalMatchDate: {
    fontSize: 13,
    fontWeight: '400',
  },
  modalMatchScore: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  modalMatchScoreText: {
    fontSize: 14,
    fontWeight: '700',
  },
  // Modal réactions
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactionPlayersModal: {
    width: '85%',
    maxHeight: '70%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  reactionPlayersModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  reactionPlayersModalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  reactionPlayersModalEmoji: {
    fontSize: 24,
  },
  reactionPlayersModalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  reactionPlayersModalCloseButton: {
    padding: 4,
  },
  reactionPlayersModalLoading: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionPlayersModalList: {
    maxHeight: 400,
  },
  reactionPlayerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  reactionPlayerInfo: {
    flex: 1,
  },
  reactionPlayerName: {
    fontSize: 16,
    fontWeight: '500',
  },
  reactionPlayerEmoji: {
    fontSize: 20,
  },
  reactionGroup: {
    marginBottom: 16,
  },
  reactionGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  reactionGroupEmoji: {
    fontSize: 20,
  },
  reactionGroupTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
});
