import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import type { NotificationDTO } from '@/types/api';

// Configuration des notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

interface NotificationsContextType {
  notifications: NotificationDTO[];
  unreadCount: number;
  isLoading: boolean;
  registerForPushNotifications: (playerId: string) => Promise<string | null>;
  refreshNotifications: (playerId: string) => Promise<void>;
  markAsRead: (notificationId: string, playerId: string) => Promise<void>;
  markAllAsRead: (playerId: string) => Promise<void>;
  deleteNotification: (notificationId: string, playerId: string) => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationDTO[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  /**
   * Rafraîchit la liste des notifications depuis l'API
   */
  const refreshNotifications = useCallback(async (playerId: string) => {
    if (!playerId) return;

    setIsLoading(true);
    try {
      const fetchedNotifications = await api.getNotifications(playerId, false);
      // Vérifier et normaliser les dates
      const normalizedNotifications = fetchedNotifications.map(notif => ({
        ...notif,
        created_at: notif.created_at || new Date().toISOString(), // Fallback si date manquante
      }));
      setNotifications(normalizedNotifications);
    } catch (error) {
      console.error('❌ Erreur lors du chargement des notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Écouter les notifications reçues quand l'app est au premier plan
  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener(async (notification) => {
      console.log('📬 Notification reçue:', notification);
      
      // Rafraîchir automatiquement les notifications depuis l'API pour mettre à jour le badge
      if (user?.id) {
        await refreshNotifications(user.id);
      }
    });

    // Écouter les notifications cliquées
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('👆 Notification cliquée:', response);
      const data = response.notification.request.content.data;
      
      console.log('👆 Data:', data);

      // Naviguer selon le type d'entité
      if (data?.entity_type === 'match') {
        // Naviguer vers l'onglet "box" pour les notifications de match
        router.push('/(tabs)/box');
      } else if (data?.entity_type === 'membership') {
        // Naviguer vers l'onglet "box" pour les notifications de membership
        router.push('/(tabs)/box');
      }
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [user?.id, refreshNotifications, router]);

  /**
   * Enregistre le device pour recevoir des notifications push
   */
  const registerForPushNotifications = useCallback(async (playerId: string): Promise<string | null> => {
    try {
      // Demander les permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('⚠️ Permissions de notification refusées');
        return null;
      }

      // Obtenir le projectId depuis la config Expo
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      
      if (!projectId) {
        console.warn('⚠️ ProjectId Expo non configuré. Les notifications push peuvent ne pas fonctionner.');
        console.warn('⚠️ Exécutez "npx eas init" pour configurer votre projectId.');
      }

      // Obtenir le token Expo Push
      const tokenData = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      );

      const token = tokenData.data;
      console.log('📱 Token Expo Push:', token);

      // Déterminer la plateforme
      const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

      // Enregistrer le token sur le serveur
      try {
        await api.registerNotificationToken(playerId, token, platform);
        console.log('✅ Token enregistré sur le serveur');
      } catch (error) {
        console.error('❌ Erreur lors de l\'enregistrement du token:', error);
        // On continue quand même, le token sera réessayé plus tard
      }

      // Configurer le canal Android (pour Android 8.0+)
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Notifications par défaut',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      return token;
    } catch (error) {
      console.error('❌ Erreur lors de l\'enregistrement des notifications:', error);
      return null;
    }
  }, []);

  /**
   * Marque une notification comme lue
   */
  const markAsRead = useCallback(async (notificationId: string, playerId: string) => {
    try {
      await api.markNotificationAsRead(notificationId, playerId);
      setNotifications((prev) =>
        prev.map((notif) => (notif.id === notificationId ? { ...notif, read: true } : notif))
      );
    } catch (error) {
      console.error('❌ Erreur lors du marquage de la notification:', error);
      throw error;
    }
  }, []);

  /**
   * Marque toutes les notifications comme lues
   */
  const markAllAsRead = useCallback(async (playerId: string) => {
    try {
      await api.markAllNotificationsAsRead(playerId);
      setNotifications((prev) => prev.map((notif) => ({ ...notif, read: true })));
    } catch (error) {
      console.error('❌ Erreur lors du marquage de toutes les notifications:', error);
      throw error;
    }
  }, []);

  /**
   * Supprime une notification
   */
  const deleteNotification = useCallback(async (notificationId: string, playerId: string) => {
    try {
      await api.deleteNotification(notificationId, playerId);
      setNotifications((prev) => prev.filter((notif) => notif.id !== notificationId));
    } catch (error) {
      console.error('❌ Erreur lors de la suppression de la notification:', error);
      throw error;
    }
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const value: NotificationsContextType = {
    notifications,
    unreadCount,
    isLoading,
    registerForPushNotifications,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  };

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}
