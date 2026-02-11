import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Intervalle de rafraîchissement des matchs en live (en secondes)
const LIVE_MATCHES_REFRESH_INTERVAL = 30;

import ProfileScreen from '@/app/(tabs)/profil';
import { ActivityFeed, type ActivityFeedItem } from '@/components/activity-feed';
import { AppBar } from '@/components/app-bar';
import { LiveMatchCard } from '@/components/live-match-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/services/api';
import type { BoxDTO, MatchDTO, PlayerDTO } from '@/types/api';
import { getMatchSpecialStatus } from '@/utils/match-helpers';
import { getActiveSeasons } from '@/utils/season-helpers';

export default function FeedScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { user, isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerDTO | null>(null);
  const [followedPlayersMatches, setFollowedPlayersMatches] = useState<ActivityFeedItem[]>([]);
  const [followedPlayers, setFollowedPlayers] = useState<string[]>([]);
  const [matchReactions, setMatchReactions] = useState<{ [matchId: string]: { [reaction: string]: number } }>({});
  const [userReactions, setUserReactions] = useState<{ [matchId: string]: string | null }>({});
  const [matchComments, setMatchComments] = useState<{ [matchId: string]: any[] }>({});
  const isLoadingFollowedPlayersRef = useRef(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [liveMatches, setLiveMatches] = useState<MatchDTO[]>([]);
  const [allBoxes, setAllBoxes] = useState<BoxDTO[]>([]);
  const [allPlayers, setAllPlayers] = useState<PlayerDTO[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);

  // Charger le joueur actuel
  useEffect(() => {
    const loadCurrentPlayer = async () => {
      if (!isAuthenticated || !user) {
        setCurrentPlayer(null);
        return;
      }
      
      try {
        // Utiliser le cache sans forcer le refresh (forceRefresh = false par défaut)
        // Si le cache existe déjà, on l'utilise, sinon on charge
        const players = await api.getPlayersCached(false);
        const player = players.find((p) => p.email?.toLowerCase() === user.email.toLowerCase());
        setCurrentPlayer(player || null);
      } catch (error) {
        console.error('Erreur chargement joueur:', error);
        setCurrentPlayer(null);
      }
    };
    
    loadCurrentPlayer();
  }, [user, isAuthenticated]);

  // Charger la liste des joueurs suivis et leurs matchs
  const loadFollowedPlayers = useCallback(async (sharedFollowing?: PlayerDTO[], isRefresh = false) => {
    if (!currentPlayer?.id) {
      setFollowedPlayers([]);
      setFollowedPlayersMatches([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    
    // Éviter les appels multiples simultanés
    if (isLoadingFollowedPlayersRef.current) {
      return;
    }
    
    isLoadingFollowedPlayersRef.current = true;
    
    try {
      if (!isRefresh) {
        setLoading(true);
      }
      
      // Récupérer les joueurs suivis (ou utiliser ceux partagés)
      let following = sharedFollowing;
      if (!following) {
        following = await api.getFollowing(currentPlayer.id);
      }
      const followedIds = following.map(p => p.id);
      setFollowedPlayers(followedIds);
      
      // Calculer la date d'il y a exactement 7 jours (à minuit pour éviter les problèmes de timezone)
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      todayStart.setHours(0, 0, 0, 0);
      
      const oneWeekAgo = new Date(todayStart);
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
 
      // Récupérer toutes les saisons actives pour avoir les matchs de toutes les compétitions
      const seasons = await api.getSeasonsCached(isRefresh);
      const activeSeasons = getActiveSeasons(seasons);
      
      // Récupérer tous les matchs de toutes les saisons actives (pour voir les matchs des joueurs suivis dans toutes les compétitions)
      const allMatchesPromises = activeSeasons.map(season => api.getMatches(season.id));
      const allMatchesArrays = await Promise.all(allMatchesPromises);
      const allMatches = allMatchesArrays.flat();
   
      // Filtrer les matchs : seulement ceux des 7 derniers jours avec résultats valides
      // Inclure les matchs des joueurs suivis ET les matchs du joueur connecté
      const validMatches = allMatches.filter((match) => {
        // Vérifier que le match a été joué (played_at existe)
        if (!match.played_at) {
          return false;
        }
        
        const playedDate = new Date(match.played_at);
        
        // Vérifier que la date est valide
        if (isNaN(playedDate.getTime())) {
          return false;
        }
        
        // Normaliser la date jouée à minuit pour la comparaison
        const playedDateNormalized = new Date(playedDate.getFullYear(), playedDate.getMonth(), playedDate.getDate());
        playedDateNormalized.setHours(0, 0, 0, 0);
        
        // Vérifier que c'est dans les 7 derniers jours (inclus aujourd'hui)
        // La date doit être >= oneWeekAgo et <= todayStart
        if (playedDateNormalized < oneWeekAgo) {
          return false;
        }
        
        if (playedDateNormalized > todayStart) {
          return false;
        }
        
        // Vérifier que le match a un résultat valide (pas 0-0, pas de cas spéciaux)
        const hasValidScore = match.score_a !== null && match.score_b !== null &&
                             !(match.score_a === 0 && match.score_b === 0);
        const hasSpecialStatus = !!(match.no_show_player_id || match.retired_player_id || match.delayed_player_id);
        
        // Inclure seulement les matchs avec score valide et sans statut spécial
        if (!hasValidScore || hasSpecialStatus) return false;
        
        // Inclure si c'est un match du joueur connecté OU d'un joueur suivi
        const isCurrentPlayerMatch = match.player_a_id === currentPlayer.id || match.player_b_id === currentPlayer.id;
        const isFollowedPlayerMatch = followedIds.includes(match.player_a_id) || followedIds.includes(match.player_b_id);
        
        return isCurrentPlayerMatch || isFollowedPlayerMatch;
      });
      
      if (validMatches.length > 0) {
        const dates = validMatches.map(m => {
          const date = new Date(m.played_at!); // On sait que played_at existe car on a filtré
          const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
          return {
            id: m.id,
            date: m.played_at!,
            dateNormalized: normalized.toISOString().split('T')[0],
            playerA: m.player_a_id === currentPlayer.id ? 'current' : 'other',
            playerB: m.player_b_id === currentPlayer.id ? 'current' : 'other',
          };
        });
      }
      
      // Utiliser le cache au lieu de forcer un refresh
      const players = await api.getPlayersCached(false);
      setAllPlayers(players);
      
      // NOTE: on ne charge plus les réactions "match only" ici.
      // Les réactions sont chargées en un seul appel unifié plus bas (match + membership).
      
      // Transformer les matchs pour l'ActivityFeed
      const matchItems = validMatches.map((match) => {
        const playerA = players.find(p => p.id === match.player_a_id);
        const playerB = players.find(p => p.id === match.player_b_id);
        
        if (!playerA || !playerB) return null;
        
        // Déterminer qui a joué ce match (priorité au joueur connecté, sinon le joueur suivi)
        let playedBy: PlayerDTO;
        if (match.player_a_id === currentPlayer.id) {
          playedBy = playerA;
        } else if (match.player_b_id === currentPlayer.id) {
          playedBy = playerB;
        } else if (followedIds.includes(match.player_a_id)) {
          playedBy = playerA;
        } else {
          playedBy = playerB;
        }
        
        // Déterminer si c'est un cas spécial
        const isWin = playedBy.id === match.player_a_id 
          ? (match.score_a !== null && match.score_b !== null && match.score_a > match.score_b)
          : (match.score_a !== null && match.score_b !== null && match.score_b > match.score_a);
        const specialStatus = getMatchSpecialStatus(match, playedBy.id, isWin);
        const isSpecialCase = !!(match.no_show_player_id || match.retired_player_id || match.delayed_player_id);
        
        return {
          type: 'match' as const,
          match,
          playerA,
          playerB,
          playerAScore: match.score_a,
          playerBScore: match.score_b,
          isSpecialCase,
          specialStatus,
          playedBy,
          playedAt: new Date(match.played_at!), // Toujours utiliser played_at car on a déjà filtré pour qu'il existe
        };
      }).filter((item): item is NonNullable<typeof item> => item !== null);

      // Récupérer les changements de statut des joueurs suivis (1 semaine max)
      const statusItems = players
        .filter(player => {
          // Inclure si c'est un joueur suivi OU le joueur connecté
          const isFollowed = followedIds.includes(player.id);
          const isCurrent = player.id === currentPlayer.id;
          if (!isFollowed && !isCurrent) return false;

          // Vérifier qu'il a un current_box avec next_box_status_change_date
          if (!player.current_box?.next_box_status_change_date) return false;

          // Vérifier que le changement est dans les 7 derniers jours
          const changeDate = new Date(player.current_box.next_box_status_change_date);
          changeDate.setHours(0, 0, 0, 0);
          if (changeDate < oneWeekAgo) return false;

          // Ne garder que les statuts "continue" (réinscrit) ou "stop" (arrêt)
          // Exclure les statuts null (en attente)
          const status = player.current_box.next_box_status;
          if (status !== 'continue' && status !== 'stop') return false;

          return true;
        })
        .map(player => ({
          type: 'status_change' as const,
          player,
          status: player.current_box!.next_box_status,
          changedAt: new Date(player.current_box!.next_box_status_change_date!),
          membershipId: player.current_box!.membership_id.toString(),
        }));

      // Charger les réactions pour les matchs ET les changements de statut (unifié)
      const reactionsMap: { [itemId: string]: { [reaction: string]: number } } = {};
      const userReactionsMap: { [itemId: string]: string | null } = {};

      // Préparer toutes les entités pour un seul appel API
      const entities: Array<{ type: 'match' | 'membership'; id: string }> = [];
      validMatches.forEach(m => entities.push({ type: 'match', id: m.id }));
      statusItems.forEach(item => entities.push({ type: 'membership', id: item.membershipId }));

      if (entities.length > 0) {
        try {
          const reactionsData = await api.getReactions(entities, currentPlayer.id);
          
          Object.entries(reactionsData).forEach(([entityId, data]) => {
            reactionsMap[entityId] = data.reactions || {};
            userReactionsMap[entityId] = data.userReaction || null;
          });
        } catch (error) {
          console.error('Erreur chargement réactions:', error);
        }
      }

      setMatchReactions(reactionsMap);
      setUserReactions(userReactionsMap);

      // Combiner les matchs et les changements de statut
      const feedItems = [...matchItems, ...statusItems];
      
  
      // Trier par date décroissante (plus récent en premier)
      feedItems.sort((a, b) => {
        const dateA = a.type === 'match' ? a.playedAt : a.changedAt;
        const dateB = b.type === 'match' ? b.playedAt : b.changedAt;
        return dateB.getTime() - dateA.getTime();
      });
      

      setFollowedPlayersMatches(feedItems);
    } catch (error: any) {
      console.error('Erreur chargement joueurs suivis:', error);
      if (error.message?.includes('404') || error.message?.includes('Not Found')) {
        setFollowedPlayers([]);
        setFollowedPlayersMatches([]);
      }
    } finally {
      isLoadingFollowedPlayersRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentPlayer?.id]);

  useEffect(() => {
    if (currentPlayer?.id) {
      loadFollowedPlayers();
    }
  }, [currentPlayer?.id, loadFollowedPlayers]);

  // Charger les matchs en live (seulement ceux des joueurs suivis)
  const loadLiveMatches = useCallback(async (sharedFollowing?: PlayerDTO[], isRefresh = false) => {
    if (!currentPlayer?.id) {
      setLiveMatches([]);
      return;
    }

    try {
      // Si following n'est pas fourni, le charger (mais on évite de le charger 2 fois)
      let following = sharedFollowing;
      if (!following) {
        following = await api.getFollowing(currentPlayer.id);
      }

      const [matches, seasons, players] = await Promise.all([
        api.getLiveMatches(),
        api.getSeasonsCached(isRefresh),
        // Utiliser le cache pour les joueurs même lors du refresh (les joueurs changent rarement)
        api.getPlayersCached(false),
      ]);

      setAllPlayers(players);

      // Récupérer toutes les boxes de toutes les saisons actives (pour afficher les boxes de tous les matchs en live)
      const activeSeasons = getActiveSeasons(seasons);
      const allBoxesPromises = activeSeasons.map(season => api.getBoxes(season.id));
      const boxesArrays = await Promise.all(allBoxesPromises);
      const allBoxesFlat = boxesArrays.flat();
      setAllBoxes(allBoxesFlat);

      // Filtrer les matchs : seulement ceux où le joueur suit un des deux joueurs
      const followedIds = following.map(p => p.id);
      const filteredMatches = matches.filter(match => 
        followedIds.includes(match.player_a_id) || followedIds.includes(match.player_b_id)
      );

      setLiveMatches(filteredMatches);
    } catch (error) {
      console.error('Erreur chargement matchs en live:', error);
      setLiveMatches([]);
    }
  }, [currentPlayer?.id]);

  useEffect(() => {
    loadLiveMatches();
  }, [loadLiveMatches]);

  // NOTE: on évite le refresh automatique + reload au focus (trop de requêtes).
  // Le feed se met à jour via pull-to-refresh.

  const handleRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    
    // Charger getFollowing une seule fois et le partager entre les deux fonctions
    if (!currentPlayer?.id) {
      setRefreshing(false);
      return;
    }
    
    try {
      // Charger following une seule fois pour le partager
      const following = await api.getFollowing(currentPlayer.id);
      
      // loadFollowedPlayers(true) et loadLiveMatches(true) vont déjà forcer le refresh des caches avec isRefresh=true
      await Promise.all([
        loadFollowedPlayers(following, true),
        loadLiveMatches(following, true),
      ]);
    } catch (error) {
      console.error('Erreur lors du refresh:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleReaction = async (itemId: string, reaction: string, type: 'match' | 'status') => {
    if (!currentPlayer) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    try {
      // Toggle reaction: si déjà réagi avec cette réaction, la retirer, sinon l'ajouter
      const currentReaction = userReactions[itemId];
      const newReaction = currentReaction === reaction ? null : reaction;
      
      // Appel API unifié selon le type
      const entityType = type === 'match' ? 'match' : 'membership';
      await api.reactToEntity(entityType, itemId, currentPlayer.id, newReaction);
      
      // Mise à jour locale optimiste
      setUserReactions(prev => ({
        ...prev,
        [itemId]: newReaction,
      }));
      
      setMatchReactions(prev => {
        const current = prev[itemId] || {};
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
          [itemId]: newCounts,
        };
      });
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error('Erreur réaction:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erreur', error.message || 'Impossible d\'ajouter la réaction');
    }
  };

  const handleComment = async (itemId: string, text: string, entityType: 'match' | 'membership') => {
    if (!currentPlayer) return;
    
    try {
      // Utiliser l'API unifiée pour les commentaires
      const comment = await api.addComment(entityType, itemId, currentPlayer.id, text);
      
      // Mettre à jour les commentaires locaux
      setMatchComments(prev => ({
        ...prev,
        [itemId]: [...(prev[itemId] || []), comment],
      }));
    } catch (error: any) {
      console.error('Erreur commentaire:', error);
      throw error;
    }
  };

  const handleLoadComments = async (itemId: string, entityType: 'match' | 'membership') => {
    try {
      // Utiliser l'API unifiée pour les commentaires
      return await api.getComments(entityType, itemId);
    } catch (error: any) {
      console.error('Erreur chargement commentaires:', error);
      // En cas d'erreur, retourner les commentaires locaux s'ils existent
      return matchComments[itemId] || [];
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
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: 20, paddingBottom: 60 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.emptyCard, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
            <IconSymbol name="sparkles" size={48} color={colors.text + '40'} />
            <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
              Connectez-vous pour voir le feed
            </ThemedText>
            <ThemedText style={[styles.emptyDescription, { color: colors.text + '70' }]}>
              Suivez des joueurs pour voir leurs derniers matchs ici
            </ThemedText>
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <AppBar />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: 20 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.text + '80'}
              colors={[colors.text + '80']}
            />
          }
        >

        {/* Matchs en live des joueurs suivis */}
        {liveMatches.length > 0 && (
          <View style={styles.section}>
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

        {/* Feed d'actualité - Matchs des joueurs suivis */}
        {followedPlayersMatches.length > 0 ? (
          <View style={styles.section}>
            {liveMatches.length > 0 && (
              <View style={styles.sectionHeader}>
                <IconSymbol name="sparkles" size={18} color={PRIMARY_COLOR} />
                <ThemedText style={[styles.sectionTitle, { color: colors.text }]}>
                  Matchs récents
                </ThemedText>
              </View>
            )}
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
              onInputFocus={(inputRef) => {
                if (inputRef.current && scrollViewRef.current) {
                    inputRef.current.measureLayout(
                      scrollViewRef.current as any,
                      (x, y, width, height) => {

                        const targetY = y - 350;
                        
                        console.log('scrolling to y : ', targetY);

                        scrollViewRef.current?.scrollTo({
                          y: targetY,
                          animated: true,
                        });
                      },
                      () => {
                        // Si measureLayout échoue, utiliser scrollToEnd comme fallback
                        scrollViewRef.current?.scrollToEnd({ animated: true });
                      }
                    );
                }
              }}
            />
          </View>
        ) : (
          liveMatches.length === 0 && (
            <View style={[styles.emptyCard, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}>
              <IconSymbol name="sparkles" size={48} color={colors.text + '40'} />
              <ThemedText style={[styles.emptyTitle, { color: colors.text }]}>
                Aucun match récent
              </ThemedText>
              <ThemedText style={[styles.emptyDescription, { color: colors.text + '70' }]}>
                Suivez des joueurs pour voir leurs matchs dans votre feed
              </ThemedText>
            </View>
          )
        )}

        <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      
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
  header: {
    marginBottom: 20,
  },
  headerLeft: {
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
  headerTitle: {
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
  emptyCard: {
    borderRadius: 16,
    padding: 40,
    marginBottom: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
});
