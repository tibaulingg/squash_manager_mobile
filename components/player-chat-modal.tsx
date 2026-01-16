import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayerAvatar } from '@/components/player-avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/services/api';
import type { MatchCommentDTO, MatchDTO, PlayerDTO } from '@/types/api';
import { getSeasonFromBoxMembership, getDefaultSeason } from '@/utils/season-helpers';

interface PlayerChatModalProps {
  visible: boolean;
  currentPlayerId: string;
  otherPlayerId: string;
  otherPlayerName: string;
  matchId?: string; // Optionnel : si fourni, utilise ce match, sinon cherche le match entre les deux joueurs
  onClose: () => void;
}

// Formater la date du match pour l'affichage dans le header
const formatMatchDateForHeader = (date: Date): string => {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const matchDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const diffDays = Math.floor((matchDate.getTime() - today.getTime()) / 86400000);
  
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  
  if (diffDays === 0) {
    return "Aujourd'hui";
  } else if (diffDays === 1) {
    return "Demain";
  } else if (diffDays === -1) {
    return "Hier";
  } else if (diffDays > 1 && diffDays < 7) {
    return days[date.getUTCDay()];
  } else {
    return `${days[date.getUTCDay()]} ${date.getUTCDate()} ${months[date.getUTCMonth()]}`;
  }
};

