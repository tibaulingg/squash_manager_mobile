import { API_BASE_URL } from '@/constants/config';
import type { BoxDTO, CommentDTO, EntityType, FollowStatusDTO, MatchCommentDTO, MatchDTO, NotificationDTO, NotificationTokenDTO, PlayerDTO, PlayerFollowDTO, ReactionDTO, SeasonDTO, WaitingListEntryDTO } from '@/types/api';
import { ApiError, createApiError, createNetworkError } from '@/utils/api-errors';

// Helper pour convertir CommentDTO en MatchCommentDTO (pour compatibilité)
function convertCommentToMatchComment(comment: CommentDTO | any, entityType: EntityType, entityId: string): MatchCommentDTO {
  // L'API .NET peut retourner les champs en PascalCase, donc on gère les deux formats
  const created_at = comment.created_at || comment.CreatedAt || comment.createdAt;
  
  return {
    id: comment.id || comment.Id,
    match_id: entityType === 'match' ? entityId : (comment.entity_id || comment.EntityId || comment.entityId),
    player_id: comment.player_id || comment.PlayerId || comment.playerId,
    text: comment.text || comment.Text,
    created_at: created_at,
    player: comment.player || comment.Player,
    entity_type: comment.entity_type || comment.EntityType || comment.entityType,
    entity_id: comment.entity_id || comment.EntityId || comment.entityId,
  };
}

// Fonction helper simple pour les requêtes
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
	const base = API_BASE_URL.replace(/\/+$/, '')
	const path = endpoint.replace(/^\/+/, '')
	const url = `${base}/${path}`
  
  try {
    const response = await fetch(url, options);
   
    // Lire le body une seule fois
    const text = await response.text();

    console.log('url | reponse size', url, text.length)

    if (!response.ok) {
      // Parser le body d'erreur si disponible
      let errorJson: any = null;
      if (text) {
        try {
          errorJson = JSON.parse(text);
        } catch {
          // Pas du JSON, garder le texte brut
        }
      }
      
      // Logger toutes les infos d'erreur
      try {
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        
        console.error('❌ API Error:', {
          url,
          method: options?.method || 'GET',
          status: response.status,
          statusText: response.statusText,
          headers,
          errorBody: text,
          errorJson,
          requestOptions: {
            method: options?.method,
            headers: options?.headers,
            // Ne pas logger le body car il peut être sensible ou volumineux
          },
        });
      } catch (logError) {
        // Si le logging échoue, continuer quand même
        console.error('❌ API Error (logging failed):', logError);
      }
      
      // Créer une ApiError avec message utilisateur-friendly
      throw createApiError(response.status, response.statusText, text, errorJson);
    }
    
    // Gérer les réponses vides (204 No Content)
    if (response.status === 204 || !text) {
      return {} as T;
    }
    
    return JSON.parse(text);
  } catch (error: any) {
    // Si c'est déjà une ApiError, la relancer
    if (error instanceof ApiError) {
      throw error;
    }
    
    // Si c'est une erreur réseau (pas de réponse du serveur)
    if (error.name === 'TypeError' && (error.message.includes('fetch') || error.message.includes('network'))) {
      throw createNetworkError(error);
    }
    
    // Sinon, logger l'erreur et créer une erreur générique
    console.error('❌ Network Error:', {
      url,
      method: options?.method || 'GET',
      error: error.message,
      stack: error.stack,
    });
    
    throw createNetworkError(error);
  }
}

// --- Simple in-memory cache (app session) ---
let playersCache: PlayerDTO[] | null = null;
let playersCachePromise: Promise<PlayerDTO[]> | null = null;
let seasonsCache: SeasonDTO[] | null = null;
let seasonsCachePromise: Promise<SeasonDTO[]> | null = null;

