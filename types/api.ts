// Types pour l'API Squash Manager

// Joueur
export interface PlayerDTO {
  id: string; // GUID
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  picture: string | null; // URL de la photo de profil
  schedule_preference: string | null; // Préférence de planning
  active: boolean;
  created_at: string;
  current_box: PlayerBoxInfoDTO | null;
  next_box_status?: string | null;
}

export interface PlayerBoxInfoDTO {
  box_id: string;
  box_name: string;
  box_number: number;
  season_id: string;
  season_name: string;
  next_box_status: string | null;
  next_box_status_change_date: string | null;
  membership_id: number;
  membership_rank: number;
}

// Box
export interface BoxDTO {
  id: string;
  season_id: string;
  level: number;
  name: string;
  players_count: number;
}

// Match
export interface MatchDTO {
  id: string; // GUID
  season_id: string;
  box_id: string;
  week_number: number;
  player_a_id: string; // GUID
  player_b_id: string; // GUID
  scheduled_at: string | null;
  slot_number: number | null;
  status: string;
  score_a: number | null;
  score_b: number | null;
  points_a: number | null;
  points_b: number | null;
  played_at: string | null;
  delayed_player_id: string | null; // GUID - rempli seulement quand le report est accepté et le match remis
  delayed_requested_by: string | null; // GUID - indique qui a demandé le report
  delayed_status: string | null; // 'pending', 'accepted', 'rejected', 'cancelled'
  delayed_requested_at: string | null;
  delayed_resolved_at: string | null;
  retired_player_id: string | null; // GUID
  no_show_player_id: string | null; // GUID
  running: boolean;
  running_since: string | null;
  terrain_number: number | null;
}

// Saison
export interface SeasonDTO {
  id: string;
  competition_id: string;
  name: string;
  start_date: string;
  end_date: string;
  weeks_count: number;
  status: string;
}

// File d'attente
export interface WaitingListEntryDTO {
  id: string; // GUID
  player_id: string; // GUID
  target_box_number: number | null;
  created_at: string;
  processed: boolean;
  order_no: number | null;
}

// Relation de suivi entre joueurs
export interface PlayerFollowDTO {
  id: string; // GUID
  follower_id: string; // GUID - qui suit
  followed_id: string; // GUID - qui est suivi
  created_at: string;
}

// Statut de suivi
export interface FollowStatusDTO {
  isFollowing: boolean;
  followersCount: number;
  followingCount: number;
}

// Type d'entité pour les réactions et commentaires
export type EntityType = 'match' | 'membership';

// Commentaire générique (peut être sur un match, membership, etc.)
export interface CommentDTO {
  id: string; // GUID
  entity_type: EntityType; // Type d'entité commentée
  entity_id: string; // GUID de l'entité (match_id, membership_id, etc.)
  player_id: string; // GUID du commentateur
  text: string;
  created_at: string;
  player: PlayerDTO; // Informations sur le joueur qui a commenté
}

// Alias pour compatibilité avec l'ancien code
export interface MatchCommentDTO {
  id: string; // GUID
  match_id: string; // GUID (alias pour entity_id)
  player_id: string; // GUID du commentateur
  text: string;
  created_at: string;
  player: PlayerDTO; // Informations sur le joueur qui a commenté
  // Champs optionnels pour compatibilité avec le nouveau système
  entity_type?: EntityType;
  entity_id?: string;
}

// Réaction générique (peut être sur un match, membership, etc.)
export interface ReactionDTO {
  entity_type: EntityType; // Type d'entité réagie
  entity_id: string; // GUID de l'entité (match_id, membership_id, etc.)
  reactions: { [reaction: string]: number }; // { "fire": 5, "clap": 2, ... }
  userReaction: string | null; // Réaction de l'utilisateur actuel (null si aucune)
}

// Types de notifications
export type NotificationType = 'membership_added' | 'match_comment' | 'match_started' | 'match_played';

// Notification
export interface NotificationDTO {
  id: string; // GUID
  player_id: string; // GUID du joueur qui reçoit la notification
  type: NotificationType;
  title: string;
  body: string;
  data?: {
    entity_type?: EntityType;
    entity_id?: string;
    membership_id?: string;
    match_id?: string;
    comment_id?: string;
    commenter_id?: string;
    [key: string]: any;
  };
  read: boolean;
  created_at: string;
}

// Token de notification push
export interface NotificationTokenDTO {
  player_id: string; // GUID
  token: string; // Token Expo Push
  platform: 'ios' | 'android' | 'web';
}
