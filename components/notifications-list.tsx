import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { NotificationDTO } from '@/types/api';

interface NotificationsListProps {
  visible: boolean;
  onClose: () => void;
}

export function NotificationsList({ visible, onClose }: NotificationsListProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    isLoading,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  useEffect(() => {
    if (visible && user) {
      refreshNotifications(user.id);
    }
  }, [visible, user?.id, refreshNotifications]);

  const handleNotificationPress = async (notification: NotificationDTO) => {
    if (!user) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Marquer comme lue si elle ne l'est pas déjà
    if (!notification.read) {
      try {
        await markAsRead(notification.id, user.id);
      } catch (error) {
        console.error('Erreur lors du marquage de la notification:', error);
      }
    }

    // Naviguer selon le type de notification
    onClose();
    
    if (notification.data?.entity_type === 'match') {
      // Naviguer vers l'onglet "box" pour les notifications de match
      router.push('/(tabs)/box');
    } else if (notification.data?.entity_type === 'membership') {
      // Naviguer vers l'onglet "box" pour les notifications de membership
      router.push('/(tabs)/box');
    } else if (notification.type === 'match_comment' && notification.data?.match_id) {
      // Fallback pour les anciennes notifications sans entity_type
      router.push('/(tabs)/box');
    } else if (notification.type === 'match_started' && notification.data?.match_id) {
      // Fallback pour les anciennes notifications sans entity_type
      router.push('/(tabs)/box');
    } else if (notification.type === 'membership_added' && notification.data?.membership_id) {
      // Fallback pour les anciennes notifications sans entity_type
      router.push('/(tabs)/box');
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await markAllAsRead(user.id);
    } catch (error) {
      console.error('Erreur lors du marquage de toutes les notifications:', error);
      Alert.alert('Erreur', 'Impossible de marquer toutes les notifications comme lues');
    }
  };

  const handleDelete = async (notificationId: string) => {
    if (!user) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await deleteNotification(notificationId, user.id);
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      Alert.alert('Erreur', 'Impossible de supprimer la notification');
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Date inconnue';
    
    const date = new Date(dateString);
    
    // Vérifier si la date est valide
    if (isNaN(date.getTime())) {
      console.warn('Date invalide:', dateString);
      return 'Date inconnue';
    }
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    // Vérifier si la différence est valide (pas de dates futures invalides)
    if (diffMs < 0) {
      return 'À l\'instant';
    }
    
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    
    try {
      return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    } catch (error) {
      console.warn('Erreur formatage date:', error);
      return 'Date inconnue';
    }
  };

  const getNotificationIcon = (type: NotificationDTO['type']) => {
    switch (type) {
      case 'membership_added':
        return 'person.badge.plus.fill';
      case 'match_comment':
        return 'bubble.left.fill';
      case 'match_started':
        return 'play.circle.fill';
      case 'match_played':
        return 'checkmark.circle.fill';
      default:
        return 'bell.fill';
    }
  };

  const renderNotification = ({ item }: { item: NotificationDTO }) => (
    <TouchableOpacity
      style={[
        styles.notificationItem,
        {
          backgroundColor: item.read ? colors.background : PRIMARY_COLOR + '08',
          borderLeftColor: item.read ? 'transparent' : PRIMARY_COLOR,
        },
      ]}
      onPress={() => handleNotificationPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.notificationContent}>
        <View style={[styles.iconContainer, { backgroundColor: PRIMARY_COLOR + '15' }]}>
          <IconSymbol
            name={getNotificationIcon(item.type) as any}
            size={20}
            color={PRIMARY_COLOR}
          />
        </View>
        <View style={styles.textContainer}>
          <ThemedText style={[styles.title, !item.read && styles.unreadTitle]}>
            {item.title}
          </ThemedText>
          <ThemedText style={[styles.body, { color: colors.text + 'CC' }]} numberOfLines={2}>
            {item.body}
          </ThemedText>
          <ThemedText style={[styles.date, { color: colors.text + '80' }]}>
            {formatDate(item.created_at)}
          </ThemedText>
        </View>
        {!item.read && (
          <View style={[styles.unreadDot, { backgroundColor: PRIMARY_COLOR }]} />
        )}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDelete(item.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <IconSymbol name="xmark.circle.fill" size={20} color={colors.text + '60'} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.text + '15' }]}>
          <View style={styles.headerContent}>
            <ThemedText style={styles.headerTitle}>Notifications</ThemedText>
            {unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: PRIMARY_COLOR }]}>
                <ThemedText style={styles.badgeText}>{unreadCount}</ThemedText>
              </View>
            )}
          </View>
          <View style={styles.headerActions}>
            {unreadCount > 0 && (
              <TouchableOpacity
                onPress={handleMarkAllAsRead}
                style={styles.markAllButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <ThemedText style={[styles.markAllText, { color: PRIMARY_COLOR }]}>
                  Tout marquer lu
                </ThemedText>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <IconSymbol name="xmark" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* List */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={PRIMARY_COLOR} />
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.emptyContainer}>
            <IconSymbol name="bell.slash.fill" size={64} color={colors.text + '40'} />
            <ThemedText style={[styles.emptyText, { color: colors.text + '80' }]}>
              Aucune notification
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={notifications}
            renderItem={renderNotification}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  badge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  markAllButton: {
    paddingVertical: 4,
  },
  markAllText: {
    fontSize: 15,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
  },
  notificationItem: {
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    overflow: 'hidden',
  },
  notificationContent: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'flex-start',
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  unreadTitle: {
    fontWeight: '700',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  date: {
    fontSize: 12,
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  deleteButton: {
    padding: 4,
    marginLeft: 4,
  },
});