// Services API minimaux
export const api = {
  // Saisons
  getSeasons: () => fetchApi<SeasonDTO[]>('/Seasons'),
  
  /**
   * Retourne les saisons en cache (mémoire) pour éviter les appels répétés.
   * - 1er appel: fetch réseau + cache
   * - appels suivants: renvoie le cache
   * - forceRefresh=true: refetch + remplace le cache
   */
  getSeasonsCached: (forceRefresh = false) => {
    if (!forceRefresh && seasonsCache) return Promise.resolve(seasonsCache);
    if (!forceRefresh && seasonsCachePromise) return seasonsCachePromise;

    seasonsCachePromise = fetchApi<SeasonDTO[]>('/Seasons')
      .then((seasons) => {
        seasonsCache = seasons;
        return seasons;
      })
      .finally(() => {
        seasonsCachePromise = null;
      });

    return seasonsCachePromise;
  },
  
  clearSeasonsCache: () => {
    seasonsCache = null;
    seasonsCachePromise = null;
  },
  
  // Boxes
  getBoxes: (seasonId: string) => fetchApi<BoxDTO[]>(`/Boxes?season_id=${seasonId}`),
  
  // Matchs
  getMatches: (seasonId?: string, boxId?: string, playerId?: string, year?: number) => {
    const params = new URLSearchParams();
    if (seasonId) params.append('season_id', seasonId);
    if (boxId) params.append('box_id', boxId);
    if (playerId) params.append('player_id', playerId);
    if (year) params.append('year', year.toString());
    const queryString = params.toString();
    return fetchApi<MatchDTO[]>(`/Matches${queryString ? `?${queryString}` : ''}`);
  },
  
  // Joueurs
  getPlayers: (boxId?: string) => {
    const params = new URLSearchParams();
    if (boxId) params.append('box_id', boxId);
    const queryString = params.toString();
    return fetchApi<PlayerDTO[]>(`/Players${queryString ? `?${queryString}` : ''}`);
  },

  /**
   * Retourne la liste des joueurs en cache (mémoire) pour éviter les appels répétés.
   * - 1er appel: fetch réseau + cache
   * - appels suivants: renvoie le cache
   * - forceRefresh=true: refetch + remplace le cache
   * - boxId: optionnel, filtre les joueurs par box_id
   */
  getPlayersCached: (forceRefresh = false, boxId?: string) => {
    // Si on filtre par box_id, ne pas utiliser le cache global (car il contient tous les joueurs)
    if (boxId) {
      return api.getPlayers(boxId);
    }
    
    if (!forceRefresh && playersCache) return Promise.resolve(playersCache);
    if (!forceRefresh && playersCachePromise) return playersCachePromise;

    playersCachePromise = fetchApi<PlayerDTO[]>('/Players')
      .then((players) => {
        playersCache = players;
        return players;
      })
      .finally(() => {
        playersCachePromise = null;
      });

    return playersCachePromise;
  },

  clearPlayersCache: () => {
    playersCache = null;
    playersCachePromise = null;
  },
  
  /**
   * Authentifie un joueur avec email et mot de passe hashé en SHA256
   * @param email Email du joueur
   * @param passwordHash Mot de passe hashé en SHA256
   * @returns Le joueur authentifié
   */
  login: (email: string, passwordHash: string) =>
    fetchApi<PlayerDTO>('/Players/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Email: email,
        PasswordHash: passwordHash,
      }),
    }),

  registerPlayer: (data: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    password_hash: string;
    schedule_preference?: string;
  }) => {
    const formData = new FormData();
    formData.append('FirstName', data.first_name);
    formData.append('LastName', data.last_name);
    formData.append('Email', data.email);
    formData.append('Phone', data.phone);
    formData.append('PasswordHash', data.password_hash);
    
    if (data.schedule_preference) {
      formData.append('SchedulePreference', data.schedule_preference);
    }

    return fetchApi<PlayerDTO>('/Players/register', {
      method: 'POST',
      body: formData,
      // Ne pas mettre Content-Type, FormData le gère automatiquement avec le boundary
    });
  },

  /**
   * Demande de réinitialisation de mot de passe
   * @param email Email du joueur
   */
  requestPasswordReset: (email: string) =>
    fetchApi<{ message: string }>('/Players/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Email: email }),
    }),

  /**
   * Réinitialise le mot de passe avec un token
   * @param token Token de réinitialisation reçu par email
   * @param newPasswordHash Nouveau mot de passe hashé en SHA256
   */
  resetPassword: (token: string, newPasswordHash: string) =>
    fetchApi<{ message: string }>('/Players/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Token: token,
        NewPasswordHash: newPasswordHash,
      }),
    }),
  
  updatePlayerNextBoxStatus: (playerId: string, status: string | null) => 
    fetchApi<PlayerDTO>(`/Players/${playerId}/next-box-status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ NextBoxStatus: status }),
    }),
  
  updatePlayerInfo: (playerId: string, data: { 
    first_name: string; 
    last_name: string; 
    email: string; 
    phone: string;
    schedule_preference?: string;
    profile_image?: {
      uri: string;
      name: string;
      type: string;
    };
  }) => {
    const formData = new FormData();
    formData.append('FirstName', data.first_name);
    formData.append('LastName', data.last_name);
    formData.append('Email', data.email);
    formData.append('Phone', data.phone);
    
    if (data.schedule_preference) {
      formData.append('SchedulePreference', data.schedule_preference);
    }
    
    // Ajouter l'image seulement si présente
    if (data.profile_image) {
      formData.append('ProfileImage', {
        uri: data.profile_image.uri,
        name: data.profile_image.name,
        type: data.profile_image.type,
      } as any);
    }

    return fetchApi<PlayerDTO>(`/Players/${playerId}`, {
      method: 'PUT',
      body: formData,
    });
  },

  // File d'attente
  getWaitingList: () => fetchApi<WaitingListEntryDTO[]>('/WaitingList'),
  
  addToWaitingList: (playerId: string, targetBoxNumber: number | null) =>
    fetchApi<WaitingListEntryDTO>('/WaitingList/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        PlayerId: playerId,
        TargetBoxNumber: targetBoxNumber,
      }),
    }),

  removeFromWaitingList: (entryId: string) =>
    fetchApi<void>(`/WaitingList/${entryId}`, {
      method: 'DELETE',
    }),

  // Demandes de report
  requestMatchDelay: (matchId: string, playerId: string) =>
    fetchApi<MatchDTO>(`/Matches/${matchId}/request-delay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        PlayerId: playerId,
        DelayedRequestedBy: playerId,
      }),
    }),

  acceptMatchDelay: (matchId: string, playerId: string) =>
    fetchApi<MatchDTO>(`/Matches/${matchId}/accept-delay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ PlayerId: playerId }),
    }),

  rejectMatchDelay: (matchId: string, playerId: string) =>
    fetchApi<MatchDTO>(`/Matches/${matchId}/reject-delay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ PlayerId: playerId }),
    }),

  cancelMatchDelay: (matchId: string, playerId: string) =>
    fetchApi<MatchDTO>(`/Matches/${matchId}/cancel-delay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ PlayerId: playerId }),
    }),

  // Système de suivi (Follow)
  followPlayer: (playerId: string, currentPlayerId: string) =>
    fetchApi<PlayerFollowDTO>(`/PlayerFollows/${playerId}?currentPlayerId=${currentPlayerId}`, {
      method: 'POST',
    }),

  unfollowPlayer: (playerId: string, currentPlayerId: string) =>
    fetchApi<void>(`/PlayerFollows/${playerId}?currentPlayerId=${currentPlayerId}`, {
      method: 'DELETE',
    }),

  getFollowStatus: (currentPlayerId: string, playerId: string) =>
    fetchApi<FollowStatusDTO>(`/PlayerFollows/status/${playerId}?currentPlayerId=${currentPlayerId}`),

  getFollowing: (currentPlayerId: string) =>
    fetchApi<PlayerDTO[]>(`/PlayerFollows/following?currentPlayerId=${currentPlayerId}`),

  getFollowers: (currentPlayerId: string) =>
    fetchApi<PlayerDTO[]>(`/PlayerFollows/followers?currentPlayerId=${currentPlayerId}`),

  getFollowedPlayersMatches: (playerId: string, limit: number = 50) =>
    fetchApi<MatchDTO[]>(`/Matches/followed?playerId=${playerId}&limit=${limit}`),

  getLiveMatches: () => fetchApi<MatchDTO[]>('/Matches/live'),

  // ============================================
  // RÉACTIONS - API unifiée
  // ============================================
  
  /**
   * Récupère les réactions pour plusieurs entités (matchs, memberships, etc.)
   * @param entities Array de { type: 'match' | 'membership' | 'other', id: string }
   * @param currentPlayerId ID du joueur actuel
   */
  getReactions: (entities: Array<{ type: EntityType; id: string }>, currentPlayerId: string) => {
    return fetchApi<{ [entityId: string]: ReactionDTO }>(
      `/Reactions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Entities: entities.map(e => ({ EntityType: e.type, EntityId: e.id })),
          CurrentPlayerId: currentPlayerId,
        }),
      }
    );
  },

  /**
   * Ajoute ou retire une réaction sur une entité
   * @param entityType Type d'entité ('match', 'membership', etc.)
   * @param entityId ID de l'entité
   * @param currentPlayerId ID du joueur actuel
   * @param reaction Type de réaction ('fire', 'clap', etc.) ou null pour retirer
   */
  reactToEntity: (entityType: EntityType, entityId: string, currentPlayerId: string, reaction: string | null) =>
    fetchApi<void>(`/Reactions/${entityType}/${entityId}?currentPlayerId=${currentPlayerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        PlayerId: currentPlayerId,
        ReactionType: reaction,
      }),
    }),

  /**
   * Récupère la liste de tous les joueurs qui ont réagi (groupés par type de réaction)
   * @param entityType Type d'entité ('match', 'membership', etc.)
   * @param entityId ID de l'entité
   */
  getReactionPlayers: (entityType: EntityType, entityId: string) =>
    fetchApi<{ [reactionType: string]: PlayerDTO[] }>(`/Reactions/${entityType}/${entityId}/players`),

  // ============================================
  // COMMENTAIRES - API unifiée
  // ============================================
  
  /**
   * Récupère les commentaires pour une entité
   * @param entityType Type d'entité ('match', 'membership', etc.)
   * @param entityId ID de l'entité
   */
  getComments: (entityType: EntityType, entityId: string) =>
    fetchApi<CommentDTO[]>(`/Comments/${entityType}/${entityId}`).then(comments => {
      const commentsAny = comments as any[];
      return commentsAny
        .filter((comment) => {
          // L'API peut retourner les champs en PascalCase, donc on gère les deux formats
          const commentType = comment.entity_type || comment.EntityType || comment.entityType;
          return commentType === entityType;
        })
        .map((comment) => convertCommentToMatchComment(comment, entityType, entityId));
    }),

  /**
   * Récupère les commentaires pour plusieurs entités en batch
   * @param entities Array de { type: EntityType, id: string }
   * @param currentPlayerId ID du joueur actuel
   */
  getCommentsBatch: (entities: Array<{ type: EntityType; id: string }>, currentPlayerId: string) =>
    fetchApi<{ [entityId: string]: CommentDTO[] }>(`/Comments/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Entities: entities.map(e => ({ EntityType: e.type, EntityId: e.id })),
        CurrentPlayerId: currentPlayerId,
      }),
    }).then(data => {
      // Convertir les CommentDTO en MatchCommentDTO pour compatibilité
      const result: { [entityId: string]: MatchCommentDTO[] } = {};
      Object.entries(data).forEach(([entityId, comments]) => {
        const entity = entities.find(e => e.id === entityId);
        const expectedType = entity?.type || 'match';
        // Filtrer les commentaires pour ne garder que ceux du bon type (exclure 'conversation')
        const commentsAny = comments as any[];
        result[entityId] = commentsAny
          .filter((comment) => {
            // L'API peut retourner les champs en PascalCase, donc on gère les deux formats
            const commentType = comment.entity_type || comment.EntityType || comment.entityType;
            return commentType === expectedType;
          })
          .map((comment) => 
            convertCommentToMatchComment(comment, expectedType, entityId)
          );
      });
      return result;
    }),

  /**
   * Ajoute un commentaire sur une entité
   * @param entityType Type d'entité ('match', 'membership', etc.)
   * @param entityId ID de l'entité
   * @param currentPlayerId ID du joueur actuel
   * @param text Texte du commentaire
   */
  addComment: (entityType: EntityType, entityId: string, currentPlayerId: string, text: string) =>
    fetchApi<CommentDTO>(`/Comments/${entityType}/${entityId}?currentPlayerId=${currentPlayerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        PlayerId: currentPlayerId,
        Text: text,
      }),
    }).then(comment => convertCommentToMatchComment(comment, entityType, entityId)),

  /**
   * Supprime un commentaire
   * @param commentId ID du commentaire
   * @param currentPlayerId ID du joueur actuel
   */
  deleteComment: (commentId: string, currentPlayerId: string) =>
    fetchApi<void>(`/Comments/${commentId}?currentPlayerId=${currentPlayerId}`, {
      method: 'DELETE',
    }),

  // ============================================
  // ALIAS pour compatibilité avec l'ancien code
  // ============================================
  
  // Commentaires de matchs (alias vers l'API unifiée)
  getMatchComments: (matchId: string) =>
    fetchApi<MatchCommentDTO[]>(`/Comments/match/${matchId}`),

  getMatchCommentsBatch: (matchIds: string[], currentPlayerId: string) =>
    fetchApi<{ [matchId: string]: MatchCommentDTO[] }>(`/Comments/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Entities: matchIds.map(id => ({ EntityType: 'match' as EntityType, EntityId: id })),
        CurrentPlayerId: currentPlayerId,
      }),
    }),

  addMatchComment: (matchId: string, currentPlayerId: string, text: string) =>
    fetchApi<MatchCommentDTO>(`/Comments/match/${matchId}?currentPlayerId=${currentPlayerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        PlayerId: currentPlayerId,
        Text: text,
      }),
    }),

  deleteMatchComment: (commentId: string, currentPlayerId: string) =>
    fetchApi<void>(`/Comments/${commentId}?currentPlayerId=${currentPlayerId}`, {
      method: 'DELETE',
    }),

  // Réactions aux matchs (alias vers l'API unifiée)
  getMatchReactions: (matchIds: string[], currentPlayerId: string) => {
    return fetchApi<{ [matchId: string]: { reactions: { [reaction: string]: number }, userReaction: string | null } }>(
      `/Reactions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Entities: matchIds.map(id => ({ EntityType: 'match' as EntityType, EntityId: id })),
          CurrentPlayerId: currentPlayerId,
        }),
      }
    ).then(data => {
      // Transformer la réponse pour compatibilité avec l'ancien format
      const result: { [matchId: string]: { reactions: { [reaction: string]: number }, userReaction: string | null } } = {};
      Object.entries(data).forEach(([entityId, reactionData]) => {
        result[entityId] = {
          reactions: reactionData.reactions,
          userReaction: reactionData.userReaction,
        };
      });
      return result;
    });
  },

  reactToMatch: (matchId: string, currentPlayerId: string, reaction: string | null) =>
    fetchApi<void>(`/Reactions/match/${matchId}?currentPlayerId=${currentPlayerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        PlayerId: currentPlayerId,
        ReactionType: reaction,
      }),
    }),

  // Réactions aux memberships (alias vers l'API unifiée)
  getMembershipReactions: (membershipIds: string[], currentPlayerId: string) => {
    return fetchApi<{ [membershipId: string]: { reactions: { [reaction: string]: number }, userReaction: string | null } }>(
      `/Reactions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Entities: membershipIds.map(id => ({ EntityType: 'membership' as EntityType, EntityId: id })),
          CurrentPlayerId: currentPlayerId,
        }),
      }
    ).then(data => {
      // Transformer la réponse pour compatibilité avec l'ancien format
      const result: { [membershipId: string]: { reactions: { [reaction: string]: number }, userReaction: string | null } } = {};
      Object.entries(data).forEach(([entityId, reactionData]) => {
        result[entityId] = {
          reactions: reactionData.reactions,
          userReaction: reactionData.userReaction,
        };
      });
      return result;
    });
  },

  reactToMembership: (membershipId: string, currentPlayerId: string, reaction: string | null) =>
    fetchApi<void>(`/Reactions/membership/${membershipId}?currentPlayerId=${currentPlayerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        PlayerId: currentPlayerId,
        ReactionType: reaction,
      }),
    }),

  // ============================================
  // NOTIFICATIONS
  // ============================================
  
  /**
   * Enregistre ou met à jour le token de notification push pour un joueur
   * @param playerId ID du joueur
   * @param token Token Expo Push
   * @param platform Plateforme ('ios', 'android', 'web')
   */
  registerNotificationToken: (playerId: string, token: string, platform: 'ios' | 'android' | 'web') =>
    fetchApi<NotificationTokenDTO>('/Notifications/register-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        PlayerId: playerId,
        Token: token,
        Platform: platform,
      }),
    }),

  /**
   * Récupère les notifications pour un joueur
   * @param playerId ID du joueur
   * @param unreadOnly Si true, retourne uniquement les notifications non lues
   */
  getNotifications: (playerId: string, unreadOnly: boolean = false) =>
    fetchApi<NotificationDTO[]>(`/Notifications?playerId=${playerId}&unreadOnly=${unreadOnly}`),

  /**
   * Marque une notification comme lue
   * @param notificationId ID de la notification
   * @param playerId ID du joueur
   */
  markNotificationAsRead: (notificationId: string, playerId: string) =>
    fetchApi<void>(`/Notifications/${notificationId}/read?playerId=${playerId}`, {
      method: 'PUT',
    }),

  /**
   * Marque toutes les notifications comme lues pour un joueur
   * @param playerId ID du joueur
   */
  markAllNotificationsAsRead: (playerId: string) =>
    fetchApi<void>(`/Notifications/mark-all-read?playerId=${playerId}`, {
      method: 'PUT',
    }),

  /**
   * Supprime une notification
   * @param notificationId ID de la notification
   * @param playerId ID du joueur
   */
  deleteNotification: (notificationId: string, playerId: string) =>
    fetchApi<void>(`/Notifications/${notificationId}?playerId=${playerId}`, {
      method: 'DELETE',
    }),
};


