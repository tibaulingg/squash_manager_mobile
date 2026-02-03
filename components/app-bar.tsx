import * as Haptics from 'expo-haptics';
import { useRouter, useSegments } from 'expo-router';
import type { ComponentProps } from 'react';
import React, { useMemo, useState } from 'react';
import { Image, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ProfileScreen from '@/app/(tabs)/profil';
import { AuthModal } from '@/components/auth-modal';
import { NotificationsList } from '@/components/notifications-list';
import { PlayerAvatar } from '@/components/player-avatar';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationsContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/services/api';
import type { PlayerDTO } from '@/types/api';

interface MenuItem {
  label: string;
  icon?: string;
  onPress: () => void;
}

interface AppBarProps {
  title?: string;
  menuItems?: MenuItem[];
  leftIcon?: {
    icon: string;
    onPress: () => void;
  };
  rightAction?: {
    icon: string;
    label?: string;
    onPress: () => void;
  };
  rightActions?: Array<{
    icon: string;
    label?: string;
    onPress: () => void;
  }>;
}

export function AppBar({ title, menuItems, leftIcon, rightAction, rightActions }: AppBarProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useAuth();
  const { unreadCount } = useNotifications();
  const router = useRouter();
  const segments = useSegments();
  const [currentPlayer, setCurrentPlayer] = React.useState<PlayerDTO | null>(null);
  const [showProfileModal, setShowProfileModal] = React.useState(false);
  const [showAuthModal, setShowAuthModal] = React.useState(false);
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // Charger le joueur actuel
  const loadCurrentPlayer = React.useCallback(async () => {
    if (!isAuthenticated || !user) {
      setCurrentPlayer(null);
      return;
    }
    
    try {
      // Forcer le refresh pour avoir les données à jour
      const players = await api.getPlayersCached(true);
      const player = players.find((p) => p.email?.toLowerCase() === user.email.toLowerCase());
      setCurrentPlayer(player || null);
    } catch (error) {
      console.error('Erreur chargement joueur:', error);
      setCurrentPlayer(null);
    }
  }, [isAuthenticated, user]);

  React.useEffect(() => {
    loadCurrentPlayer();
  }, [loadCurrentPlayer]);

  // Recharger quand le modal de profil se ferme (pour mettre à jour la membership)
  React.useEffect(() => {
    if (!showProfileModal && isAuthenticated && user) {
      // Petit délai pour laisser le temps au cache d'être invalidé
      const timer = setTimeout(() => {
        loadCurrentPlayer();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [showProfileModal, isAuthenticated, user, loadCurrentPlayer]);

  // Déterminer le titre selon la route
  const pageTitle = useMemo(() => {
    if (title) return title;
    
    const route = segments[segments.length - 1] || 'index';
    
    const titles: { [key: string]: string } = {
      index: 'Home',
      feed: 'Actualités',
      live: 'Matchs en cours',
      box: 'Classement',
      ranking: 'Golden Ranking',
      profil: 'Profil',
    };
    
    return titles[route] || 'Lundi des box';
  }, [segments, title]);

  const handleAvatarPress = () => {
    if (!isAuthenticated || !user) {
      // Rediriger vers l'authentification si nécessaire
      return;
    }
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowProfileModal(true);
  };

  return (
    <>
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.text + '15',
            paddingTop: insets.top,
          },
        ]}
      >
        <View style={styles.content}>
          <View style={styles.titleSection}>
            {leftIcon && (
              <TouchableOpacity
                onPress={leftIcon.onPress}
                activeOpacity={0.7}
                style={styles.leftIconButton}
              >
                <IconSymbol name={leftIcon.icon as ComponentProps<typeof IconSymbol>['name']} size={24} color={colors.text} />
              </TouchableOpacity>
            )}
            <View style={styles.logoContainer}>
              <Image
                source={require('@/favicon-logo-header.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <ThemedText style={[styles.title, { color: colors.text }]}>
              {pageTitle}
            </ThemedText>
          </View>
          
          <View style={styles.rightSection}>
            {/* Actions multiples à droite */}
            {rightActions && rightActions.map((action, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  action.onPress();
                }}
                activeOpacity={0.6}
                style={styles.actionButton}
              >
                <IconSymbol 
                  name={action.icon as ComponentProps<typeof IconSymbol>['name']} 
                  size={22} 
                  color={colors.text} 
                />
                {action.label && (
                  <ThemedText style={[styles.actionButtonLabel, { color: colors.text }]}>
                    {action.label}
                  </ThemedText>
                )}
              </TouchableOpacity>
            ))}
            {/* Action unique à droite (pour compatibilité) */}
            {!rightActions && rightAction && (
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  rightAction.onPress();
                }}
                activeOpacity={0.6}
                style={styles.actionButton}
              >
                <IconSymbol 
                  name={rightAction.icon as ComponentProps<typeof IconSymbol>['name']} 
                  size={22} 
                  color={colors.text} 
                />
                {rightAction.label && (
                  <ThemedText style={[styles.actionButtonLabel, { color: colors.text }]}>
                    {rightAction.label}
                  </ThemedText>
                )}
              </TouchableOpacity>
            )}
            
            {isAuthenticated && (
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowNotifications(true);
                }}
                activeOpacity={0.7}
                style={styles.notificationButton}
              >
                <View style={styles.notificationIconContainer}>
                  <IconSymbol name="bell.fill" size={24} color={colors.text} />
                  {unreadCount > 0 && (
                    <View style={[styles.notificationBadge, { backgroundColor: '#ef4444' }]}>
                      <ThemedText style={styles.notificationBadgeText}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </ThemedText>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            )}
            
            {menuItems && menuItems.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowMenu(true);
                }}
                activeOpacity={0.7}
                style={styles.menuButton}
              >
                <IconSymbol name="ellipsis.circle.fill" size={24} color={colors.text} />
              </TouchableOpacity>
            )}
            
            {isAuthenticated && currentPlayer ? (
              <TouchableOpacity
                onPress={handleAvatarPress}
                activeOpacity={0.7}
                style={styles.avatarButton}
              >
                <View style={styles.avatarContainer}>
                  <PlayerAvatar
                    firstName={currentPlayer.first_name || 'Joueur'}
                    lastName={currentPlayer.last_name || ''}
                    pictureUrl={currentPlayer.picture}
                    size={36}
                  />
                  {currentPlayer.current_box?.next_box_status && (
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            currentPlayer.current_box.next_box_status === 'continue'
                              ? '#10b981'
                              : currentPlayer.current_box.next_box_status === 'stop'
                              ? '#ef4444'
                              : '#6b7280',
                          borderColor: colors.background,
                          shadowColor:
                            currentPlayer.current_box.next_box_status === 'continue'
                              ? '#10b981'
                              : currentPlayer.current_box.next_box_status === 'stop'
                              ? '#ef4444'
                              : '#6b7280',
                        },
                      ]}
                    >
                      <IconSymbol
                        name={
                          currentPlayer.current_box.next_box_status === 'continue'
                            ? 'checkmark'
                            : currentPlayer.current_box.next_box_status === 'stop'
                            ? 'xmark'
                            : 'questionmark'
                        }
                        size={7}
                        color="#fff"
                      />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowAuthModal(true);
                }}
                activeOpacity={0.7}
                style={styles.loginButton}
              >
                <IconSymbol name="person.circle.fill" size={32} color={colors.text} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Modal de profil */}
      {showProfileModal && user && (
        <ProfileScreen
          isModal={true}
          playerId={user.id}
          onClose={() => {
            setShowProfileModal(false);
          }}
        />
      )}

      {/* Modal d'authentification */}
      <AuthModal
        visible={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
        }}
      />

      {/* Modal de notifications */}
      {isAuthenticated && (
        <NotificationsList
          visible={showNotifications}
          onClose={() => {
            setShowNotifications(false);
          }}
        />
      )}

      {/* Menu modal */}
      {menuItems && menuItems.length > 0 && (
        <Modal
          visible={showMenu}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowMenu(false)}
        >
          <TouchableOpacity
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={() => setShowMenu(false)}
          >
            <View
              style={[styles.menuContainer, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}
              onStartShouldSetResponder={() => true}
            >
              {menuItems.map((item, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.menuItem,
                    { backgroundColor: colors.background },
                    index === 0 && styles.menuItemFirst,
                    index === menuItems.length - 1 && styles.menuItemLast,
                    index !== menuItems.length - 1 && { borderBottomColor: colors.text + '10' },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowMenu(false);
                    item.onPress();
                  }}
                  activeOpacity={0.6}
                >
                  {item.icon && (
                    <View style={[styles.menuItemIconContainer, { backgroundColor: PRIMARY_COLOR + '10' }]}>
                      <IconSymbol name={item.icon as ComponentProps<typeof IconSymbol>['name']} size={18} color={PRIMARY_COLOR} />
                    </View>
                  )}
                  <ThemedText style={[styles.menuItemText, { color: colors.text }]} numberOfLines={1}>
                    {item.label}
                  </ThemedText>
                  <IconSymbol name="chevron.right" size={14} color={colors.text + '30'} />
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    zIndex: 10,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    minHeight: 56,
  },
  titleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  leftIconButton: {
    padding: 4,
    marginRight: 4,
  },
  logoContainer: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuButton: {
    padding: 4,
  },
  notificationButton: {
    padding: 4,
    position: 'relative',
  },
  notificationIconContainer: {
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderRadius: 8,
    gap: 6,
  },
  actionButtonLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  avatarButton: {
    marginLeft: 0,
  },
  avatarContainer: {
    position: 'relative',
  },
  statusBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 15,
    height: 15,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  loginButton: {
    padding: 4,
    marginLeft: 0,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 100,
    paddingRight: 20,
  },
  menuContainer: {
    minWidth: 260,
    maxWidth: 320,
    borderRadius: 14,
    borderWidth: 0.5,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 15,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    gap: 12,
    minHeight: 50,
  },
  menuItemFirst: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  menuItemLast: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  menuItemIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '400',
    letterSpacing: -0.2,
  },
});