// Formater l'heure du match
const formatMatchTime = (date: Date): string => {
  // Utiliser UTC pour éviter les problèmes de timezone
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

// Formater le score du match
const formatMatchScore = (match: MatchDTO, currentPlayerId: string): string | null => {
  if (!match.score_a && !match.score_b) return null;
  
  const isPlayerA = match.player_a_id === currentPlayerId;
  const playerScore = isPlayerA ? match.score_a : match.score_b;
  const opponentScore = isPlayerA ? match.score_b : match.score_a;
  
  if (playerScore === null || opponentScore === null) return null;
  
  return `${playerScore}-${opponentScore}`;
};

// Formater la date/heure complète pour l'affichage détaillé
const formatFullTimestamp = (date: Date): string => {
  if (isNaN(date.getTime())) {
    return 'Date invalide';
  }
  
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  // Utiliser UTC pour éviter les problèmes de timezone
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const messageDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const diffDays = Math.floor((messageDate.getTime() - today.getTime()) / 86400000);
  
  if (diffDays === 0) {
    return `Aujourd'hui à ${hours}:${minutes}`;
  } else if (diffDays === 1) {
    return `Demain à ${hours}:${minutes}`;
  } else if (diffDays === -1) {
    return `Hier à ${hours}:${minutes}`;
  } else {
    return `${days[date.getUTCDay()]} ${date.getUTCDate()} ${months[date.getUTCMonth()]} à ${hours}:${minutes}`;
  }
};

const formatChatDate = (date: Date): string => {
  // Vérifier que la date est valide
  if (isNaN(date.getTime())) {
    return 'Date invalide';
  }
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  // Si la date est dans le futur (problème de timezone), afficher la date complète
  if (diffMs < 0) {
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} • ${hours}:${minutes}`;
  }
  
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
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} • ${hours}:${minutes}`;
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
  const [allPlayers, setAllPlayers] = useState<PlayerDTO[]>([]);
  const [matchId, setMatchId] = useState<string | null>(providedMatchId || null);
  const [matchNotFound, setMatchNotFound] = useState(false);
  const [match, setMatch] = useState<MatchDTO | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [visibleTimestamps, setVisibleTimestamps] = useState<Set<string>>(new Set());
  const [acceptingDelay, setAcceptingDelay] = useState(false);

  // Charger les informations des joueurs et trouver le match
  useEffect(() => {
    const loadPlayersAndMatch = async () => {
      try {
        const playersList = await api.getPlayersCached();
        setAllPlayers(playersList);
        const other = playersList.find((p) => p.id === otherPlayerId);
        const current = playersList.find((p) => p.id === currentPlayerId);
        if (other) setOtherPlayer(other);
        if (current) setCurrentPlayer(current);

        // Si un matchId est fourni, l'utiliser
        let foundMatch: MatchDTO | null = null;
        
        if (providedMatchId) {
          setMatchId(providedMatchId);
          // Charger les informations du match
          const seasons = await api.getSeasonsCached();
          // Utiliser la saison du box où le joueur connecté a un membership
          const currentSeason = getSeasonFromBoxMembership(current || null, seasons) || getDefaultSeason(seasons);
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
        // Utiliser la saison du box où le joueur connecté a un membership
        const currentSeason = getSeasonFromBoxMembership(current || null, seasons) || getDefaultSeason(seasons);
        
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

  // Gérer l'ouverture du clavier pour scroller automatiquement
  useEffect(() => {
    if (!visible) return;

    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => {
        setKeyboardHeight(event.endCoordinates.height);
        // Délai pour laisser le KeyboardAvoidingView s'ajuster
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    );

    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, [visible]);

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
          keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
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
                  {match && currentPlayer ? (() => {
                    const isMatchNotPlayed = !match.score_a && !match.score_b;
                    const delayStatus = match.delayed_status;
                    const isReported = delayStatus === 'accepted';
                    
                    // Afficher la date si le match est programmé (non joué) et pas reporté
                    if (match.scheduled_at && !isReported && isMatchNotPlayed) {
                      try {
                        // scheduled_at est en heure locale, ne pas ajouter 'Z'
                        const scheduledDate = new Date(match.scheduled_at);
                        if (!isNaN(scheduledDate.getTime())) {
                          // Utiliser les méthodes locales pour scheduled_at
                          const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
                          const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
                          
                          const now = new Date();
                          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                          const matchDate = new Date(scheduledDate.getFullYear(), scheduledDate.getMonth(), scheduledDate.getDate());
                          const diffDays = Math.floor((matchDate.getTime() - today.getTime()) / 86400000);
                          
                          let dateText = '';
                          if (diffDays === 0) {
                            dateText = "Aujourd'hui";
                          } else if (diffDays === 1) {
                            dateText = "Demain";
                          } else if (diffDays === -1) {
                            dateText = "Hier";
                          } else if (diffDays > 1 && diffDays < 7) {
                            dateText = days[scheduledDate.getDay()];
                          } else {
                            dateText = `${days[scheduledDate.getDay()]} ${scheduledDate.getDate()} ${months[scheduledDate.getMonth()]}`;
                          }
                          
                          const hours = scheduledDate.getHours().toString().padStart(2, '0');
                          const minutes = scheduledDate.getMinutes().toString().padStart(2, '0');
                          
                          return (
                            <View style={styles.headerSubtitleContainer}>
                              <IconSymbol name="calendar" size={14} color={colors.text + '60'} />
                              <ThemedText style={[styles.headerSubtitle, { color: colors.text + '80' }]}>
                                {dateText} • {hours}:{minutes}
                              </ThemedText>
                            </View>
                          );
                        }
                      } catch (e) {
                        // Si erreur de parsing, ne rien afficher
                      }
                    }
                    
                    // Afficher la date si le match est joué (utiliser scheduled_at)
                    if (match.scheduled_at && !isMatchNotPlayed) {
                      try {
                        // scheduled_at est en heure locale, ne pas ajouter 'Z'
                        const scheduledDate = new Date(match.scheduled_at);
                        if (!isNaN(scheduledDate.getTime())) {
                          // Utiliser les méthodes locales pour scheduled_at
                          const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
                          const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
                          
                          const now = new Date();
                          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                          const matchDate = new Date(scheduledDate.getFullYear(), scheduledDate.getMonth(), scheduledDate.getDate());
                          const diffDays = Math.floor((matchDate.getTime() - today.getTime()) / 86400000);
                          
                          let dateText = '';
                          if (diffDays === 0) {
                            dateText = "Aujourd'hui";
                          } else if (diffDays === 1) {
                            dateText = "Demain";
                          } else if (diffDays === -1) {
                            dateText = "Hier";
                          } else if (diffDays > 1 && diffDays < 7) {
                            dateText = days[scheduledDate.getDay()];
                          } else {
                            dateText = `${days[scheduledDate.getDay()]} ${scheduledDate.getDate()} ${months[scheduledDate.getMonth()]}`;
                          }
                          
                          const hours = scheduledDate.getHours().toString().padStart(2, '0');
                          const minutes = scheduledDate.getMinutes().toString().padStart(2, '0');
                          
                          return (
                            <View style={styles.headerSubtitleContainer}>
                              <IconSymbol name="calendar" size={14} color={colors.text + '60'} />
                              <ThemedText style={[styles.headerSubtitle, { color: colors.text + '80' }]}>
                                {dateText} • {hours}:{minutes}
                              </ThemedText>
                            </View>
                          );
                        }
                      } catch (e) {
                        // Si erreur de parsing, ne rien afficher
                      }
                    }
       
                  })() : (
                    <></>
                  )}
                </View>
              </View>
              <View style={styles.headerRight}>
                {(() => {
                  if (!match || !currentPlayer) return null;
                  
                  const isPlayerA = match.player_a_id === currentPlayer.id;
                  const delayStatus = match.delayed_status;
                  const delayedRequestedBy = match.delayed_requested_by;
                  const canRequestDelay = !delayedRequestedBy || 
                                       delayStatus === 'cancelled' || 
                                       delayStatus === 'rejected';
                  const isMatchNotPlayed = !match.score_a && !match.score_b;
                  const canCancelDelay = delayStatus === 'pending' && 
                                       delayedRequestedBy === currentPlayer.id;
                  
                  // Bouton pour annuler la demande
                  if (canCancelDelay && isMatchNotPlayed) {
                    return (
                      <TouchableOpacity
                        onPress={async () => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          Alert.alert(
                            'Annuler la demande ?',
                            'Voulez-vous annuler votre demande de report ?',
                            [
                              { text: 'Non', style: 'cancel' },
                              {
                                text: 'Oui',
                                style: 'destructive',
                                onPress: async () => {
                                  try {
                                    await api.cancelMatchDelay(match.id, currentPlayer.id);
                                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                    // Recharger les informations du match
                                    const seasons = await api.getSeasonsCached();
                                    const currentSeason = getSeasonFromBoxMembership(currentPlayer, seasons) || getDefaultSeason(seasons);
                                    if (currentSeason && match.id) {
                                      const matches = await api.getMatches(currentSeason.id);
                                      const updatedMatch = matches.find((m) => m.id === match.id);
                                      if (updatedMatch) setMatch(updatedMatch);
                                    }
                                  } catch (error: any) {
                                    console.error('Erreur annulation report:', error);
                                    Alert.alert('Erreur', error.message || 'Impossible d\'annuler la demande de report');
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
                        <IconSymbol name="xmark.circle" size={20} color={colors.text + 'CC'} />
                      </TouchableOpacity>
                    );
                  }
                  
                  // Bouton pour demander un report
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
                                    const currentSeason = getSeasonFromBoxMembership(currentPlayer, seasons) || getDefaultSeason(seasons);
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

          {/* Statut du match */}
          {match && currentPlayer && (() => {
            // Vérifier si le match a été joué avec un score valide
            const hasValidScore = match.score_a !== null && 
                                 match.score_b !== null && 
                                 (match.score_a !== 0 || match.score_b !== 0);
            
            // Si le match est joué avec un score valide, ne pas afficher de statut
            if (hasValidScore) return null;
            
            // Priorité 1: Cas spéciaux résolus (blessure, absence, report accepté)
            if (match.no_show_player_id) {
              const isCurrentPlayerAbsent = match.no_show_player_id === currentPlayer.id;
              const statusMessage = isCurrentPlayerAbsent 
                ? 'Vous étiez absent' 
                : 'Votre adversaire était absent';
              return (
                <View
                  style={[
                    styles.matchStatusContainer,
                    {
                      backgroundColor: '#f3f4f615',
                      borderBottomColor: colors.text + '10',
                    },
                  ]}
                >
                  <IconSymbol 
                    name="person.crop.circle.badge.xmark" 
                    size={16} 
                    color="#6b7280" 
                  />
                  <ThemedText
                    style={[
                      styles.matchStatusText,
                      { color: '#6b7280' },
                    ]}
                  >
                    {statusMessage}
                  </ThemedText>
                </View>
              );
            }
            
            if (match.retired_player_id) {
              const isCurrentPlayerRetired = match.retired_player_id === currentPlayer.id;
              const statusMessage = isCurrentPlayerRetired 
                ? 'Vous vous êtes blessé' 
                : 'Votre adversaire s\'est blessé';
              return (
                <View
                  style={[
                    styles.matchStatusContainer,
                    {
                      backgroundColor: '#f3f4f615',
                      borderBottomColor: colors.text + '10',
                    },
                  ]}
                >
                  <IconSymbol 
                    name="cross.case" 
                    size={16} 
                    color="#6b7280" 
                  />
                  <ThemedText
                    style={[
                      styles.matchStatusText,
                      { color: '#6b7280' },
                    ]}
                  >
                    {statusMessage}
                  </ThemedText>
                </View>
              );
            }
            
            if (match.delayed_player_id && match.delayed_status === 'accepted') {
              const isCurrentPlayerDelayed = match.delayed_player_id === currentPlayer.id;
              const playerName = isCurrentPlayerDelayed 
                ? 'Vous' 
                : (otherPlayer ? `${otherPlayer.first_name} ${otherPlayer.last_name}` : 'Votre adversaire');
              return (
                <View
                  style={[
                    styles.matchStatusContainer,
                    {
                      backgroundColor: '#f3f4f615',
                      borderBottomColor: colors.text + '10',
                    },
                  ]}
                >
                  <IconSymbol 
                    name="calendar.badge.exclamationmark" 
                    size={16} 
                    color="#6b7280" 
                  />
                  <ThemedText
                    style={[
                      styles.matchStatusText,
                      { color: '#6b7280' },
                    ]}
                  >
                    Match reporté par {playerName}
                  </ThemedText>
                </View>
              );
            }
            
            // Priorité 2: Demandes de report en attente
            const delayStatus = match.delayed_status;
            const delayedRequestedBy = match.delayed_requested_by;
            
            if (delayStatus === 'pending' && delayedRequestedBy) {
              const isCurrentPlayerRequesting = delayedRequestedBy === currentPlayer.id;
              
              // Si c'est le joueur actuel qui doit accepter, afficher un bouton
              if (!isCurrentPlayerRequesting) {
                return (
                  <View
                    style={[
                      styles.matchStatusContainer,
                      {
                        backgroundColor: '#FFA50015',
                        borderBottomColor: colors.text + '10',
                      },
                    ]}
                  >
                    <IconSymbol 
                      name="clock" 
                      size={16} 
                      color="#FFA500" 
                    />
                    <ThemedText
                      style={[
                        styles.matchStatusText,
                        { color: '#FFA500', flex: 1 },
                      ]}
                    >
                      Votre adversaire a demandé un report
                    </ThemedText>
                    <TouchableOpacity
                      onPress={async () => {
                        if (acceptingDelay || !match) return;
                        
                        try {
                          setAcceptingDelay(true);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          
                          await api.acceptMatchDelay(match.id, currentPlayer.id);
                          
                          // Recharger les informations du match
                          const seasons = await api.getSeasonsCached();
                          const currentSeason = getSeasonFromBoxMembership(currentPlayer, seasons) || getDefaultSeason(seasons);
                          if (currentSeason && match.id) {
                            const matches = await api.getMatches(currentSeason.id);
                            const updatedMatch = matches.find((m) => m.id === match.id);
                            if (updatedMatch) setMatch(updatedMatch);
                          }
                          
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        } catch (error: any) {
                          console.error('Erreur acceptation report:', error);
                          Alert.alert('Erreur', error.message || 'Impossible d\'accepter le report');
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                        } finally {
                          setAcceptingDelay(false);
                        }
                      }}
                      style={[
                        styles.acceptButton,
                        {
                          backgroundColor: '#4CAF50',
                        },
                      ]}
                      disabled={acceptingDelay}
                      activeOpacity={0.7}
                    >
                      {acceptingDelay ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <IconSymbol name="checkmark" size={14} color="#FFFFFF" />
                          <ThemedText
                            style={[
                              styles.acceptButtonText,
                              { color: '#FFFFFF' },
                            ]}
                          >
                            Accepter
                          </ThemedText>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              }
              
              // Si c'est le joueur actuel qui a demandé, afficher juste le message
              return (
                <View
                  style={[
                    styles.matchStatusContainer,
                    {
                      backgroundColor: '#FFA50015',
                      borderBottomColor: colors.text + '10',
                    },
                  ]}
                >
                  <IconSymbol 
                    name="clock" 
                    size={16} 
                    color="#FFA500" 
                  />
                  <ThemedText
                    style={[
                      styles.matchStatusText,
                      { color: '#FFA500' },
                    ]}
                  >
                    En attente de validation du report par votre adversaire
                  </ThemedText>
                </View>
              );
            }
            
            if (delayStatus === 'rejected') {
              return (
                <View
                  style={[
                    styles.matchStatusContainer,
                    {
                      backgroundColor: '#F4433615',
                      borderBottomColor: colors.text + '10',
                    },
                  ]}
                >
                  <IconSymbol 
                    name="xmark.circle" 
                    size={16} 
                    color="#F44336" 
                  />
                  <ThemedText
                    style={[
                      styles.matchStatusText,
                      { color: '#F44336' },
                    ]}
                  >
                    Demande de report refusée
                  </ThemedText>
                </View>
              );
            }
            
            // Pas de statut à afficher
            return null;
          })()}

          {/* Bannière de score si le match est joué */}
          {match && allPlayers.length > 0 && (() => {
            const isMatchPlayed = match.score_a !== null && 
                                 match.score_b !== null && 
                                 match.played_at !== null &&
                                 (match.score_a !== 0 || match.score_b !== 0);
            
            if (!isMatchPlayed) return null;
            
            // Trouver les joueurs A et B selon les IDs du match
            const playerA = allPlayers.find((p) => p.id === match.player_a_id);
            const playerB = allPlayers.find((p) => p.id === match.player_b_id);
            
            if (!playerA || !playerB || !currentPlayer) return null;
            
            const playerAScore = match.score_a!;
            const playerBScore = match.score_b!;
            
            // Déterminer si le joueur connecté est player A ou B
            const isCurrentPlayerA = currentPlayer.id === match.player_a_id;
            
            // Toujours afficher le joueur connecté en premier
            const firstPlayer = currentPlayer;
            const secondPlayer = isCurrentPlayerA ? playerB : playerA;
            const firstPlayerScore = isCurrentPlayerA ? playerAScore : playerBScore;
            const secondPlayerScore = isCurrentPlayerA ? playerBScore : playerAScore;
            const firstPlayerName = `${firstPlayer.first_name} ${firstPlayer.last_name}`;
            const secondPlayerName = `${secondPlayer.first_name} ${secondPlayer.last_name}`;
            
            // Déterminer si le joueur connecté a gagné
            const currentPlayerWon = firstPlayerScore > secondPlayerScore;
            
            // Couleurs sobres pour la bannière
            const bannerColor = currentPlayerWon ? '#4CAF5015' : '#F4433615'; // Vert ou rouge avec transparence
            const textColor = currentPlayerWon ? '#4CAF50' : '#F44336'; // Vert ou rouge pour le texte
            
            return (
              <View
                style={[
                  styles.scoreBanner,
                  {
                    backgroundColor: bannerColor,
                    borderBottomColor: colors.text + '10',
                  },
                ]}
              >
                <View style={styles.scoreBannerContent}>
                  <View style={styles.scoreBannerPlayer}>
                    <ThemedText
                      style={[
                        styles.scoreBannerPlayerName,
                        { color: colors.text + '90' },
                      ]}
                    >
                      {firstPlayerName}
                    </ThemedText>
                    <ThemedText
                      style={[
                        styles.scoreBannerScore,
                        { 
                          color: textColor,
                          fontWeight: '700',
                        },
                      ]}
                    >
                      {firstPlayerScore}
                    </ThemedText>
                  </View>
                  <ThemedText
                    style={[
                      styles.scoreBannerSeparator,
                      { color: colors.text + '50' },
                    ]}
                  >
                    -
                  </ThemedText>
                  <View style={styles.scoreBannerPlayer}>
                    <ThemedText
                      style={[
                        styles.scoreBannerPlayerName,
                        { color: colors.text + '90' },
                      ]}
                    >
                      {secondPlayerName}
                    </ThemedText>
                    <ThemedText
                      style={[
                        styles.scoreBannerScore,
                        { 
                          color: textColor,
                          fontWeight: '700',
                        },
                      ]}
                    >
                      {secondPlayerScore}
                    </ThemedText>
                  </View>
                </View>
              </View>
            );
          })()}

          {/* Messages */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={[
              styles.messagesContent,
              messages.length === 0 && { flexGrow: 1 }
            ]}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
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

                // Parser la date correctement
                let messageDate: Date;
                if (message.created_at) {
                  // Normaliser le format de date (ajouter 'Z' si pas de timezone pour forcer UTC)
                  let dateString = String(message.created_at).trim();
                  
                  // Vérifier si la date a déjà un timezone (Z, +XX:XX, ou -XX:XX après l'heure)
                  const hasTimezone = dateString.endsWith('Z') || 
                                     /[+-]\d{2}:\d{2}$/.test(dateString) ||
                                     /[+-]\d{4}$/.test(dateString);
                  
                  // Si la date n'a pas de timezone, on l'interprète comme UTC
                  // Format: "2026-01-14T17:18:09.863" -> on ajoute 'Z' pour UTC
                  if (!hasTimezone) {
                    dateString = dateString + 'Z';
                  }
                  
                  const parsedDate = new Date(dateString);
                  // Vérifier si la date est valide
                  if (isNaN(parsedDate.getTime())) {
                    // Si la date n'est pas valide, utiliser la date actuelle comme fallback
                    console.warn('Date invalide pour le message:', message.created_at, '->', dateString);
                    messageDate = new Date();
                  } else {
                    messageDate = parsedDate;
                  }
                } else {
                  messageDate = new Date();
                }
                
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
                    <View style={styles.messageBubbleWrapper}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          setVisibleTimestamps(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has(message.id)) {
                              newSet.delete(message.id);
                            } else {
                              newSet.add(message.id);
                            }
                            return newSet;
                          });
                        }}
                        style={[
                          styles.messageBubble,
                          {
                            backgroundColor: isOwnMessage
                              ? (colorScheme === 'dark' ? '#1E88E5' : '#2196F3')
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
                              color: isOwnMessage ? '#FFFFFF' : colors.text,
                            },
                          ]}
                        >
                          {message.text}
                        </ThemedText>
                        {visibleTimestamps.has(message.id) && (
                          <ThemedText
                            style={[
                              styles.messageDate,
                              {
                                color: isOwnMessage ? '#FFFFFF' + 'CC' : colors.text + '50',
                              },
                            ]}
                          >
                            {formatFullTimestamp(messageDate)}
                          </ThemedText>
                        )}
                      </TouchableOpacity>
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
  headerSubtitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
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
  matchStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  matchStatusText: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 8,
  },
  acceptButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scoreBanner: {
    borderBottomWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  scoreBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  scoreBannerPlayer: {
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  scoreBannerPlayerName: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  scoreBannerScore: {
    fontSize: 20,
    fontWeight: '600',
  },
  scoreBannerSeparator: {
    fontSize: 16,
    fontWeight: '600',
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 300,
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
    alignItems: 'flex-end',
    gap: 10,
    marginBottom: 16,
  },
  messageItemOwn: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
  },
  messageBubbleWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    maxWidth: '75%',
  },
  messageBubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    gap: 2,
  },
  messageAuthor: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 1,
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
