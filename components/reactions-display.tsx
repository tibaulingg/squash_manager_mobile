import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { PlayerAvatar } from '@/components/player-avatar';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/services/api';
import type { PlayerDTO } from '@/types/api';

const REACTIONS = [
  { emoji: '❤️', name: 'heart' },
  { emoji: '🔥', name: 'fire' },
  { emoji: '👏', name: 'clap' },
  { emoji: '👍', name: 'thumbs_up' },
  { emoji: '👎', name: 'thumbs_down' },
  { emoji: '😢', name: 'sad' },
];

interface ReactionsDisplayProps {
  entityId: string;
  entityType: 'match' | 'membership';
  reactions: { [reaction: string]: number };
  userReaction: string | null;
  currentPlayerId?: string;
  onReaction: (reaction: string) => void;
  onShowReactionPlayers?: (playersByType: { [reactionType: string]: PlayerDTO[] }) => void;
  onPlayerPress?: (playerId: string) => void;
  showAddButton?: boolean;
  compact?: boolean;
}

export function ReactionsDisplay({
  entityId,
  entityType,
  reactions,
  userReaction,
  currentPlayerId,
  onReaction,
  onShowReactionPlayers,
  onPlayerPress,
  showAddButton = true,
  compact = false,
}: ReactionsDisplayProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [showPicker, setShowPicker] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [reactionPlayersModal, setReactionPlayersModal] = useState<{
    visible: boolean;
    playersByType: { [reactionType: string]: PlayerDTO[] };
  } | null>(null);

  const totalReactions = Object.values(reactions).reduce((sum, count) => sum + count, 0);

  const handleReactionPress = async (reactionName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onReaction(reactionName);
    setShowPicker(false);
  };

  const handleReactionLongPress = async (reactionName: string) => {
    try {
      setLoadingPlayers(true);
      const playersByType = await api.getReactionPlayers(entityType, entityId);
      
      // Si onShowReactionPlayers est fourni, l'utiliser (compatibilité avec l'ancien code)
      if (onShowReactionPlayers) {
        onShowReactionPlayers(playersByType);
      } else {
        // Sinon, afficher le modal directement dans le composant
        setReactionPlayersModal({
          visible: true,
          playersByType,
        });
      }
    } catch (error) {
      console.error('Erreur chargement joueurs réaction:', error);
      Alert.alert('Erreur', 'Impossible de charger la liste des joueurs');
    } finally {
      setLoadingPlayers(false);
    }
  };

  // Si pas de réactions et pas de bouton add, ne rien afficher
  if (totalReactions === 0 && !showAddButton) {
    return null;
  }

  return (
    <View>
      {/* Affichage des réactions existantes - style Discord */}
      {totalReactions > 0 && (
        <>
          <View style={[
            styles.reactionsContainer, 
            compact && styles.reactionsContainerCompact,
            { borderTopWidth: 1, borderTopColor: colors.text + '15' }
          ]}>
            {REACTIONS.map((reaction) => {
              const count = reactions[reaction.name] || 0;
              if (count === 0) return null;
              
              const hasThisReaction = userReaction === reaction.name;
              
              return (
                <TouchableOpacity
                  key={reaction.name}
                  style={[
                    styles.reactionBadge,
                    compact && styles.reactionBadgeCompact,
                    { 
                      borderColor: hasThisReaction ? PRIMARY_COLOR + '80' : colors.text + '20',
                      borderWidth: hasThisReaction ? 1.5 : 1,
                      backgroundColor: hasThisReaction ? PRIMARY_COLOR + '20' : colors.text + '08',
                    }
                  ]}
                  onPress={() => handleReactionPress(reaction.name)}
                  onLongPress={() => handleReactionLongPress(reaction.name)}
                  activeOpacity={0.7}
                  disabled={loadingPlayers}
                >
                  <ThemedText style={[styles.reactionEmoji, compact && styles.reactionEmojiCompact]}>
                    {reaction.emoji}
                  </ThemedText>
                  <ThemedText style={[
                    styles.reactionCount, 
                    compact && styles.reactionCountCompact,
                    { color: colors.text + (hasThisReaction ? '90' : '70') }
                  ]}>
                    {count}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
            
            {/* Bouton + pour ajouter une réaction */}
            {showAddButton && (
              <TouchableOpacity
                style={[
                  styles.reactionAddButton,
                  compact && styles.reactionAddButtonCompact,
                  { 
                    borderColor: colors.text + '20',
                    backgroundColor: colors.text + '08',
                  }
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowPicker(prev => !prev);
                }}
                activeOpacity={0.7}
              >
                <ThemedText style={[styles.reactionAddText, { color: colors.text + '70' }]}>+</ThemedText>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      {/* Si pas de réactions mais bouton add, afficher juste le bouton */}
      {totalReactions === 0 && showAddButton && (
        <View style={styles.reactionsContainer}>
          <TouchableOpacity
            style={[
              styles.reactionAddButton,
              compact && styles.reactionAddButtonCompact,
              { 
                borderColor: colors.text + '20',
                backgroundColor: colors.text + '08',
              }
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowPicker(prev => !prev);
            }}
            activeOpacity={0.7}
          >
            <IconSymbol name="face.smiling.fill" size={compact ? 14 : 16} color={colors.text + '70'} />
          </TouchableOpacity>
        </View>
      )}

      {/* Panneau de réactions (picker) */}
      {showPicker && (
        <View style={[styles.reactionsPanel, { borderTopColor: colors.text + '10' }]}>
          <View style={styles.reactionsPickerContainer}>
            {REACTIONS.map((reaction) => {
              const hasThisReaction = userReaction === reaction.name;
              return (
                <TouchableOpacity
                  key={reaction.name}
                  style={[
                    styles.reactionPickerButton,
                    compact && styles.reactionPickerButtonCompact,
                    hasThisReaction && { backgroundColor: colors.text + '15' },
                  ]}
                  onPress={() => handleReactionPress(reaction.name)}
                  activeOpacity={0.7}
                >
                  <ThemedText style={[styles.reactionEmojiButton, compact && styles.reactionEmojiButtonCompact]}>
                    {reaction.emoji}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Modal pour afficher les joueurs qui ont réagi */}
      <Modal
        visible={reactionPlayersModal?.visible || false}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setReactionPlayersModal(null);
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setReactionPlayersModal(null);
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
                }}
                style={styles.reactionPlayersModalCloseButton}
                activeOpacity={0.7}
              >
                <IconSymbol name="xmark" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {loadingPlayers ? (
              <View style={styles.reactionPlayersModalLoading}>
                <ActivityIndicator size="large" color={colors.text + '80'} />
              </View>
            ) : (
              <ScrollView style={styles.reactionPlayersModalList}>
                {(() => {
                  if (!reactionPlayersModal?.playersByType) return null;
                  
                  // Aplatir les données : créer une liste de { player, reactionType }
                  const playersWithReactions: Array<{ player: PlayerDTO; reactionType: string }> = [];
                  Object.entries(reactionPlayersModal.playersByType).forEach(([reactionType, players]) => {
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

                  if (playersWithReactions.length === 0) {
                    return (
                      <View style={styles.reactionPlayersModalEmpty}>
                        <ThemedText style={[styles.reactionPlayersModalEmptyText, { color: colors.text, opacity: 0.6 }]}>
                          Aucun joueur n'a réagi
                        </ThemedText>
                      </View>
                    );
                  }

                  return playersWithReactions.map(({ player, reactionType }) => {
                    const reaction = REACTIONS.find(r => r.name === reactionType);
                    return (
                      <TouchableOpacity
                        key={`${player.id}-${reactionType}`}
                        style={[styles.reactionPlayerItem, { borderBottomColor: colors.text + '10' }]}
                        onPress={() => {
                          if (onPlayerPress) {
                            onPlayerPress(player.id);
                          }
                          setReactionPlayersModal(null);
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
  reactionsContainer: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  reactionsContainerCompact: {
    paddingHorizontal: 0,
    paddingTop: 4,
    paddingBottom: 0,
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
  reactionBadgeCompact: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reactionEmoji: {
    fontSize: 16,
  },
  reactionEmojiCompact: {
    fontSize: 12,
  },
  reactionCount: {
    fontSize: 12,
    fontWeight: '500',
  },
  reactionCountCompact: {
    fontSize: 11,
  },
  reactionAddButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionAddButtonCompact: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  reactionAddText: {
    fontSize: 18,
    fontWeight: '600',
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
  reactionPickerButtonCompact: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  reactionEmojiButton: {
    fontSize: 24,
  },
  reactionEmojiButtonCompact: {
    fontSize: 20,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  reactionPlayersModal: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: 20,
    overflow: 'hidden',
  },
  reactionPlayersModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
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
  reactionPlayersModalEmpty: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionPlayersModalEmptyText: {
    fontSize: 14,
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
    fontSize: 24,
  },
});
