import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayerAvatar } from '@/components/player-avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/services/api';
import type { MatchCommentDTO, MatchDTO, PlayerDTO } from '@/types/api';

interface PlayerChatModalProps {
  visible: boolean;
  currentPlayerId: string;
  otherPlayerId: string;
  otherPlayerName: string;
  matchId?: string; // Optionnel : si fourni, utilise ce match, sinon cherche le match entre les deux joueurs
  onClose: () => void;
}

const formatChatDate = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'À l\'instant';
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays}j`;
  
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
};

export function PlayerChatModal({
  visible,
  currentPlayerId,
  otherPlayerId,
  otherPlayerName,
  matchId: providedMatchId,
  onClose,
}: PlayerChatModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  
  const [messages, setMessages] = useState<MatchCommentDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [otherPlayer, setOtherPlayer] = useState<PlayerDTO | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerDTO | null>(null);
  const [matchId, setMatchId] = useState<string | null>(providedMatchId || null);
  const [matchNotFound, setMatchNotFound] = useState(false);
  const [match, setMatch] = useState<MatchDTO | null>(null);

  // Charger les informations des joueurs et trouver le match
  useEffect(() => {
    const loadPlayersAndMatch = async () => {
      try {
        const allPlayers = await api.getPlayersCached();
        const other = allPlayers.find((p) => p.id === otherPlayerId);
        const current = allPlayers.find((p) => p.id === currentPlayerId);
        if (other) setOtherPlayer(other);
        if (current) setCurrentPlayer(current);

        // Si un matchId est fourni, l'utiliser
        let foundMatch: MatchDTO | null = null;
        
        if (providedMatchId) {
          setMatchId(providedMatchId);
          // Charger les informations du match
          const seasons = await api.getSeasonsCached();
          const currentSeason = seasons.find((s) => s.status === 'running') || seasons[0];
          if (currentSeason) {
            const matches = await api.getMatches(currentSeason.id);
            foundMatch = matches.find((m) => m.id === providedMatchId) || null;
            setMatch(foundMatch);
          }
          setMatchNotFound(false);
          return;
        }

        // Sinon, chercher le match entre les deux joueurs dans la saison en cours
        const seasons = await api.getSeasonsCached();
        const currentSeason = seasons.find((s) => s.status === 'running') || seasons[0];
        
        if (!currentSeason) {
          setMatchNotFound(true);
          return;
        }

        // Récupérer tous les matchs de la saison
        const matches = await api.getMatches(currentSeason.id);
        
        // Chercher le match entre les deux joueurs
        foundMatch = matches.find(
          (m) =>
            (m.player_a_id === currentPlayerId && m.player_b_id === otherPlayerId) ||
            (m.player_a_id === otherPlayerId && m.player_b_id === currentPlayerId)
        ) || null;

        if (foundMatch) {
          setMatchId(foundMatch.id);
          setMatch(foundMatch);
          setMatchNotFound(false);
        } else {
          setMatchNotFound(true);
        }
      } catch (error) {
        console.error('Erreur chargement joueurs/match:', error);
        setMatchNotFound(true);
      }
    };
    
    if (visible) {
      loadPlayersAndMatch();
    }
  }, [visible, currentPlayerId, otherPlayerId, providedMatchId]);

  // Charger les messages
  const loadMessages = useCallback(async () => {
    if (!matchId) return;
    
    try {
      setLoading(true);
      // Utiliser l'API de commentaires avec entity_type='conversation'
      // On utilise le matchId comme entity_id pour lier la conversation au match
      const comments = await api.getComments('conversation' as any, matchId);
      // L'API retourne MatchCommentDTO[] mais on peut les utiliser directement
      setMessages(comments as MatchCommentDTO[]);
    } catch (error) {
      console.error('Erreur chargement messages:', error);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  // Charger les messages quand le modal s'ouvre
  useEffect(() => {
    if (visible && matchId && !matchNotFound) {
      loadMessages();
      // Auto-scroll vers le bas après un court délai
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: false });
      }, 100);
    }
  }, [visible, matchId, matchNotFound, loadMessages]);

  // Auto-scroll quand de nouveaux messages arrivent
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  // Envoyer un message
  const handleSendMessage = useCallback(async () => {
    if (!messageText.trim() || sending || !matchId) return;

    try {
      setSending(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      // Utiliser l'API de commentaires avec entity_type='conversation'
      // On utilise le matchId comme entity_id pour lier la conversation au match
      const newComment = await api.addComment('conversation' as any, matchId!, currentPlayerId, messageText.trim());
      
      // S'assurer que le player_id est correct (au cas où l'API retournerait un mauvais ID)
      const commentWithCorrectPlayerId: MatchCommentDTO = {
        ...newComment,
        player_id: currentPlayerId, // Forcer le player_id à être celui du joueur actuel
      };
      
      // Debug: log pour vérifier
      if (__DEV__) {
        console.log('New message added:', {
          originalPlayerId: newComment.player_id,
          currentPlayerId,
          correctedPlayerId: commentWithCorrectPlayerId.player_id,
          messageText: messageText.trim().substring(0, 20),
        });
      }
      
      // Ajouter le message à la liste locale
      setMessages((prev) => [...prev, commentWithCorrectPlayerId as MatchCommentDTO]);
      
      setMessageText('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Auto-scroll
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error: any) {
      console.error('Erreur envoi message:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSending(false);
    }
  }, [messageText, sending, matchId, currentPlayerId]);

  // Suppression désactivée pour les messages de conversation

  if (!visible) return null;

  const displayName = otherPlayer 
    ? `${otherPlayer.first_name} ${otherPlayer.last_name}`
    : otherPlayerName;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ThemedView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          {/* Header */}
          <View
            style={[
              styles.header,
              {
                backgroundColor: colors.background,
                borderBottomColor: colors.text + '15',
                paddingTop: insets.top - 50,
              },
            ]}
          >
            <View style={styles.headerContent}>
              <View style={styles.headerLeft}>
                {otherPlayer && (
                  <PlayerAvatar
                    firstName={otherPlayer.first_name}
                    lastName={otherPlayer.last_name}
                    pictureUrl={otherPlayer.picture}
                    size={40}
                  />
                )}
                <View style={styles.headerTitleContainer}>
                  <ThemedText style={styles.headerTitle}>{displayName}</ThemedText>
                  <ThemedText style={[styles.headerSubtitle, { color: colors.text + '60' }]}>
                    Discussion privée
                  </ThemedText>
                </View>
              </View>
              <View style={styles.headerRight}>
                {(() => {
                  if (!match || !currentPlayer) return null;
                  
                  const isPlayerA = match.player_a_id === currentPlayer.id;
                  const delayStatus = match.delayed_status;
                  const canRequestDelay = !match.delayed_requested_by || 
                                       delayStatus === 'cancelled' || 
                                       delayStatus === 'rejected';
                  const isMatchNotPlayed = !match.score_a && !match.score_b;
                  
                  if (canRequestDelay && isMatchNotPlayed) {
                    return (
                      <TouchableOpacity
                        onPress={async () => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          Alert.alert(
                            'Reporter le match ?',
                            'Voulez-vous demander un report de ce match à votre adversaire ?',
                            [
                              { text: 'Annuler', style: 'cancel' },
                              {
                                text: 'Confirmer',
                                style: 'default',
                                onPress: async () => {
                                  try {
                                    await api.requestMatchDelay(match.id, currentPlayer.id);
                                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                    Alert.alert('Demande envoyée', 'Votre demande de report a été envoyée à votre adversaire');
                                    // Recharger les informations du match
                                    const seasons = await api.getSeasonsCached();
                                    const currentSeason = seasons.find((s) => s.status === 'running') || seasons[0];
                                    if (currentSeason && match.id) {
                                      const matches = await api.getMatches(currentSeason.id);
                                      const updatedMatch = matches.find((m) => m.id === match.id);
                                      if (updatedMatch) setMatch(updatedMatch);
                                    }
                                  } catch (error: any) {
                                    console.error('Erreur demande report:', error);
                                    Alert.alert('Erreur', error.message || 'Impossible d\'envoyer la demande de report');
                                  }
                                },
                              },
                            ]
                          );
                        }}
                        style={styles.reportButton}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <IconSymbol name="calendar.badge.exclamationmark" size={20} color={colors.text + 'CC'} />
                      </TouchableOpacity>
                    );
                  }
                  return null;
                })()}
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onClose();
                  }}
                  style={styles.closeButton}
                  activeOpacity={0.7}
                >
                  <IconSymbol name="xmark" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Messages */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={true}
          >
            {loading && messages.length === 0 ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.text + '80'} />
              </View>
            ) : matchNotFound ? (
              <View style={styles.emptyContainer}>
                <IconSymbol name="exclamationmark.triangle" size={48} color={colors.text + '40'} />
                <ThemedText style={[styles.emptyText, { color: colors.text + '60' }]}>
                  Aucun match trouvé
                </ThemedText>
                <ThemedText style={[styles.emptySubtext, { color: colors.text + '40' }]}>
                  Vous devez avoir un match programmé avec {displayName} pour pouvoir discuter.
                </ThemedText>
              </View>
            ) : messages.length === 0 ? (
              <View style={styles.emptyContainer}>
                <IconSymbol name="bubble.left.and.bubble.right" size={48} color={colors.text + '40'} />
                <ThemedText style={[styles.emptyText, { color: colors.text + '60' }]}>
                  Aucun message pour le moment
                </ThemedText>
                <ThemedText style={[styles.emptySubtext, { color: colors.text + '40' }]}>
                  Commencez la conversation !
                </ThemedText>
              </View>
            ) : (
              messages.map((message) => {
                // Vérifier si c'est notre message en comparant player_id ou player.id
                // Normaliser les IDs pour la comparaison (enlever les espaces, convertir en minuscules si nécessaire)
                const messagePlayerId = message.player_id || message.player?.id;
                const isOwnMessage = messagePlayerId === currentPlayerId;
                
                // Debug: log pour vérifier
                if (__DEV__) {
                  console.log('Message check:', {
                    messagePlayerId,
                    currentPlayerId,
                    isOwnMessage,
                    messageText: message.text.substring(0, 20),
                  });
                }
                
                const messageDate = message.created_at ? new Date(message.created_at) : new Date();
                // Pour déterminer le joueur qui a envoyé le message
                const messagePlayer = message.player || (isOwnMessage ? currentPlayer : otherPlayer);

                return (
                  <View
                    key={message.id}
                    style={[
                      styles.messageItem,
                      isOwnMessage && styles.messageItemOwn,
                    ]}
                  >
                    {!isOwnMessage && messagePlayer && (
                      <PlayerAvatar
                        firstName={messagePlayer.first_name}
                        lastName={messagePlayer.last_name}
                        pictureUrl={messagePlayer.picture}
                        size={32}
                      />
                    )}
                    <View
                      style={[
                        styles.messageBubble,
                        {
                          backgroundColor: isOwnMessage
                            ? PRIMARY_COLOR
                            : colors.text + '10',
                        },
                      ]}
                    >
                      {!isOwnMessage && messagePlayer && (
                        <ThemedText
                          style={[
                            styles.messageAuthor,
                            { color: colors.text + '80' },
                          ]}
                        >
                          {messagePlayer.first_name} {messagePlayer.last_name}
                        </ThemedText>
                      )}
                      <ThemedText
                        style={[
                          styles.messageText,
                          {
                            color: isOwnMessage ? '#000' : colors.text,
                          },
                        ]}
                      >
                        {message.text}
                      </ThemedText>
                      <ThemedText
                        style={[
                          styles.messageDate,
                          {
                            color: isOwnMessage ? '#000' + '80' : colors.text + '50',
                          },
                        ]}
                      >
                        {formatChatDate(messageDate)}
                      </ThemedText>
                    </View>
                    {/* Suppression désactivée pour les messages de conversation */}
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Input */}
          <View
            style={[
              styles.inputContainer,
              {
                backgroundColor: colors.background,
                borderTopColor: colors.text + '15',
                paddingBottom: insets.bottom,
              },
            ]}
          >
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.text + '05',
                  color: colors.text,
                  borderColor: colors.text + '15',
                },
              ]}
              placeholder="Écrire un message..."
              placeholderTextColor={colors.text + '50'}
              value={messageText}
              onChangeText={setMessageText}
              onSubmitEditing={handleSendMessage}
              multiline
              maxLength={500}
              editable={!sending && !matchNotFound && !!matchId}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                {
                  backgroundColor: messageText.trim() && !sending && !matchNotFound && !!matchId ? PRIMARY_COLOR : colors.text + '20',
                },
              ]}
              onPress={handleSendMessage}
              disabled={!messageText.trim() || sending || matchNotFound || !matchId}
              activeOpacity={0.7}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <IconSymbol
                  name="paperplane.fill"
                  size={18}
                  color={messageText.trim() && !sending ? '#000' : colors.text + '60'}
                />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    borderBottomWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reportButton: {
    padding: 6,
    borderRadius: 8,
  },
  closeButton: {
    padding: 6,
    marginLeft: 8,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 4,
  },
  messageItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 16,
  },
  messageItemOwn: {
    flexDirection: 'row-reverse',
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    gap: 4,
  },
  messageAuthor: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
  },
  messageDate: {
    fontSize: 11,
    marginTop: 2,
  },
  deleteButton: {
    padding: 6,
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 44,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
});
