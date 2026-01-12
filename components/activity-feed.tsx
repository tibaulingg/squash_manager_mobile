import React, { useEffect, useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

import { PlayerAvatar } from '@/components/player-avatar';
import { ReactionAnimation } from '@/components/reaction-animation';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { MatchDTO, PlayerDTO } from '@/types/api';
import { formatMatchScore } from '@/utils/match-helpers';

interface ActivityFeedItem {
  match: MatchDTO;
  playerA: PlayerDTO;
  playerB: PlayerDTO;
  playerAScore: number | null;
  playerBScore: number | null;
  isSpecialCase: boolean;
  specialStatus?: {
    text: string;
    backgroundColor: string;
    textColor: string;
  };
  playedBy: PlayerDTO; // Le joueur suivi qui a joué ce match
  playedAt: Date; // Date du match (scheduled_at ou played_at)
}

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
  onReaction?: (matchId: string, reaction: string) => void;
  reactions?: { [matchId: string]: { [reaction: string]: number } };
  userReactions?: { [matchId: string]: string | null };
  onComment?: (matchId: string, text: string) => Promise<void>;
  onLoadComments?: (matchId: string) => Promise<MatchCommentDTO[]>;
  onDeleteComment?: (commentId: string, matchId: string) => Promise<void>;
}

