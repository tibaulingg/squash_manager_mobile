import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/services/api';
import type { PlayerDTO, WaitingListEntryDTO } from '@/types/api';

interface WaitingListModalProps {
  visible: boolean;
  onClose: () => void;
}

export function WaitingListModal({ visible, onClose }: WaitingListModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useAuth();
  
  const [waitingList, setWaitingList] = useState<WaitingListEntryDTO[]>([]);
  const [allPlayers, setAllPlayers] = useState<PlayerDTO[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [myWaitingEntry, setMyWaitingEntry] = useState<WaitingListEntryDTO | null>(null);

  const loadWaitingList = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const [allWaitingList, players] = await Promise.all([
        api.getWaitingList(),
        api.getPlayersCached(true),
      ]);

      setAllPlayers(players);
      const unprocessedList = allWaitingList.filter((entry) => !entry.processed);
      setWaitingList(unprocessedList);

      // Si l'utilisateur est connecté, trouver son entrée
      if (isAuthenticated && user) {
        const players = await api.getPlayersCached(true);
        const currentPlayer = players.find((p) => p.email?.toLowerCase() === user.email.toLowerCase());
        if (currentPlayer) {
          const myEntry = allWaitingList.find(
            (entry) => entry.player_id === currentPlayer.id && !entry.processed
          );
          setMyWaitingEntry(myEntry || null);
        }
      }
    } catch (error) {
      console.error('Erreur chargement file d\'attente:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (visible) {
      loadWaitingList();
    }
  }, [visible, loadWaitingList]);

  const getPlayerName = (playerId: string): string => {
    const player = allPlayers.find((p) => p.id === playerId);
    if (!player) return 'Joueur inconnu';
    return `${player.first_name} ${player.last_name}`;
  };

  const handleRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadWaitingList(true);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ThemedView style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16, borderBottomColor: colors.text + '20' }]}>
          <View style={styles.headerLeft}>
            <View style={[styles.iconContainer, { backgroundColor: PRIMARY_COLOR + '20' }]}>
              <IconSymbol name="person.3.fill" size={24} color={PRIMARY_COLOR} />
            </View>
            <ThemedText style={styles.headerTitle}>File d'attente</ThemedText>
          </View>
          <View style={styles.headerRight}>
            <ThemedText style={[styles.headerCount, { color: colors.text + '60' }]}>
              {waitingList.length} {waitingList.length > 1 ? 'personnes' : 'personne'}
            </ThemedText>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              activeOpacity={0.7}
            >
              <IconSymbol name="xmark" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.text + '80'} />
            <ThemedText style={[styles.loadingText, { color: colors.text, opacity: 0.5 }]}>
              Chargement...
            </ThemedText>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.text + '80'}
                colors={[colors.text + '80']}
              />
            }
          >
            {waitingList.length === 0 ? (
              <View style={styles.emptyContainer}>
                <IconSymbol name="tray.fill" size={48} color={colors.text + '60'} />
                <ThemedText style={[styles.emptyText, { color: colors.text }]}>
                  Aucune personne en attente
                </ThemedText>
                <ThemedText style={[styles.emptySubtext, { color: colors.text + '60' }]}>
                  La file d'attente est vide pour le moment
                </ThemedText>
              </View>
            ) : (
              <View style={styles.listContainer}>
                {waitingList.map((entry, index) => (
                  <View
                    key={entry.id}
                    style={[
                      styles.listItem,
                      { borderBottomColor: colors.text + '10' },
                      index === waitingList.length - 1 && styles.listItemLast,
                      entry.id === myWaitingEntry?.id && { backgroundColor: PRIMARY_COLOR + '08' },
                    ]}
                  >
                    <View style={styles.listItemLeft}>
                      <View style={[styles.positionBadge, { backgroundColor: PRIMARY_COLOR + '15' }]}>
                        <ThemedText style={[styles.positionNumber, { color: PRIMARY_COLOR }]}>
                          #{entry.order_no || index + 1}
                        </ThemedText>
                      </View>
                      <View style={styles.listItemInfo}>
                        <ThemedText style={[styles.listItemName, { color: colors.text }]}>
                          {entry.id === myWaitingEntry?.id ? 'Vous' : getPlayerName(entry.player_id)}
                        </ThemedText>
                        {entry.target_box_number && (
                          <ThemedText style={[styles.listItemBox, { color: colors.text + '60' }]}>
                            Box {entry.target_box_number} souhaité
                          </ThemedText>
                        )}
                      </View>
                    </View>
                    <ThemedText style={[styles.listItemDate, { color: colors.text + '60' }]}>
                      {new Date(entry.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </ThemedText>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerCount: {
    fontSize: 14,
    fontWeight: '500',
  },
  closeButton: {
    padding: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 300,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
  },
  listContainer: {
    gap: 0,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderRadius: 12,
    marginBottom: 8,
  },
  listItemLast: {
    borderBottomWidth: 0,
  },
  listItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  positionBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionNumber: {
    fontSize: 14,
    fontWeight: '700',
  },
  listItemInfo: {
    flex: 1,
  },
  listItemName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  listItemBox: {
    fontSize: 13,
    fontWeight: '500',
  },
  listItemDate: {
    fontSize: 12,
    fontWeight: '500',
  },
});
