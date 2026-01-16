import type { ComponentProps } from 'react';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

import { PlayerAvatar } from '@/components/player-avatar';
import { ReactionAnimation } from '@/components/reaction-animation';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/services/api';
import type { MatchDTO, PlayerDTO } from '@/types/api';
import { type MatchSpecialStatus } from '@/utils/match-helpers';

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
  onInputFocus?: (inputRef: React.RefObject<View>) => void;
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
  onInputFocus,
}: ActivityFeedProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [commentTexts, setCommentTexts] = useState<{ [itemId: string]: string }>({});
  const [matchComments, setMatchComments] = useState<{ [itemId: string]: MatchCommentDTO[] }>({});
  const [postingComment, setPostingComment] = useState<Set<string>>(new Set());
  const [showReactions, setShowReactions] = useState<Set<string>>(new Set());
  const [showCommentInput, setShowCommentInput] = useState<Set<string>>(new Set());
  const [activeAnimations, setActiveAnimations] = useState<{ [itemId: string]: string | null }>({});
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [reactionPlayersModal, setReactionPlayersModal] = useState<{
    visible: boolean;
    entityType: 'match' | 'membership';
    entityId: string;
  } | null>(null);
  const [reactionPlayersByType, setReactionPlayersByType] = useState<{ [reactionType: string]: PlayerDTO[] }>({});
  const [loadingReactionPlayers, setLoadingReactionPlayers] = useState(false);
  const [userReactionsByType, setUserReactionsByType] = useState<{ [itemId: string]: Set<string> }>({});
  const inputRefs = useRef<{ [itemId: string]: React.RefObject<View> }>({});
  const inputYPositions = useRef<{ [itemId: string]: number }>({});
  
  // Charger tous les commentaires en batch (1 seule requête) au montage
  useEffect(() => {
    if (!currentPlayerId || commentsLoaded || matches.length === 0) return;
    
    // Créer une clé unique basée sur les IDs des items pour éviter les rechargements inutiles
    const matchesKey = matches.map(item => 
      item.type === 'match' ? `m:${item.match.id}` : `s:${item.membershipId}`
    ).sort().join(',');
    
    const entities = matches.map(item => {
      if (item.type === 'match') {
        return { type: 'match' as const, id: item.match.id };
      } else {
        return { type: 'membership' as const, id: item.membershipId };
      }
    });
    
    if (entities.length > 0) {
      setCommentsLoaded(true); // Marquer immédiatement pour éviter les appels multiples
      
      api.getCommentsBatch(entities, currentPlayerId)
        .then((commentsData) => {
          const commentsMap: { [itemId: string]: MatchCommentDTO[] } = {};
          Object.entries(commentsData).forEach(([entityId, comments]) => {
            commentsMap[entityId] = comments;
          });
          setMatchComments(commentsMap);
        })
        .catch((error) => {
          console.error('Erreur chargement commentaires batch:', error);
        });
    }
  }, [matches.map(m => m.type === 'match' ? m.match.id : m.membershipId).join(','), currentPlayerId]);

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
              {/* Header du post - Avatar + Nom + Date */}
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
              </View>

              {/* Contenu du changement de statut */}
              <View style={styles.postContent}>
                <View style={[styles.statusContentContainer, { backgroundColor: statusColor + '10' }]}>
                  <View style={[styles.statusIconContainer, { backgroundColor: statusColor + '20' }]}>
                    <IconSymbol name={statusIcon as ComponentProps<typeof IconSymbol>['name']} size={20} color={statusColor} />
                  </View>
                  <View style={styles.statusTextContainer}>
                    <ThemedText style={[styles.statusSubtitle, { color: colors.text + '70' }]}>
                      {item.status === 'continue' 
                        ? `${item.player.first_name} s'est réinscrit à la prochaine série de box` 
                        : `${item.player.first_name} ne continue pas pour la prochaine série de box`}
                    </ThemedText>
                  </View>
                </View>
              </View>

              {/* Réactions style Discord - toujours visibles */}
              {onReaction && totalStatusReactions > 0 && (
                <>
                  {/* Séparateur entre le post et les réactions */}
                  <View style={[styles.postSeparator, { borderTopColor: colors.text + '15' }]} />
                <View style={[styles.reactionsContainer, { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }]}>
                  {/* Afficher toutes les réactions existantes */}
                  {REACTIONS.map((reaction) => {
                    const count = statusReactions[reaction.name] || 0;
                    if (count === 0) return null;
                    // Vérifier si l'utilisateur a cette réaction spécifique
                    // Utiliser userStatusReaction directement (une seule réaction pour l'instant) ou userReactionsByType si disponible
                    const userReactionsForItem = userReactionsByType[membershipId] || new Set<string>();
                    const hasThisReaction = userStatusReaction === reaction.name || userReactionsForItem.has(reaction.name);
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
                        onPress={async () => {
                          // Toggle: si on a déjà cette réaction, la retirer, sinon l'ajouter
                          onReaction?.(membershipId, reaction.name, 'status');
                        }}
                        onLongPress={async () => {
                          // Long press pour voir qui a réagi
                          try {
                            setLoadingReactionPlayers(true);
                            setReactionPlayersModal({
                              visible: true,
                              entityType: 'membership',
                              entityId: membershipId,
                            });
                            const playersByType = await api.getReactionPlayers('membership', membershipId);
                            setReactionPlayersByType(playersByType);
                            
                            // Mettre à jour userReactionsByType pour savoir quelles réactions l'utilisateur a
                            if (currentPlayerId) {
                              const userReactionsSet = new Set<string>();
                              Object.entries(playersByType).forEach(([reactionType, players]) => {
                                if (players.some(p => p.id === currentPlayerId)) {
                                  userReactionsSet.add(reactionType);
                                }
                              });
                              setUserReactionsByType(prev => ({
                                ...prev,
                                [membershipId]: userReactionsSet,
                              }));
                            }
                          } catch (error) {
                            console.error('Erreur chargement joueurs réaction:', error);
                            Alert.alert('Erreur', 'Impossible de charger la liste des joueurs');
                            setReactionPlayersModal(null);
                          } finally {
                            setLoadingReactionPlayers(false);
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
                  
                  {/* Bouton + pour ajouter une réaction */}
                  <TouchableOpacity
                    style={[
                      styles.reactionAddButton,
                      { 
                        borderColor: colors.text + '20',
                        backgroundColor: colors.text + '08',
                      }
                    ]}
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
                    <ThemedText style={[styles.reactionAddText, { color: colors.text + '70' }]}>+</ThemedText>
                  </TouchableOpacity>
                </View>
                </>
              )}

              {/* Panneau de réactions (picker) */}
              {onReaction && showReactions.has(membershipId) && (
                <View style={[styles.reactionsPanel, { borderTopColor: colors.text + '10' }]}>
                  <View style={styles.reactionsPickerContainer}>
                    {REACTIONS.map((reaction) => {
                      // Vérifier si l'utilisateur a déjà cette réaction spécifique
                      const hasThisReaction = userStatusReaction === reaction.name;
                      return (
                        <TouchableOpacity
                          key={reaction.name}
                          style={[
                            styles.reactionPickerButton,
                            hasThisReaction && { backgroundColor: colors.text + '15' },
                          ]}
                          onPress={() => {
                            onReaction?.(membershipId, reaction.name, 'status');
                            setShowReactions(prev => {
                              const next = new Set(prev);
                              next.delete(membershipId);
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

              {/* Séparateur entre réactions et commentaires */}
              {onReaction && totalStatusReactions > 0 && (() => {
                const comments = matchComments[membershipId] || [];
                return comments.length > 0;
              })() && (
                <View style={[styles.reactionsCommentsSeparator, { borderTopColor: colors.text + '10' }]} />
              )}

              {/* Séparateur entre le post et les commentaires (si pas de réactions) */}
              {(!onReaction || totalStatusReactions === 0) && onComment && (() => {
                const comments = matchComments[membershipId] || [];
                return comments.length > 0;
              })() && (
                <View style={[styles.postSeparator, { borderTopColor: colors.text + '15' }]} />
              )}

              {/* Commentaires - toujours visibles */}
              {(() => {
                const comments = matchComments[membershipId] || [];
                return (
                  <>
                    {comments.length > 0 && (
                      <View style={styles.commentsSection}>
                        {comments.map((comment) => {
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
                                  onPress={() => {
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
                                              await onDeleteComment(comment.id, membershipId);
                                              setMatchComments(prev => ({
                                                ...prev,
                                                [membershipId]: (prev[membershipId] || []).filter(c => c.id !== comment.id),
                                              }));
                                            } catch (error) {
                                              console.error('Erreur suppression commentaire:', error);
                                            }
                                          },
                                        },
                                      ]
                                    );
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
                    {/* Séparateur avant le champ de commentaire (si pas de réactions et pas de commentaires existants) */}
                    {(!onReaction || totalStatusReactions === 0) && onComment && (() => {
                      const comments = matchComments[membershipId] || [];
                      return comments.length === 0;
                    })() && (
                      <View style={[styles.postSeparator, { borderTopColor: colors.text + '15' }]} />
                    )}

                    {/* Champ de saisie de commentaire - toujours affiché */}
                    {onComment && (() => {
                      // Créer ou récupérer la ref pour cet input
                      if (!inputRefs.current[membershipId]) {
                        inputRefs.current[membershipId] = React.createRef<View>() as React.RefObject<View>;
                      }
                      const inputContainerRef = inputRefs.current[membershipId];
                      const comments = matchComments[membershipId] || [];
                      
                      return (
                        <View 
                          ref={inputContainerRef}
                          style={[styles.commentInputSection, { borderTopColor: comments.length > 0 ? colors.text + '10' : 'transparent' }]}
                          onLayout={(event) => {
                            // Stocker la position Y de l'input dans la fenêtre
                            inputContainerRef.current?.measureInWindow((x, winY, width, height) => {
                              inputYPositions.current[membershipId] = winY;
                            });
                          }}
                        >
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
                            onFocus={() => {
                              // Charger les commentaires si pas encore chargés
                              if (onLoadComments && !matchComments[membershipId]) {
                                onLoadComments(membershipId, 'membership')
                                  .then((comments) => {
                                    setMatchComments(prevComments => ({ ...prevComments, [membershipId]: comments }));
                                  })
                                  .catch((error) => {
                                    console.error('Erreur chargement commentaires membership:', error);
                                  });
                              }
                              // Scroller vers l'input après que le clavier s'ouvre
                              if (onInputFocus) {
                                // Attendre que le clavier soit complètement ouvert
                                const keyboardListener = Keyboard.addListener('keyboardDidShow', () => {
                                  setTimeout(() => {
                                    onInputFocus(inputContainerRef);
                                    keyboardListener.remove();
                                  }, 100);
                                });
                              }
                            }}
                            onSubmitEditing={() => handlePostComment(membershipId, 'membership')}
                            multiline
                          />
                          <View style={styles.commentInputActions}>
                            {/* Bouton + pour ajouter une réaction (si pas de réactions) */}
                            {onReaction && totalStatusReactions === 0 && (
                              <TouchableOpacity
                                style={[
                                  styles.reactionAddButton,
                                  { 
                                    borderColor: colors.text + '20',
                                    backgroundColor: colors.text + '08',
                                    marginRight: 8,
                                  }
                                ]}
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
                                <ThemedText style={[styles.reactionAddText, { color: colors.text + '70' }]}>+</ThemedText>
                              </TouchableOpacity>
                            )}
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
                        </View>
                      );
                    })()}
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

            {/* Header du post - Avatar + Nom + Date */}
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
            </View>

            {/* Contenu du post - Match */}
            <View style={styles.postContent}>
              {item.isSpecialCase && item.specialStatus ? (
                <View style={[styles.matchSpecialCaseContainer, { backgroundColor: item.specialStatus.backgroundColor + '15' }]}>
                  <View style={[styles.matchSpecialCaseIcon, { backgroundColor: item.specialStatus.backgroundColor + '30' }]}>
                    <IconSymbol name="exclamationmark.triangle" size={20} color={item.specialStatus.textColor} />
                  </View>
                  <ThemedText style={[styles.matchSpecialCaseText, { color: item.specialStatus.textColor }]}>
                    {item.specialStatus.label || 'Cas spécial'}
                  </ThemedText>
                </View>
              ) : (
                <View style={[styles.matchResultContainer, { backgroundColor: isWin ? '#10b981' + '08' : '#ef4444' + '08' }]}>
                  {/* VS Layout */}
                  <View style={styles.matchVsLayout}>
                    {/* Joueur suivi */}
                    <View style={styles.matchPlayerSection}>
                      <PlayerAvatar
                        firstName={followedPlayer.first_name || 'Joueur'}
                        lastName={followedPlayer.last_name || ''}
                        pictureUrl={followedPlayer.picture}
                        size={48}
                      />
                      <ThemedText style={[styles.matchPlayerName, { color: colors.text }]} numberOfLines={1}>
                        {followedPlayer.first_name} {followedPlayer.last_name}
                      </ThemedText>
                    </View>

                    {/* Score central */}
                    <View style={[styles.matchScoreContainer, { backgroundColor: isWin ? '#10b981' + '20' : '#ef4444' + '20' }]}>
                      <ThemedText style={[styles.matchScoreLarge, { color: isWin ? '#10b981' : '#ef4444' }]}>
                        {playedByScore || 0}
                      </ThemedText>
                      <ThemedText style={[styles.matchScoreSeparator, { color: colors.text + '40' }]}>-</ThemedText>
                      <ThemedText style={[styles.matchScoreLarge, { color: isWin ? '#10b981' : '#ef4444' }]}>
                        {opponentScore || 0}
                      </ThemedText>
                    </View>

                    {/* Adversaire */}
                    <View style={styles.matchPlayerSection}>
                      <TouchableOpacity
                        onPress={() => onPlayerPress?.(opponent.id)}
                        activeOpacity={0.7}
                        disabled={!onPlayerPress}
                      >
                        <PlayerAvatar
                          firstName={opponent.first_name || 'Joueur'}
                          lastName={opponent.last_name || ''}
                          pictureUrl={opponent.picture}
                          size={48}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => onPlayerPress?.(opponent.id)}
                        activeOpacity={0.7}
                        disabled={!onPlayerPress}
                      >
                        <ThemedText style={[styles.matchPlayerName, { color: colors.text }]} numberOfLines={1}>
                          {opponent.first_name} {opponent.last_name}
                        </ThemedText>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* Réactions style Discord - toujours visibles */}
            {onReaction && totalReactions > 0 && (
              <>
                {/* Séparateur entre le post et les réactions */}
                <View style={[styles.postSeparator, { borderTopColor: colors.text + '15' }]} />
              <View style={[styles.reactionsContainer, { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }]}>
                {/* Afficher toutes les réactions existantes */}
                {REACTIONS.map((reaction) => {
                  const count = matchReactions[reaction.name] || 0;
                  if (count === 0) return null;
                  // Vérifier si l'utilisateur a cette réaction spécifique
                  // Utiliser userReaction directement (une seule réaction pour l'instant) ou userReactionsByType si disponible
                  const userReactionsForItem = userReactionsByType[matchId] || new Set<string>();
                  const hasThisReaction = userReaction === reaction.name || userReactionsForItem.has(reaction.name);
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
                      onPress={async () => {
                        // Toggle: si on a déjà cette réaction, la retirer, sinon l'ajouter
                        onReaction(matchId, reaction.name, 'match');
                      }}
                      onLongPress={async () => {
                        // Long press pour voir qui a réagi
                        try {
                          setLoadingReactionPlayers(true);
                          setReactionPlayersModal({
                            visible: true,
                            entityType: 'match',
                            entityId: matchId,
                          });
                          const playersByType = await api.getReactionPlayers('match', matchId);
                          setReactionPlayersByType(playersByType);
                          
                          // Mettre à jour userReactionsByType pour savoir quelles réactions l'utilisateur a
                          if (currentPlayerId) {
                            const userReactionsSet = new Set<string>();
                            Object.entries(playersByType).forEach(([reactionType, players]) => {
                              if (players.some(p => p.id === currentPlayerId)) {
                                userReactionsSet.add(reactionType);
                              }
                            });
                            setUserReactionsByType(prev => ({
                              ...prev,
                              [matchId]: userReactionsSet,
                            }));
                          }
                        } catch (error) {
                          console.error('Erreur chargement joueurs réaction:', error);
                          Alert.alert('Erreur', 'Impossible de charger la liste des joueurs');
                          setReactionPlayersModal(null);
                        } finally {
                          setLoadingReactionPlayers(false);
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
                
                {/* Bouton + pour ajouter une réaction */}
                <TouchableOpacity
                  style={[
                    styles.reactionAddButton,
                    { 
                      borderColor: colors.text + '20',
                      backgroundColor: colors.text + '08',
                    }
                  ]}
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
                  <ThemedText style={[styles.reactionAddText, { color: colors.text + '70' }]}>+</ThemedText>
                </TouchableOpacity>
              </View>
              </>
            )}

            {/* Panneau de réactions (picker) */}
            {onReaction && showReactions.has(matchId) && (
              <View style={[styles.reactionsPanel, { borderTopColor: colors.text + '10' }]}>
                <View style={styles.reactionsPickerContainer}>
                  {REACTIONS.map((reaction) => {
                    // Vérifier si l'utilisateur a déjà cette réaction spécifique
                    const hasThisReaction = userReaction === reaction.name;
                    return (
                      <TouchableOpacity
                        key={reaction.name}
                        style={[
                          styles.reactionPickerButton,
                          hasThisReaction && { backgroundColor: colors.text + '15' },
                        ]}
                        onPress={() => {
                          onReaction(matchId, reaction.name, 'match');
                          setShowReactions(prev => {
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

            {/* Séparateur entre réactions et commentaires */}
            {onReaction && totalReactions > 0 && comments.length > 0 && (
              <View style={[styles.reactionsCommentsSeparator, { borderTopColor: colors.text + '10' }]} />
            )}

            {/* Séparateur entre le post et les commentaires (si pas de réactions) */}
            {(!onReaction || totalReactions === 0) && onComment && comments.length > 0 && (
              <View style={[styles.postSeparator, { borderTopColor: colors.text + '15' }]} />
            )}

            {/* Commentaires - toujours visibles */}
            {comments.length > 0 && (
              <View style={styles.commentsSection}>
                {comments.map((comment) => {
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
                          onPress={() => {
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
                                      await onDeleteComment(comment.id, matchId);
                                      setMatchComments(prev => ({
                                        ...prev,
                                        [matchId]: (prev[matchId] || []).filter(c => c.id !== comment.id),
                                      }));
                                    } catch (error) {
                                      console.error('Erreur suppression commentaire:', error);
                                    }
                                  },
                                },
                              ]
                            );
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

            {/* Séparateur avant le champ de commentaire (si pas de réactions et pas de commentaires existants) */}
            {(!onReaction || totalReactions === 0) && onComment && comments.length === 0 && (
              <View style={[styles.postSeparator, { borderTopColor: colors.text + '15' }]} />
            )}

            {/* Champ de saisie de commentaire - toujours affiché */}
            {onComment && (() => {
              // Créer ou récupérer la ref pour cet input
              if (!inputRefs.current[matchId]) {
                inputRefs.current[matchId] = React.createRef<View>() as React.RefObject<View>;
              }
              const inputContainerRef = inputRefs.current[matchId];
              
              return (
                <View 
                  ref={inputContainerRef}
                  style={[styles.commentInputSection, { borderTopColor: comments.length > 0 ? colors.text + '10' : 'transparent' }]}
                  onLayout={(event) => {
                    // Stocker la position Y de l'input dans le ScrollView parent
                    const { y } = event.nativeEvent.layout;
                    // On doit obtenir la position relative au ScrollView, pas juste le layout local
                    inputContainerRef.current?.measureInWindow((x, winY, width, height) => {
                      // On stocke la position Y dans la fenêtre pour référence
                      inputYPositions.current[matchId] = winY;
                    });
                  }}
                >
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
                    onFocus={() => {
                      // Charger les commentaires si pas encore chargés
                      if (onLoadComments && !matchComments[matchId]) {
                        onLoadComments(matchId, 'match')
                          .then((comments) => {
                            setMatchComments(prevComments => ({ ...prevComments, [matchId]: comments }));
                          })
                          .catch((error) => {
                            console.error('Erreur chargement commentaires:', error);
                          });
                      }
                      // Scroller vers l'input après que le clavier s'ouvre
                      if (onInputFocus) {
                        // Attendre que le clavier soit complètement ouvert
                        const keyboardListener = Keyboard.addListener('keyboardDidShow', () => {
                          setTimeout(() => {
                            onInputFocus(inputContainerRef);
                            keyboardListener.remove();
                          }, 100);
                        });
                      }
                    }}
                    onSubmitEditing={() => handlePostComment(matchId, 'match')}
                    multiline
                  />
                <View style={styles.commentInputActions}>
                  {/* Bouton + pour ajouter une réaction (si pas de réactions) */}
                  {onReaction && totalReactions === 0 && (
                    <TouchableOpacity
                      style={[
                        styles.reactionAddButton,
                        { 
                          borderColor: colors.text + '20',
                          backgroundColor: colors.text + '08',
                          marginRight: 8,
                        }
                      ]}
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
                      <ThemedText style={[styles.reactionAddText, { color: colors.text + '70' }]}>+</ThemedText>
                    </TouchableOpacity>
                  )}
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
              </View>
              );
            })()}
          </View>
        );
      })}

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
                          onPlayerPress?.(player.id);
                          setReactionPlayersModal(null);
                          setReactionPlayersByType({});
                        }}
                        activeOpacity={0.7}
                        disabled={!onPlayerPress}
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
  matchResultContainer: {
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  matchVsLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  matchPlayerSection: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  matchPlayerName: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  matchScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 100,
    justifyContent: 'center',
  },
  matchScoreLarge: {
    fontSize: 24,
    fontWeight: '700',
  },
  matchScoreSeparator: {
    fontSize: 20,
    fontWeight: '500',
  },
  matchResultBadgeNew: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  matchResultBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  matchSpecialCaseContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
  },
  matchSpecialCaseIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchSpecialCaseText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  // Post de changement de statut
  statusContentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
  },
  statusIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTextContainer: {
    flex: 1,
    gap: 4,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  statusSubtitle: {
    fontSize: 10,
  },
  // Séparateur
  postSeparator: {
    borderTopWidth: 1,
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
    gap: 6,
    flexWrap: 'wrap',
  },
  reactionAddButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionAddText: {
    fontSize: 18,
    fontWeight: '600',
  },
  reactionsPickerContainer: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  reactionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
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
  reactionsCommentsSeparator: {
    borderTopWidth: 1,
    marginTop: 4,
    marginBottom: 4,
    marginHorizontal: 16,
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
  commentInputActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
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