const REACTIONS = [
  { emoji: '🔥', name: 'fire' },
  { emoji: '👏', name: 'clap' },
  { emoji: '💪', name: 'muscle' },
  { emoji: '🎉', name: 'party' },
  { emoji: '😢', name: 'sad' },
  { emoji: '❤️', name: 'heart' },
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
  const [commentTexts, setCommentTexts] = useState<{ [matchId: string]: string }>({});
  const [matchComments, setMatchComments] = useState<{ [matchId: string]: MatchCommentDTO[] }>({});
  const [postingComment, setPostingComment] = useState<Set<string>>(new Set());
  const [showReactions, setShowReactions] = useState<Set<string>>(new Set());
  const [showComments, setShowComments] = useState<Set<string>>(new Set());
  const [activeAnimations, setActiveAnimations] = useState<{ [matchId: string]: string | null }>({});
  
  // Charger les commentaires pour tous les matchs au début pour avoir les compteurs
  useEffect(() => {
    if (!onLoadComments) return;
    
    matches.forEach((item) => {
      const matchId = item.match.id;
      if (!matchComments[matchId]) {
        onLoadComments(matchId)
          .then((comments) => {
            setMatchComments(prev => ({ ...prev, [matchId]: comments }));
          })
          .catch((error) => {
            // Ignorer les erreurs silencieusement
            console.error('Erreur chargement commentaires:', error);
          });
      }
    });
  }, [matches.map(m => m.match.id).join(','), onLoadComments]);

  const handlePostComment = async (matchId: string) => {
    const text = commentTexts[matchId]?.trim();
    if (!text || !onComment) return;

    setPostingComment(prev => new Set(prev).add(matchId));

    try {
      await onComment(matchId, text);
      setCommentTexts(prev => {
        const next = { ...prev };
        delete next[matchId];
        return next;
      });
      
      // Recharger les commentaires
      if (onLoadComments) {
        const comments = await onLoadComments(matchId);
        setMatchComments(prev => ({ ...prev, [matchId]: comments }));
      }
      
      // Ne pas fermer le panneau de commentaires pour voir le nouveau commentaire
    } catch (error) {
      console.error('Erreur commentaire:', error);
    } finally {
      setPostingComment(prev => {
        const next = new Set(prev);
        next.delete(matchId);
        return next;
      });
    }
  };

  const handleReaction = (matchId: string, reactionName: string) => {
    // Vérifier si on ajoute ou retire une réaction
    const currentReaction = userReactions[matchId];
    const isAdding = currentReaction !== reactionName;
    
    // Lancer l'animation seulement si on ajoute une réaction (pas si on la retire)
    if (isAdding) {
      const reaction = REACTIONS.find(r => r.name === reactionName);
      if (reaction) {
        // Lancer l'animation
        setActiveAnimations(prev => ({ ...prev, [matchId]: reaction.emoji }));
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
    
    // Fermer le panneau de réactions
    setShowReactions(prev => {
      const next = new Set(prev);
      next.delete(matchId);
      return next;
    });
    
    onReaction?.(matchId, reactionName);
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

  return (
    <View style={styles.container}>
      {matches.map((item, index) => {
        const matchId = item.match.id;
        const matchReactions = reactions[matchId] || {};
        const userReaction = userReactions[matchId];
        const totalReactions = Object.values(matchReactions).reduce((sum, count) => sum + count, 0);

        // Déterminer si le joueur suivi a gagné ou perdu
        const isPlayedByPlayerA = item.playedBy.id === item.playerA.id;
        const playedByScore = isPlayedByPlayerA ? item.playerAScore : item.playerBScore;
        const opponentScore = isPlayedByPlayerA ? item.playerBScore : item.playerAScore;
        const isWin = playedByScore !== null && opponentScore !== null && playedByScore > opponentScore;
        const scoreColor = isWin ? '#155724' : '#721c24'; // Vert pour victoire, rouge pour défaite

        // Déterminer le joueur suivi et l'adversaire
        const followedPlayer = item.playedBy;
        const opponent = isPlayedByPlayerA ? item.playerB : item.playerA;

        const comments = matchComments[matchId] || [];
        const commentsCount = comments.length;

        return (
          <View
            key={matchId}
            style={[
              styles.feedItem,
              index !== matches.length - 1 && [
                styles.feedItemBorder,
                { borderBottomColor: colors.text + '30', borderBottomWidth: 1 },
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
            {/* Header avec joueurs et score au centre */}
            <View style={styles.feedHeader}>
              {/* Joueur suivi à gauche */}
              <TouchableOpacity
                style={styles.playerSectionLeft}
                onPress={() => onPlayerPress?.(followedPlayer.id)}
                activeOpacity={0.7}
                disabled={!onPlayerPress}
              >
                <PlayerAvatar
                  firstName={followedPlayer.first_name || 'Joueur'}
                  lastName={followedPlayer.last_name || ''}
                  pictureUrl={followedPlayer.picture}
                  size={36}
                />
                <View style={styles.playerNameContainer}>
                  <ThemedText 
                    style={[styles.playerFirstName, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {followedPlayer.first_name}
                  </ThemedText>
                  <ThemedText 
                    style={[styles.playerLastName, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {followedPlayer.last_name}
                  </ThemedText>
                </View>
              </TouchableOpacity>

              {/* Score au centre avec date au-dessus */}
              <View style={styles.scoreContainer}>
                {/* Date centrée au-dessus du score */}
                <View style={styles.dateContainer}>
                  <IconSymbol name="calendar" size={10} color={colors.text + '50'} />
                  <ThemedText style={[styles.dateText, { color: colors.text, opacity: 0.5 }]}>
                    {formatMatchDate(item.playedAt)}
                  </ThemedText>
                </View>
                
                {/* Score badge */}
                <View
                  style={[
                    styles.scoreBadge,
                    { 
                      backgroundColor: item.specialStatus?.backgroundColor || (isWin ? '#d4edda' : '#f8d7da'),
                    },
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.scoreBadgeText,
                      { 
                        color: item.specialStatus?.textColor || (isWin ? '#155724' : '#721c24'),
                      },
                    ]}
                  >
                    {item.isSpecialCase && item.specialStatus
                      ? item.specialStatus.text
                      : formatMatchScore(
                          item.match,
                          item.playedBy.id,
                          playedByScore || 0,
                          opponentScore || 0
                        )}
                  </ThemedText>
                </View>
              </View>

              {/* Adversaire à droite */}
              <TouchableOpacity
                style={styles.playerSectionRight}
                onPress={() => onPlayerPress?.(opponent.id)}
                activeOpacity={0.7}
                disabled={!onPlayerPress}
              >
                <View style={styles.playerNameContainer}>
                  <ThemedText 
                    style={[styles.playerFirstName, { color: colors.text, textAlign: 'right' }]}
                    numberOfLines={1}
                  >
                    {opponent.first_name}
                  </ThemedText>
                  <ThemedText 
                    style={[styles.playerLastName, { color: colors.text, textAlign: 'right' }]}
                    numberOfLines={1}
                  >
                    {opponent.last_name}
                  </ThemedText>
                </View>
                <PlayerAvatar
                  firstName={opponent.first_name || 'Joueur'}
                  lastName={opponent.last_name || ''}
                  pictureUrl={opponent.picture}
                  size={36}
                />
              </TouchableOpacity>
            </View>

            {/* Footer avec boutons d'action à gauche et réactions à droite */}
            <View style={[styles.feedFooter, { borderTopColor: colors.text + '15' }]}>
              <View style={styles.actionsContainer}>
                {/* Bouton pour ouvrir le panneau de réactions */}
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
                    <IconSymbol name="face.smiling" size={14} color={colors.text + '80'} />
                  </TouchableOpacity>
                )}

                {/* Bouton commenter */}
                {onComment && (
                  <TouchableOpacity
                    style={[styles.toggleButton, { borderColor: colors.text + '20' }]}
                    onPress={() => {
                      setShowComments(prev => {
                        const next = new Set(prev);
                        if (next.has(matchId)) {
                          next.delete(matchId);
                        } else {
                          next.add(matchId);
                          // Charger les commentaires si pas encore chargés
                          if (!matchComments[matchId] && onLoadComments) {
                            onLoadComments(matchId)
                              .then((comments) => {
                                setMatchComments(prev => ({ ...prev, [matchId]: comments }));
                              })
                              .catch((error) => {
                                console.error('Erreur chargement commentaires:', error);
                              });
                          }
                        }
                        return next;
                      });
                    }}
                    activeOpacity={0.7}
                  >
                    <IconSymbol name="bubble.left" size={13} color={colors.text + '80'} />
                    {commentsCount > 0 && (
                      <ThemedText style={[styles.toggleButtonText, { color: colors.text + '80' }]}>
                        {commentsCount}
                      </ThemedText>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {/* Résumé des réactions - toujours affiché à droite */}
              {onReaction && totalReactions > 0 && (
                <View style={styles.reactionsSummary}>
                  {REACTIONS.map((reaction) => {
                    const count = matchReactions[reaction.name] || 0;
                    if (count === 0) return null;
                    return (
                      <View key={reaction.name} style={[styles.reactionBadge, { backgroundColor: colors.text + '08' }]}>
                        <ThemedText style={styles.reactionEmoji}>{reaction.emoji}</ThemedText>
                        <ThemedText style={[styles.reactionCount, { color: colors.text, opacity: 0.7 }]}>
                          {count}
                        </ThemedText>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Section réactions - panneau avec tous les boutons, affiché si toggle activé */}
            {onReaction && showReactions.has(matchId) && (
              <View style={[styles.reactionsSection, { borderTopColor: colors.text + '15' }]}>
                {/* Boutons de réaction */}
                <View style={styles.reactionsContainer}>
                  {REACTIONS.map((reaction) => {
                    const isActive = userReaction === reaction.name;
                    return (
                      <TouchableOpacity
                        key={reaction.name}
                        style={[
                          styles.reactionButton,
                          isActive && [
                            styles.reactionButtonActive,
                            { backgroundColor: colors.text + '15' },
                          ],
                          { borderColor: colors.text + '20' },
                        ]}
                        onPress={() => handleReaction(matchId, reaction.name)}
                        activeOpacity={0.7}
                      >
                        <ThemedText style={styles.reactionEmojiButton}>{reaction.emoji}</ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Section commentaires - affichée si toggle activé */}
            {onComment && showComments.has(matchId) && (
              <View style={[styles.commentsSection, { borderTopColor: colors.text + '15' }]}>
                {/* Liste des commentaires */}
                {comments.length > 0 && (
                  <View style={styles.commentsList}>
                    {comments.map((comment) => {
                      // Vérifier si le commentaire appartient à l'utilisateur actuel
                      const isOwnComment = currentPlayerId && (
                        comment.player_id === currentPlayerId || 
                        comment.player?.id === currentPlayerId
                      );
                      // Debug temporaire
                      if (__DEV__) {
                        console.log('Comment check:', {
                          commentId: comment.id,
                          commentPlayerId: comment.player_id,
                          commentPlayerObjectId: comment.player?.id,
                          currentPlayerId,
                          isOwnComment,
                          hasOnDelete: !!onDeleteComment
                        });
                      }
                      return (
                        <View key={comment.id} style={styles.commentItem}>
                          <View style={styles.avatarContainer}>
                            <PlayerAvatar
                              firstName={comment.player.first_name}
                              lastName={comment.player.last_name}
                              pictureUrl={comment.player.picture}
                              size={28}
                            />
                          </View>
                          <View style={styles.commentContent}>
                            <View style={[styles.commentBubble, { backgroundColor: colors.text + '08' }]}>
                              <ThemedText style={[styles.commentAuthor, { color: colors.text }]}>
                                {comment.player.first_name} {comment.player.last_name}
                              </ThemedText>
                              <ThemedText style={[styles.commentText, { color: colors.text }]}>
                                {comment.text}
                              </ThemedText>
                            </View>
                            {comment.created_at && (
                              <ThemedText style={[styles.commentDate, { color: colors.text, opacity: 0.5 }]}>
                                {formatDate(new Date(comment.created_at))}
                              </ThemedText>
                            )}
                          </View>
                          {isOwnComment && onDeleteComment ? (
                            <TouchableOpacity
                              style={styles.commentDeleteButton}
                              onPress={async () => {
                                try {
                                  await onDeleteComment(comment.id, matchId);
                                  // Mettre à jour l'état local immédiatement
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
                              <IconSymbol name="trash" size={16} color={colors.text + '80'} />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Champ de saisie de commentaire */}
                <View style={styles.commentInputContainer}>
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
    gap: 0,
  },
  feedItem: {
    paddingVertical: 8,
    paddingHorizontal: 16,
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
  feedItemBorder: {
    borderBottomWidth: 1,
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
    gap: 8,
  },
  playerSectionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'flex-start',
    minWidth: 0,
  },
  playerSectionRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  playerNameContainer: {
    flex: 1,
    flexDirection: 'column',
    gap: 0,
    minWidth: 0,
  },
  playerFirstName: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 15,
  },
  playerLastName: {
    fontSize: 11,
    fontWeight: '400',
    opacity: 0.8,
    lineHeight: 13,
    marginTop: -2,
  },
  scoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  specialStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  specialStatusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  feedFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
    gap: 6,
    paddingTop: 2,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    justifyContent: 'center',
    marginBottom: 4,
  },
  dateText: {
    fontSize: 10,
    fontWeight: '400',
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
  actionsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  reactionsContainer: {
    flexDirection: 'row',
    gap: 8,
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
  reactionEmojiButton: {
    fontSize: 18,
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
  messageContainer: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  messageText: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  footerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  reactionsSection: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    gap: 6,
  },
  commentsSection: {
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
  commentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 32,
    justifyContent: 'center',
  },
  commentButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  commentsList: {
    gap: 6,
  },
  commentsLoading: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  commentsLoadingText: {
    fontSize: 13,
  },
  commentItem: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
    alignItems: 'flex-start',
  },
  avatarContainer: {
    paddingTop: 8,
  },
  commentContent: {
    flex: 1,
    gap: 4,
  },
  commentDeleteButton: {
    padding: 4,
    alignSelf: 'flex-start',
    marginTop: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 24,
    minHeight: 24,
  },
  commentBubble: {
    padding: 8,
    paddingTop: 6,
    borderRadius: 10,
    marginBottom: 2,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 1,
  },
  commentText: {
    fontSize: 13,
    lineHeight: 16,
  },
  commentDate: {
    fontSize: 10,
    marginTop: 2,
  },
  commentInputContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 40,
    maxHeight: 100,
  },
  commentSendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
