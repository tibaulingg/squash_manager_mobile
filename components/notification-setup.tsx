import { useEffect, useRef } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationsContext';

/**
 * Composant qui enregistre automatiquement le token de notification
 * quand l'utilisateur se connecte et rafraîchit les notifications
 */
export function NotificationSetup() {
  const { user, isAuthenticated } = useAuth();
  const { registerForPushNotifications, refreshNotifications } = useNotifications();
  const hasRegisteredToken = useRef<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && user && user.id !== hasRegisteredToken.current) {
      // Enregistrer le token de notification (une seule fois par utilisateur)
      hasRegisteredToken.current = user.id;
      
      registerForPushNotifications(user.id).catch((error) => {
        console.error('Erreur lors de l\'enregistrement du token:', error);
        hasRegisteredToken.current = null; // Réessayer au prochain render
      });

      // Charger les notifications
      refreshNotifications(user.id).catch((error) => {
        console.error('Erreur lors du chargement des notifications:', error);
      });
    } else if (!isAuthenticated) {
      // Réinitialiser quand l'utilisateur se déconnecte
      hasRegisteredToken.current = null;
    }
  }, [isAuthenticated, user?.id, registerForPushNotifications, refreshNotifications]);

  return null;
}
