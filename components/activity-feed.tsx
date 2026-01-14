import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps } from 'react';
import React, { useEffect, useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

import { PlayerAvatar } from '@/components/player-avatar';
import { ReactionAnimation } from '@/components/reaction-animation';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { MatchDTO, PlayerDTO } from '@/types/api';
import { formatMatchScore, type MatchSpecialStatus } from '@/utils/match-helpers';

interface ActivityFeedMatchItem {
  type: 'match';
  match: MatchDTO;
  playerA: PlayerDTO;
  playerB: PlayerDTO;
  playerAScore: number | null;
  playerBScore: number | null;
  isSpecialCase: boolean;
  specialStatus?: MatchSpecialStatus;
  playedBy: PlayerDTO; // Le joueur suivi qui a joué ce match
  playedAt: Date; // Date du match (scheduled_at ou played_at)
}

interface ActivityFeedStatusItem {
  type: 'status_change';
  player: PlayerDTO; // Le joueur suivi qui a changé de statut
  status: string | null; // 'continue', 'stop', ou null
  changedAt: Date; // Date du changement de statut
  membershipId: string; // ID du membership pour les réactions
}

export type ActivityFeedItem = ActivityFeedMatchItem | ActivityFeedStatusItem;

interface MatchCommentDTO {
  id: string; // GUID
  match_id: string; // GUID
  player_id: string; // GUID du commentateur
  text: string;
  created_at: string;
  player: PlayerDTO; // Informations sur le joueur qui a commenté
}

interface ActivityFeedProps {
  matches: ActivityFeedItem[];
  currentPlayerId?: string;
  onPlayerPress?: (playerId: string) => void;
  onReaction?: (itemId: string, reaction: string, type: 'match' | 'status') => void;
  reactions?: { [itemId: string]: { [reaction: string]: number } };
  userReactions?: { [itemId: string]: string | null };
  onComment?: (itemId: string, text: string, entityType: 'match' | 'membership') => Promise<void>;
  onLoadComments?: (itemId: string, entityType: 'match' | 'membership') => Promise<MatchCommentDTO[]>;
  onDeleteComment?: (commentId: string, itemId: string) => Promise<void>;
}

const REACTIONS = [
  { emoji: '❤️', name: 'heart' },
  { emoji: '🔥', name: 'fire' },
  { emoji: '👏', name: 'clap' },
  { emoji: '👍', name: 'thumbs_up' },
  { emoji: '👎', name: 'thumbs_down' },
  { emoji: '😢', name: 'sad' },
];

const formatDate = (date: Date): string => {
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

const formatMatchDate = (date: Date): string => {
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  
  const day = days[date.getDay()];
  const month = months[date.getMonth()];
  const dayNumber = date.getDate();
  const year = date.getFullYear();

  return `${day} ${dayNumber} ${month} ${year}`;
};

export function ActivityFeed({ 
  matches, 
  currentPlayerId, 
  onPlayerPress,
  onReaction,
  reactions = {},
  userReactions = {},
  onComment,
  onLoadComments,
  onDeleteComment,
}: ActivityFeedProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [commentTexts, setCommentTexts] = useState<{ [itemId: string]: string }>({});
  const [matchComments, setMatchComments] = useState<{ [itemId: string]: MatchCommentDTO[] }>({});
  const [postingComment, setPostingComment] = useState<Set<string>>(new Set());
  const [showReactions, setShowReactions] = useState<Set<string>>(new Set());
  const [showCommentInput, setShowCommentInput] = useState<Set<string>>(new Set());
  const [activeAnimations, setActiveAnimations] = useState<{ [itemId: string]: string | null }>({});
  
  // Charger les commentaires pour tous les matchs et memberships au début
  useEffect(() => {
    if (!onLoadComments) return;
    
    matches.forEach((item) => {
      if (item.type === 'match') {
        const matchId = item.match.id;
        if (!matchComments[matchId]) {
          onLoadComments(matchId, 'match')
            .then((comments) => {
              setMatchComments(prev => ({ ...prev, [matchId]: comments }));
            })
            .catch((error) => {
              console.error('Erreur chargement commentaires:', error);
            });
        }
      } else if (item.type === 'status_change') {
        const membershipId = item.membershipId;
        if (!matchComments[membershipId]) {
          onLoadComments(membershipId, 'membership')
            .then((comments) => {
              setMatchComments(prev => ({ ...prev, [membershipId]: comments }));
            })
            .catch((error) => {
              console.error('Erreur chargement commentaires membership:', error);
            });
        }
      }
    });
  }, [matches.map(m => m.type === 'match' ? m.match.id : m.type === 'status_change' ? m.membershipId : '').join(','), onLoadComments]);

  const handlePostComment = async (itemId: string, entityType: 'match' | 'membership') => {
    const text = commentTexts[itemId]?.trim();
    if (!text || !onComment) return;

    setPostingComment(prev => new Set(prev).add(itemId));

    try {
      await onComment(itemId, text, entityType);
      setCommentTexts(prev => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      
      // Fermer le champ de commentaire après l'envoi
      setShowCommentInput(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      
      // Recharger les commentaires
      if (onLoadComments) {
        const comments = await onLoadComments(itemId, entityType);
        setMatchComments(prev => ({ ...prev, [itemId]: comments }));
      }
    } catch (error) {
      console.error('Erreur commentaire:', error);
    } finally {
      setPostingComment(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const handleReaction = (itemId: string, reactionName: string, type: 'match' | 'status') => {
    const currentReaction = userReactions[itemId];
    const isAdding = currentReaction !== reactionName;
    
    if (isAdding) {
      const reaction = REACTIONS.find(r => r.name === reactionName);
      if (reaction) {
        setActiveAnimations(prev => ({ ...prev, [itemId]: reaction.emoji }));
        setTimeout(() => {
          setActiveAnimations(prev => {
            const next = { ...prev };
            delete next[itemId];
            return next;
          });
        }, 900);
      }
    }
    
    setShowReactions(prev => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
    
    onReaction?.(itemId, reactionName, type);
  };

  if (matches.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background }]}>
        <ThemedText style={[styles.emptyText, { color: colors.text, opacity: 0.5 }]}>
          Aucune activité récente
        </ThemedText>
      </View>
    );
  }

  const getStatusIcon = (status: string | null): string => {
    if (status === 'continue') return 'checkmark';
    if (status === 'stop') return 'xmark';
    return 'questionmark';
  };

  const getStatusColor = (status: string | null): string => {
    if (status === 'continue') return '#10b981';
    if (status === 'stop') return '#ef4444';
    return '#6b7280';
  };

  const getStatusText = (status: string | null): string => {
    if (status === 'continue') return 'Réinscrit';
    if (status === 'stop') return 'Ne continue pas';
    return 'En attente';
  };

  return (
    <View style={styles.container}>
      {matches.map((item, index) => {
        // Post de changement de statut
        if (item.type === 'status_change') {
          const statusColor = getStatusColor(item.status);
          const statusIcon = getStatusIcon(item.status);
          const statusText = getStatusText(item.status);
          const membershipId = item.membershipId;
          const statusReactions = reactions[membershipId] || {};
          const userStatusReaction = userReactions[membershipId];
          const totalStatusReactions = Object.values(statusReactions).reduce((sum, count) => sum + count, 0);

          return (
            <View
              key={`status-${item.player.id}-${item.changedAt.getTime()}`}
              style={[
                styles.postCard,
                { 
                  backgroundColor: colors.background, 
                  borderColor: colors.text + '15',
                  shadowColor: '#000',
                },
                index !== matches.length - 1 && styles.postSpacing,
              ]}
            >
              {/* Header du post - Avatar + Nom + Date + Badge Statut */}
              <View style={styles.postHeader}>
                <TouchableOpacity
                  style={styles.postHeaderLeft}
                  onPress={() => onPlayerPress?.(item.player.id)}
                  activeOpacity={0.7}
                  disabled={!onPlayerPress}
                >
                  <PlayerAvatar
                    firstName={item.player.first_name || 'Joueur'}
                    lastName={item.player.last_name || ''}
                    pictureUrl={item.player.picture}
                    size={40}
                  />
                  <View style={styles.postHeaderInfo}>
                    <ThemedText style={[styles.postHeaderName, { color: colors.text }]}>
                      {item.player.first_name} {item.player.last_name}
                    </ThemedText>
                    <ThemedText style={[styles.postHeaderDate, { color: colors.text + '60' }]}>
                      {formatDate(item.changedAt)}
                    </ThemedText>
                  </View>
                </TouchableOpacity>
                
                {/* Badge Statut à droite */}
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: statusColor + '15',
                    },
                  ]}
                >
                  <IconSymbol name={statusIcon as ComponentProps<typeof IconSymbol>['name']} size={14} color={statusColor} />
                  <ThemedText style={[styles.statusText, { color: statusColor }]}>
                    {statusText}
                  </ThemedText>
                </View>
              </View>

              {/* Séparateur */}
              {(onReaction || onComment) && (
                <View style={[styles.postSeparator, { borderTopColor: colors.text + '15' }]} />
              )}

              {/* Actions (Réactions et Commentaires) */}
              {(onReaction || onComment) && (
                <View style={styles.postActions}>
                  <View style={styles.postActionsLeft}>
                    {/* Bouton réactions */}
                    {onReaction && (
                      <TouchableOpacity
                        style={[styles.toggleButton, { borderColor: colors.text + '20' }]}
                        onPress={() => {
                          setShowReactions(prev => {
                            const next = new Set(prev);
                            if (next.has(membershipId)) {
                              next.delete(membershipId);
                            } else {
                              next.add(membershipId);
                            }
                            return next;
                          });
                        }}
                        activeOpacity={0.7}
                      >
                        <IconSymbol 
                          name={userStatusReaction ? "face.smiling.fill" : "face.smiling"} 
                          size={18} 
                          color={userStatusReaction ? PRIMARY_COLOR : colors.text + '80'} 
                        />
                      </TouchableOpacity>
                    )}
                    
                    {/* Bouton commentaires */}
                    {onComment && (
                      <TouchableOpacity
                        style={[styles.toggleButton, { borderColor: colors.text + '20' }]}
                        onPress={() => {
                          setShowCommentInput(prev => {
                            const next = new Set(prev);
                            if (next.has(membershipId)) {
                              next.delete(membershipId);
                            } else {
                              next.add(membershipId);
                            }
                            return next;
                          });
                        }}
                        activeOpacity={0.7}
                      >
                        <IconSymbol 
                          name="bubble.left" 
                          size={18} 
                          color={colors.text + '80'} 
                        />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Résumé des réactions */}
                  {totalStatusReactions > 0 && (
                    <View style={styles.reactionsSummary}>
                      {REACTIONS.map((reaction) => {
                        const count = statusReactions[reaction.name] || 0;
                        if (count === 0) return null;
                        return (
                          <View key={reaction.name} style={[styles.reactionBadge, { borderColor: colors.text + '20' }]}>
                            <ThemedText style={styles.reactionEmoji}>{reaction.emoji}</ThemedText>
                            {count > 1 && (
                              <ThemedText style={[styles.reactionCount, { color: colors.text + '70' }]}>
                                {count}
                              </ThemedText>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              {/* Panneau de réactions */}
              {onReaction && showReactions.has(membershipId) && (
                <View style={[styles.reactionsPanel, { borderTopColor: colors.text + '10' }]}>
                  <View style={styles.reactionsContainer}>
                    {REACTIONS.map((reaction) => {
                      const isActive = userStatusReaction === reaction.name;
                      return (
                        <TouchableOpacity
                          key={reaction.name}
                          style={[
                            styles.reactionButton,
                            isActive && { backgroundColor: colors.text + '10' },
                          ]}
                          onPress={() => onReaction(membershipId, reaction.name, 'status')}
                          activeOpacity={0.7}
                        >
                          <ThemedText style={styles.reactionEmojiButton}>{reaction.emoji}</ThemedText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Section commentaires */}
              {(() => {
                const comments = matchComments[membershipId] || [];
                const visibleComments = comments;

                return (
                  <>
                    {comments.length > 0 && (
                      <View style={styles.commentsSection}>
                        {visibleComments.map((comment) => {
                          const isOwnComment = currentPlayerId && (
                            comment.player_id === currentPlayerId || 
                            comment.player?.id === currentPlayerId
                          );
                          return (
                            <View key={comment.id} style={styles.commentItem}>
                              <TouchableOpacity
                                onPress={() => onPlayerPress?.(comment.player.id)}
                                activeOpacity={0.7}
                                disabled={!onPlayerPress}
                              >
                                <PlayerAvatar
                                  firstName={comment.player.first_name}
                                  lastName={comment.player.last_name}
                                  pictureUrl={comment.player.picture}
                                  size={32}
                                />
                              </TouchableOpacity>
                              <View style={styles.commentBubbleContainer}>
                                <View style={[styles.commentBubble,
                                  { backgroundColor: colors.text + '08' }
                                ]}>
                                  <TouchableOpacity
                                    onPress={() => onPlayerPress?.(comment.player.id)}
                                    activeOpacity={0.7}
                                    disabled={!onPlayerPress}
                                  >
                                    <ThemedText style={[styles.commentAuthor, { color: colors.text + '90' }]}>
                                      {comment.player.first_name} {comment.player.last_name}
                                    </ThemedText>
                                  </TouchableOpacity>
                                  <ThemedText style={[styles.commentTextContent, { color: colors.text }]}>
                                    {comment.text}
                                  </ThemedText>
                                </View>
                                {comment.created_at && (
                                  <ThemedText style={[styles.commentDate, { color: colors.text + '50' }]}>
                                    {formatDate(new Date(comment.created_at))}
                                  </ThemedText>
                                )}
                              </View>
                              {isOwnComment && onDeleteComment && (
                                <TouchableOpacity
                                  style={styles.commentDeleteButton}
                                  onPress={async () => {
                                    try {
                                      await onDeleteComment(comment.id, membershipId);
                                      setMatchComments(prev => ({
                                        ...prev,
                                        [membershipId]: (prev[membershipId] || []).filter(c => c.id !== comment.id),
                                      }));
                                    } catch (error) {
                                      console.error('Erreur suppression commentaire:', error);
                                    }
                                  }}
                                >
                                  <IconSymbol name="trash" size={12} color={colors.text + '60'} />
                                </TouchableOpacity>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* Input de commentaire */}
                    {onComment && showCommentInput.has(membershipId) && (
                      <View style={[styles.commentInputSection, { borderTopColor: colors.text + '10' }]}>
                        <TextInput
                          style={[
                            styles.commentInput,
                            {
                              backgroundColor: colors.text + '05',
                              color: colors.text,
                              borderColor: colors.text + '15',
                            },
                          ]}
                          placeholder="Ajouter un commentaire..."
                          placeholderTextColor={colors.text + '50'}
                          value={commentTexts[membershipId] || ''}
                          onChangeText={(text) =>
                            setCommentTexts(prev => ({ ...prev, [membershipId]: text }))
                          }
                          onSubmitEditing={() => handlePostComment(membershipId, 'membership')}
                          multiline
                          autoFocus
                        />
                        <TouchableOpacity
                          style={[
                            styles.commentSendButton,
                            {
                              backgroundColor: colors.text + '15',
                              opacity: (commentTexts[membershipId]?.trim() && !postingComment.has(membershipId)) ? 1 : 0.5,
                            },
                          ]}
                          onPress={() => handlePostComment(membershipId, 'membership')}
                          disabled={!commentTexts[membershipId]?.trim() || postingComment.has(membershipId)}
                          activeOpacity={0.7}
                        >
                          <IconSymbol name="paperplane.fill" size={16} color={colors.text} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                );
              })()}
            </View>
          );
        }

        // Post de match (code existant)
        const matchId = item.match.id;
        const matchReactions = reactions[matchId] || {};
        const userReaction = userReactions[matchId];
        const totalReactions = Object.values(matchReactions).reduce((sum, count) => sum + count, 0);

        const isPlayedByPlayerA = item.playedBy.id === item.playerA.id;
        const playedByScore = isPlayedByPlayerA ? item.playerAScore : item.playerBScore;
        const opponentScore = isPlayedByPlayerA ? item.playerBScore : item.playerAScore;
        const isWin = playedByScore !== null && opponentScore !== null && playedByScore > opponentScore;

        const followedPlayer = item.playedBy;
        const opponent = isPlayedByPlayerA ? item.playerB : item.playerA;

        const comments = matchComments[matchId] || [];
        // Afficher tous les commentaires par défaut
        const visibleComments = comments;

        return (
          <View
            key={matchId}
            style={[
              styles.postCard,
              { 
                backgroundColor: colors.background, 
                borderColor: colors.text + '15',
                shadowColor: '#000',
              },
              index !== matches.length - 1 && styles.postSpacing,
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

            {/* Gradient en haut */}
            <LinearGradient
              colors={
                isWin
                  ? ['rgba(16, 185, 129, 0.25)', 'rgba(16, 185, 129, 0.08)', 'transparent']
                  : ['rgba(239, 68, 68, 0.25)', 'rgba(239, 68, 68, 0.08)', 'transparent']
              }
              style={styles.postGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
            />

            {/* Header du post - Avatar + Nom + Date + Chip Victoire/Défaite */}
            <View style={styles.postHeader}>
              <TouchableOpacity
                style={styles.postHeaderLeft}
                onPress={() => onPlayerPress?.(followedPlayer.id)}
                activeOpacity={0.7}
                disabled={!onPlayerPress}
              >
                <PlayerAvatar
                  firstName={followedPlayer.first_name || 'Joueur'}
                  lastName={followedPlayer.last_name || ''}
                  pictureUrl={followedPlayer.picture}
                  size={40}
                />
                <View style={styles.postHeaderInfo}>
                  <ThemedText style={[styles.postHeaderName, { color: colors.text }]}>
                    {followedPlayer.first_name} {followedPlayer.last_name}
                  </ThemedText>
                  <ThemedText style={[styles.postHeaderDate, { color: colors.text + '60' }]}>
                    {formatDate(item.playedAt)}
                  </ThemedText>
                </View>
              </TouchableOpacity>
              
              {/* Chip Victoire/Défaite en haut à droite */}
              {!item.isSpecialCase && (
                <View
                  style={[
                    styles.matchResultChip,
                    {
                      backgroundColor: isWin ? '#10b981' + '15' : '#ef4444' + '15',
                    },
                  ]}
                >
                  <ThemedText style={[styles.matchResultChipText, { color: isWin ? '#10b981' : '#ef4444' }]}>
                    {isWin ? 'Victoire' : 'Défaite'}
                  </ThemedText>
                </View>
              )}
            </View>

            {/* Contenu du post - Match */}
            <View style={styles.postContent}>
              <View style={styles.matchContent}>
                {item.isSpecialCase && item.specialStatus ? (
                  <View style={[styles.matchResultBadge, { backgroundColor: item.specialStatus.backgroundColor }]}>
                    <ThemedText style={[styles.matchResultText, { color: item.specialStatus.textColor }]}>
                      {item.specialStatus.label || 'Cas spécial'}
                    </ThemedText>
                  </View>
                ) : (
                  <View style={styles.matchResultRow}>
                      {/* Avatar adversaire */}
                      <TouchableOpacity
                        style={styles.opponentAvatarContainer}
                        onPress={() => onPlayerPress?.(opponent.id)}
                        activeOpacity={0.7}
                        disabled={!onPlayerPress}
                      >
                        <PlayerAvatar
                          firstName={opponent.first_name || 'Joueur'}
                          lastName={opponent.last_name || ''}
                          pictureUrl={opponent.picture}
                          size={40}
                        />
                      </TouchableOpacity>

                      {/* Nom adversaire */}
                      <TouchableOpacity
                        style={styles.opponentNameContainer}
                        onPress={() => onPlayerPress?.(opponent.id)}
                        activeOpacity={0.7}
                        disabled={!onPlayerPress}
                      >
                        <ThemedText style={[styles.opponentName, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
                          {opponent.first_name} {opponent.last_name}
                        </ThemedText>
                      </TouchableOpacity>

                      {/* Score */}
                      <View
                        style={[
                          styles.matchScoreBadge,
                          { 
                            backgroundColor: isWin ? '#d4edda' : '#f8d7da',
                          },
                        ]}
                      >
                        <ThemedText
                          style={[
                            styles.matchScoreText,
                            { 
                              color: isWin ? '#155724' : '#721c24',
                            },
                          ]}
                        >
                          {formatMatchScore(
                            item.match,
                            item.playedBy.id,
                            playedByScore || 0,
                            opponentScore || 0
                          )}
                        </ThemedText>
                      </View>
                    </View>
                )}
              </View>
            </View>

            {/* Séparateur */}
            {(onReaction || onComment) && (
              <View style={[styles.postSeparator, { borderTopColor: colors.text + '15' }]} />
            )}

            {/* Actions (Réactions et Commentaires) */}
            <View style={styles.postActions}>
              <View style={styles.postActionsLeft}>
                {/* Bouton réactions */}
                {onReaction && (
                  <TouchableOpacity
                    style={[styles.toggleButton, { borderColor: colors.text + '20' }]}
                    onPress={() => {
                      setShowReactions(prev => {
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
                    <IconSymbol 
                      name={userReaction ? "face.smiling.fill" : "face.smiling"} 
                      size={18} 
                      color={userReaction ? PRIMARY_COLOR : colors.text + '80'} 
                    />
                  </TouchableOpacity>
                )}

                {/* Bouton commentaires */}
                {onComment && (
                  <TouchableOpacity
                    style={[styles.toggleButton, { borderColor: colors.text + '20' }]}
                    onPress={() => {
                      setShowCommentInput(prev => {
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
                    <IconSymbol name="bubble.left" size={16} color={colors.text + '80'} />
                    {comments.length > 0 && (
                      <ThemedText style={[styles.toggleButtonText, { color: colors.text + '80' }]}>
                        {comments.length}
                      </ThemedText>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {/* Résumé des réactions */}
              {onReaction && totalReactions > 0 && (
                <View style={styles.reactionsSummary}>
                  {REACTIONS.map((reaction) => {
                    const count = matchReactions[reaction.name] || 0;
                    if (count === 0) return null;
                    return (
                      <View key={reaction.name} style={[styles.reactionBadge, { borderColor: colors.text + '20' }]}>
                        <ThemedText style={styles.reactionEmoji}>{reaction.emoji}</ThemedText>
                        {count > 1 && (
                          <ThemedText style={[styles.reactionCount, { color: colors.text + '70' }]}>
                            {count}
                          </ThemedText>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Panneau de réactions */}
            {onReaction && showReactions.has(matchId) && (
              <View style={[styles.reactionsPanel, { borderTopColor: colors.text + '10' }]}>
                <View style={styles.reactionsContainer}>
                  {REACTIONS.map((reaction) => {
                    const isActive = userReaction === reaction.name;
                    return (
                      <TouchableOpacity
                        key={reaction.name}
                        style={[
                          styles.reactionButton,
                          isActive && { backgroundColor: colors.text + '10' },
                        ]}
                        onPress={() => onReaction(matchId, reaction.name, 'match')}
                        activeOpacity={0.7}
                      >
                        <ThemedText style={styles.reactionEmojiButton}>{reaction.emoji}</ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Commentaires visibles - affichés par défaut */}
            {comments.length > 0 && (
              <View style={styles.commentsSection}>
                {visibleComments.map((comment) => {
                  const isOwnComment = currentPlayerId && (
                    comment.player_id === currentPlayerId || 
                    comment.player?.id === currentPlayerId
                  );
                  return (
                    <View key={comment.id} style={styles.commentItem}>
                      <TouchableOpacity
                        onPress={() => onPlayerPress?.(comment.player.id)}
                        activeOpacity={0.7}
                        disabled={!onPlayerPress}
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
                            onPress={() => onPlayerPress?.(comment.player.id)}
                            activeOpacity={0.7}
                            disabled={!onPlayerPress}
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
                            {formatDate(new Date(comment.created_at))}
                          </ThemedText>
                        )}
                      </View>
                      {isOwnComment && onDeleteComment && (
                        <TouchableOpacity
                          style={styles.commentDeleteButton}
                          onPress={async () => {
                            try {
                              await onDeleteComment(comment.id, matchId);
                              setMatchComments(prev => ({
                                ...prev,
                                [matchId]: (prev[matchId] || []).filter(c => c.id !== comment.id),
                              }));
                            } catch (error) {
                              console.error('Erreur suppression commentaire:', error);
                            }
                          }}
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

            {/* Champ de saisie de commentaire - affiché seulement si toggle activé */}
            {onComment && showCommentInput.has(matchId) && (
              <View style={[styles.commentInputSection, { borderTopColor: colors.text + '10' }]}>
                <TextInput
                  style={[
                    styles.commentInput,
                    {
                      backgroundColor: colors.text + '05',
                      color: colors.text,
                      borderColor: colors.text + '15',
                    },
                  ]}
                  placeholder="Ajouter un commentaire..."
                  placeholderTextColor={colors.text + '50'}
                  value={commentTexts[matchId] || ''}
                  onChangeText={(text) =>
                    setCommentTexts(prev => ({ ...prev, [matchId]: text }))
                  }
                  onSubmitEditing={() => handlePostComment(matchId, 'match')}
                  multiline
                  autoFocus
                />
                <TouchableOpacity
                  style={[
                    styles.commentSendButton,
                    {
                      backgroundColor: colors.text + '15',
                      opacity: (commentTexts[matchId]?.trim() && !postingComment.has(matchId)) ? 1 : 0.5,
                    },
                  ]}
                  onPress={() => handlePostComment(matchId, 'match')}
                  disabled={!commentTexts[matchId]?.trim() || postingComment.has(matchId)}
                  activeOpacity={0.7}
                >
                  <IconSymbol name="paperplane.fill" size={16} color={colors.text} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  postCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  postSpacing: {
    marginBottom: 0,
  },
  postGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 50,
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
  // Header
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  postHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  postHeaderInfo: {
    flex: 1,
  },
  postHeaderName: {
    fontSize: 14,
    fontWeight: '600',
  },
  postHeaderDate: {
    fontSize: 12,
    marginTop: 1,
  },
  // Contenu
  postContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  matchContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchResultChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  matchResultChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  matchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  opponentAvatarContainer: {
    marginRight: 0,
  },
  opponentNameContainer: {
    flex: 1,
    minWidth: 0,
  },
  opponentName: {
    fontSize: 13,
    fontWeight: '600',
  },
  matchResultBadge: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchResultText: {
    fontSize: 16,
    fontWeight: '600',
  },
  matchScoreBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchScoreText: {
    fontSize: 16,
    fontWeight: '700',
  },
  // Post de changement de statut
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Séparateur
  postSeparator: {
    borderTopWidth: 1,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  // Actions
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  postActionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 36,
    justifyContent: 'center',
  },
  toggleButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  reactionsSummary: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  reactionEmoji: {
    fontSize: 16,
  },
  reactionCount: {
    fontSize: 12,
    fontWeight: '500',
  },
  // Panneau réactions
  reactionsPanel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  reactionsContainer: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  reactionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionEmojiButton: {
    fontSize: 24,
  },
  // Commentaires
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
  viewMoreComments: {
    fontSize: 13,
    marginTop: 4,
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
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '400',
  },
});
