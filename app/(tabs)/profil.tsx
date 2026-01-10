import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthModal } from '@/components/auth-modal';
import { PlayerAvatar } from '@/components/player-avatar';
import { EditProfileForm } from '@/components/profile/edit-profile-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useImagePicker } from '@/hooks/use-image-picker';
import { api } from '@/services/api';
import type { PlayerDTO } from '@/types/api';
import { formatMatchScore, getMatchSpecialStatus, isSpecialCaseMatch } from '@/utils/match-helpers';

// Couleur d'avatar sobre
const AVATAR_COLOR = '#9ca3af';

const getInitials = (name: string): string => {
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

const formatDate = (date: Date): string => {
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  
  const day = days[date.getDay()];
  const month = months[date.getMonth()];
  const dayNumber = date.getDate();
  const year = date.getFullYear();

  return `${day} ${dayNumber} ${month} ${year}`;
};

type SortOption = 'date' | 'score' | 'opponent';
type FilterOption = 'all' | 'won' | 'lost';

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { user, logout, isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerDTO | null>(null);
  const [stats, setStats] = useState({ wins: 0, losses: 0, winRate: 0 });
  const [recentMatches, setRecentMatches] = useState<Array<{
    matchData: any; // MatchDTO complet pour accéder aux IDs spéciaux
    opponent: string;
    score: string;
    won: boolean;
    date: Date;
  }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({
    email: '',
    phone: '',
    schedulePreference: 'peu_importe' as 'tot' | 'tard' | 'peu_importe',
  });
  const { image: newProfileImage, pickImage, clearImage } = useImagePicker();

  const loadData = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      
      // 1. Trouver le joueur par email
      const players = await api.getPlayers();
      const player = players.find((p) => p.email?.toLowerCase() === user.email.toLowerCase());
      
      if (!player) return;
      
      setCurrentPlayer(player);
      
      // 2. Récupérer la saison en cours
      const seasons = await api.getSeasons();
      const currentSeason = seasons.find((s) => s.status === 'running') || seasons[0];
      
      if (!currentSeason) return;
      
      // 3. Récupérer TOUS les matchs du joueur (toutes saisons confondues)
      const matches = await api.getMatches(); // Pas de seasonId = tous les matchs
      const playerMatches = matches.filter(
        (m) => m.player_a_id === player.id || m.player_b_id === player.id
      );
      
      console.log(`Total matchs du joueur (toutes saisons): ${playerMatches.length}`);
      
      // Filtrer uniquement les matchs VRAIMENT terminés pour les stats (avec score, pas 0-0, sans cas spéciaux)
      const completedMatchesForStats = playerMatches.filter(
        (m) => m.score_a !== null && 
               m.score_b !== null && 
               !(m.score_a === 0 && m.score_b === 0) &&
               !m.no_show_player_id && 
               !m.retired_player_id && 
               !m.delayed_player_id
      );
      
      console.log(`Matchs terminés pour stats: ${completedMatchesForStats.length}`);
      
      // Calculer les stats
      let wins = 0;
      let losses = 0;
      
      completedMatchesForStats.forEach((match) => {
        const isPlayerA = match.player_a_id === player.id;
        const playerScore = isPlayerA ? match.score_a! : match.score_b!;
        const opponentScore = isPlayerA ? match.score_b! : match.score_a!;
        
        if (playerScore > opponentScore) {
          wins++;
        } else {
          losses++;
        }
      });
      
      const total = wins + losses;
      const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
      
      console.log(`Stats: ${wins}V - ${losses}D - ${winRate}%`);
      
      setStats({ wins, losses, winRate });
      
      // 4. Historique complet (matchs terminés + matchs remis)
      const completedMatchesForHistory = playerMatches.filter(
        (m) => {
          // Matchs avec score (terminés)
          const hasScore = m.score_a !== null && m.score_b !== null && !(m.score_a === 0 && m.score_b === 0);
          // Matchs remis (sans score mais avec delayed_player_id)
          const isDelayed = m.delayed_player_id !== null;
          // Blessures et absences (avec score ou sans)
          const hasSpecialStatus = m.no_show_player_id !== null || m.retired_player_id !== null;
          
          return hasScore || isDelayed || hasSpecialStatus;
        }
      );
      
      const sortedMatches = [...completedMatchesForHistory]
        .sort((a, b) => {
          const dateA = a.played_at ? new Date(a.played_at).getTime() : new Date(a.scheduled_at || 0).getTime();
          const dateB = b.played_at ? new Date(b.played_at).getTime() : new Date(b.scheduled_at || 0).getTime();
          return dateB - dateA;
        });
      
      console.log(`Matchs pour historique complet: ${sortedMatches.length}`);
      
      const history = sortedMatches.map((match) => {
        const isPlayerA = match.player_a_id === player.id;
        const opponentId = isPlayerA ? match.player_b_id : match.player_a_id;
        const opponent = players.find((p) => p.id === opponentId);
        
        // Gérer les matchs sans score (remis, blessures, absences)
        const playerScore = (match.score_a !== null && match.score_b !== null) 
          ? (isPlayerA ? match.score_a : match.score_b)
          : 0;
        const opponentScore = (match.score_a !== null && match.score_b !== null)
          ? (isPlayerA ? match.score_b : match.score_a)
          : 0;
        
        const matchDate = match.played_at 
          ? new Date(match.played_at) 
          : (match.scheduled_at ? new Date(match.scheduled_at) : new Date());
        
        return {
          matchData: match, // Garder le match complet pour les cas spéciaux
          opponent: opponent ? `${opponent.first_name} ${opponent.last_name}` : 'Inconnu',
          score: `${playerScore}-${opponentScore}`,
          won: playerScore > opponentScore,
          date: matchDate,
        };
      });
      
      console.log(`Historique créé: ${history.length} matchs`);
      
      setRecentMatches(history);
    } catch (error) {
      console.error('Erreur chargement profil:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Déconnexion', 'Êtes-vous sûr ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Déconnexion',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(tabs)');
        },
      },
    ]);
  };

  const handleUpdateNextBoxStatus = async (status: string | null) => {
    if (!currentPlayer) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    try {
      setUpdatingStatus(true);
      try {
        await api.updatePlayerNextBoxStatus(currentPlayer.id, status);
        console.log('Statut mis à jour avec succès');
      } catch (error) {
        console.error('Erreur mise à jour statut:', error);
        Alert.alert('Erreur', 'Impossible de mettre à jour le statut');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      
      // Mettre à jour l'état local uniquement
      setCurrentPlayer({
        ...currentPlayer,
        current_box: currentPlayer.current_box ? {
          ...currentPlayer.current_box,
          next_box_status: status,
        } : null,
      });
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Erreur mise à jour statut:', error);
      Alert.alert('Erreur', 'Impossible de mettre à jour le statut');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleEditProfile = () => {
    if (!currentPlayer) return;
    
    setEditForm({
      email: currentPlayer.email || '',
      phone: currentPlayer.phone || '',
      schedulePreference: (currentPlayer.schedule_preference || 'peu_importe') as 'tot' | 'tard' | 'peu_importe',
    });
    clearImage(); // Reset de l'image
    setIsEditingProfile(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleCancelEdit = () => {
    setIsEditingProfile(false);
    clearImage();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveProfile = async () => {
    if (!currentPlayer) return;
    
    // Validation
    if (!editForm.email.trim() || !editForm.email.includes('@')) {
      Alert.alert('Erreur', 'Veuillez entrer un email valide');
      return;
    }
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      setUpdatingStatus(true);
      await api.updatePlayerInfo(currentPlayer.id, {
        first_name: currentPlayer.first_name,
        last_name: currentPlayer.last_name,
        email: editForm.email.trim(),
        phone: editForm.phone.trim(),
        schedule_preference: editForm.schedulePreference,
        profile_image: newProfileImage || undefined,
      });
      
      // Recharger les données
      await loadData();
      
      setIsEditingProfile(false);
      clearImage();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Succès', 'Profil mis à jour avec succès');
    } catch (error) {
      console.error('Erreur mise à jour profil:', error);
      Alert.alert('Erreur', 'Impossible de mettre à jour le profil');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Filtrer et trier les matchs
  const filteredMatches = recentMatches
    .filter((match) => {
      // Filtre par recherche
      if (searchQuery && !match.opponent.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      
      // Filtre par résultat
      const isSpecialCase = isSpecialCaseMatch(match.matchData);
      
      // Si on filtre par victoires/défaites, exclure les cas spéciaux
      if (filterBy === 'won') {
        return !isSpecialCase && match.won;
      }
      if (filterBy === 'lost') {
        return !isSpecialCase && !match.won;
      }
      
      // Si filtre "tous", tout afficher
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return b.date.getTime() - a.date.getTime();
        case 'opponent':
          return a.opponent.localeCompare(b.opponent);
        case 'score':
          const [scoreA1, scoreA2] = a.score.split('-').map(Number);
          const [scoreB1, scoreB2] = b.score.split('-').map(Number);
          return (scoreB1 - scoreB2) - (scoreA1 - scoreA2);
        default:
          return 0;
      }
    });

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PRIMARY_COLOR} />
        </View>
      </ThemedView>
    );
  }

  // Vue publique (non connecté)
  if (!isAuthenticated) {
    return (
      <ThemedView style={styles.container}>
        <AuthModal visible={showAuthModal} onClose={() => setShowAuthModal(false)} />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: Math.max(insets.top, 20) + 20 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar et invitation */}
          <View style={styles.profileHeader}>
            <View style={[styles.avatar, { backgroundColor: AVATAR_COLOR }]}>
              <IconSymbol name="person.fill" size={48} color="#FFFFFF" />
            </View>
            <ThemedText style={styles.profileName}>Connectez-vous</ThemedText>
            <ThemedText style={[styles.profileEmail, { color: colors.text + '60' }]}>
              Accédez à votre profil personnalisé
            </ThemedText>
          </View>

          {/* Carte d'invitation */}
          <View style={[styles.card, { backgroundColor: colors.background }]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={[styles.iconContainer, { backgroundColor: PRIMARY_COLOR + '20' }]}>
                  <IconSymbol name="star.fill" size={16} color={PRIMARY_COLOR} />
                </View>
                <ThemedText style={styles.sectionTitle}>Fonctionnalités</ThemedText>
              </View>
            </View>
            
            <View style={styles.featuresList}>
              <View style={styles.featureItem}>
                <IconSymbol name="chart.bar.fill" size={20} color={PRIMARY_COLOR} />
                <ThemedText style={[styles.featureText, { color: colors.text }]}>
                  Statistiques détaillées
                </ThemedText>
              </View>
              <View style={styles.featureItem}>
                <IconSymbol name="list.bullet" size={20} color={PRIMARY_COLOR} />
                <ThemedText style={[styles.featureText, { color: colors.text }]}>
                  Historique complet de vos matchs
                </ThemedText>
              </View>
              <View style={styles.featureItem}>
                <IconSymbol name="calendar.badge.plus" size={20} color={PRIMARY_COLOR} />
                <ThemedText style={[styles.featureText, { color: colors.text }]}>
                  Export vers votre calendrier
                </ThemedText>
              </View>
              <View style={styles.featureItem}>
                <IconSymbol name="square.grid.2x2.fill" size={20} color={PRIMARY_COLOR} />
                <ThemedText style={[styles.featureText, { color: colors.text }]}>
                  Suivi de votre box et classement
                </ThemedText>
              </View>
            </View>
          </View>

          {/* Bouton de connexion */}
          <TouchableOpacity
            style={[styles.loginButton, { backgroundColor: PRIMARY_COLOR }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowAuthModal(true);
            }}
            activeOpacity={0.8}
          >
            <ThemedText style={styles.loginButtonText}>Se connecter</ThemedText>
            <IconSymbol name="arrow.right" size={20} color="#000" />
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </ThemedView>
    );
  }

  // Vue connectée (personnalisée)
  return (
    <ThemedView style={styles.container}>
      <AuthModal visible={showAuthModal} onClose={() => setShowAuthModal(false)} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(insets.top, 20) + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header avec profil */}
        <View style={styles.profileHeader}>
          <TouchableOpacity
            style={[styles.editIconButton, { backgroundColor: colors.text + '08' }]}
            onPress={handleEditProfile}
            activeOpacity={0.7}
          >
            <IconSymbol name="pencil.circle.fill" size={28} color={colors.text} />
          </TouchableOpacity>
          
          <PlayerAvatar
            firstName={currentPlayer?.first_name || user?.name.split(' ')[0] || 'User'}
            lastName={currentPlayer?.last_name || user?.name.split(' ')[1] || ''}
            pictureUrl={currentPlayer?.picture}
            size={100}
            backgroundColor={AVATAR_COLOR}
          />
          {currentPlayer && (
            <>
              <ThemedText style={styles.profileName}>
                {currentPlayer.first_name} {currentPlayer.last_name}
              </ThemedText>
              <ThemedText style={[styles.profileEmail, { color: colors.text, opacity: 0.6 }]}>
                {currentPlayer.email}
              </ThemedText>
              
              {/* Badges en ligne */}
              <View style={styles.badgesContainer}>
                {currentPlayer.current_box && (
                  <View style={[styles.infoBadge, styles.boxBadge, { backgroundColor: PRIMARY_COLOR + '15', borderColor: PRIMARY_COLOR + '40' }]}>
                    <IconSymbol name="square.grid.2x2.fill" size={14} color={PRIMARY_COLOR} />
                    <ThemedText style={[styles.infoBadgeText, { color: PRIMARY_COLOR }]}>
                      {currentPlayer.current_box.box_name}
                    </ThemedText>
                  </View>
                )}
                
                {currentPlayer.schedule_preference && currentPlayer.schedule_preference !== 'peu_importe' && (
                  <View style={[styles.infoBadge, styles.preferenceBadge, { backgroundColor: colors.text + '08', borderColor: colors.text + '20' }]}>
                    <ThemedText style={styles.infoBadgeText}>
                      {currentPlayer.schedule_preference === 'tot' ? '🌅 Tôt' : '🌙 Tard'}
                    </ThemedText>
                  </View>
                )}
              </View>
            </>
          )}
        </View>

        {/* Modal d'édition du profil */}
        {isEditingProfile && currentPlayer && (
          <EditProfileForm
            firstName={currentPlayer.first_name}
            lastName={currentPlayer.last_name}
            email={editForm.email}
            phone={editForm.phone}
            pictureUrl={currentPlayer.picture}
            schedulePreference={editForm.schedulePreference}
            onEmailChange={(email) => setEditForm({ ...editForm, email })}
            onPhoneChange={(phone) => setEditForm({ ...editForm, phone })}
            onSchedulePreferenceChange={(pref) => setEditForm({ ...editForm, schedulePreference: pref })}
            onPickImage={pickImage}
            newImageUri={newProfileImage?.uri || null}
            onCancel={handleCancelEdit}
            onSave={handleSaveProfile}
            isSaving={updatingStatus}
          />
        )}

        {/* Next Box Status */}
        {currentPlayer?.current_box && (
          <View style={[styles.card, { backgroundColor: colors.background }]}>
            <ThemedText style={styles.sectionTitle}>Prochain Box</ThemedText>
            <ThemedText style={[styles.sectionSubtitle, { color: colors.text, opacity: 0.6 }]}>
              Souhaitez-vous continuer dans le prochain box ?
            </ThemedText>
            
            <View style={styles.statusButtons}>
              <TouchableOpacity
                style={[
                  styles.statusButton,
                  currentPlayer.current_box.next_box_status === 'continue' && [
                    styles.statusButtonActive,
                    { backgroundColor: '#10b981' + '20', borderColor: '#10b981' },
                  ],
                  { borderColor: colors.text + '20' },
                ]}
                onPress={() => handleUpdateNextBoxStatus('continue')}
                disabled={updatingStatus}
                activeOpacity={0.7}
              >
                <IconSymbol 
                  name="checkmark.circle.fill" 
                  size={24} 
                  color={currentPlayer.current_box.next_box_status === 'continue' ? '#10b981' : colors.text + '60'} 
                />
                <ThemedText 
                  style={[
                    styles.statusButtonText,
                    currentPlayer.current_box.next_box_status === 'continue' && { color: '#10b981', fontWeight: '600' },
                  ]}
                >
                  Continuer
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.statusButton,
                  currentPlayer.current_box.next_box_status === 'stop' && [
                    styles.statusButtonActive,
                    { backgroundColor: '#ef4444' + '20', borderColor: '#ef4444' },
                  ],
                  { borderColor: colors.text + '20' },
                ]}
                onPress={() => handleUpdateNextBoxStatus('stop')}
                disabled={updatingStatus}
                activeOpacity={0.7}
              >
                <IconSymbol 
                  name="xmark.circle.fill" 
                  size={24} 
                  color={currentPlayer.current_box.next_box_status === 'stop' ? '#ef4444' : colors.text + '60'} 
                />
                <ThemedText 
                  style={[
                    styles.statusButtonText,
                    currentPlayer.current_box.next_box_status === 'stop' && { color: '#ef4444', fontWeight: '600' },
                  ]}
                >
                  Arrêter
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.statusButton,
                  !currentPlayer.current_box.next_box_status && [
                    styles.statusButtonActive,
                    { backgroundColor: colors.text + '10', borderColor: colors.text + '30' },
                  ],
                  { borderColor: colors.text + '20' },
                ]}
                onPress={() => handleUpdateNextBoxStatus(null)}
                disabled={updatingStatus}
                activeOpacity={0.7}
              >
                <IconSymbol 
                  name="questionmark.circle.fill" 
                  size={24} 
                  color={!currentPlayer.current_box.next_box_status ? colors.text : colors.text + '60'} 
                />
                <ThemedText 
                  style={[
                    styles.statusButtonText,
                    !currentPlayer.current_box.next_box_status && { fontWeight: '600' },
                  ]}
                >
                  Indécis
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Statistiques principales */}
        <View style={[styles.statsCard, { backgroundColor: colors.background }]}>
          <ThemedText style={styles.sectionTitle}>Statistiques</ThemedText>
          <View style={styles.statsGrid}>
            <View style={[styles.statBox, { backgroundColor: colors.text + '05' }]}>
              <ThemedText style={[styles.statValue, { color: PRIMARY_COLOR }]}>
                {stats.wins}
              </ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.text, opacity: 0.6 }]}>
                Victoires
              </ThemedText>
            </View>
            <View style={[styles.statBox, { backgroundColor: colors.text + '05' }]}>
              <ThemedText style={[styles.statValue, { color: colors.text }]}>
                {stats.losses}
              </ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.text, opacity: 0.6 }]}>
                Défaites
              </ThemedText>
            </View>
            <View style={[styles.statBox, { backgroundColor: colors.text + '05' }]}>
              <ThemedText style={[styles.statValue, { color: colors.text }]}>
                {stats.winRate}%
              </ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.text, opacity: 0.6 }]}>
                Victoires
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Historique des matchs */}
        {recentMatches.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.background }]}>
            <ThemedText style={styles.sectionTitle}>
              Historique ({filteredMatches.length} {filteredMatches.length > 1 ? 'matchs' : 'match'})
            </ThemedText>
            
            {/* Barre de recherche */}
            <View style={[styles.searchBar, { backgroundColor: colors.text + '05', borderColor: colors.text + '10' }]}>
              <IconSymbol name="magnifyingglass" size={18} color={colors.text + '60'} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Rechercher un adversaire..."
                placeholderTextColor={colors.text + '60'}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <IconSymbol name="xmark.circle.fill" size={18} color={colors.text + '60'} />
                </TouchableOpacity>
              )}
            </View>

            {/* Filtres et tri */}
            <View style={styles.filterRow}>
              <View style={styles.filterGroup}>
                <ThemedText style={[styles.filterLabel, { color: colors.text, opacity: 0.6 }]}>
                  Résultat:
                </ThemedText>
                <View style={styles.filterButtons}>
                  <TouchableOpacity
                    style={[
                      styles.filterButton,
                      filterBy === 'all' && [styles.filterButtonActive, { backgroundColor: PRIMARY_COLOR }],
                      { borderColor: colors.text + '20' },
                    ]}
                    onPress={() => {
                      setFilterBy('all');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <ThemedText 
                      style={[
                        styles.filterButtonText, 
                        filterBy === 'all' && { color: '#000', fontWeight: '600' }
                      ]}
                    >
                      Tous
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.filterButton,
                      filterBy === 'won' && [styles.filterButtonActive, { backgroundColor: PRIMARY_COLOR }],
                      { borderColor: colors.text + '20' },
                    ]}
                    onPress={() => {
                      setFilterBy('won');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <ThemedText 
                      style={[
                        styles.filterButtonText, 
                        filterBy === 'won' && { color: '#000', fontWeight: '600' }
                      ]}
                    >
                      V
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.filterButton,
                      filterBy === 'lost' && [styles.filterButtonActive, { backgroundColor: PRIMARY_COLOR }],
                      { borderColor: colors.text + '20' },
                    ]}
                    onPress={() => {
                      setFilterBy('lost');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <ThemedText 
                      style={[
                        styles.filterButtonText, 
                        filterBy === 'lost' && { color: '#000', fontWeight: '600' }
                      ]}
                    >
                      D
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.filterGroup}>
                <ThemedText style={[styles.filterLabel, { color: colors.text, opacity: 0.6 }]}>
                  Trier:
                </ThemedText>
                <View style={styles.filterButtons}>
                  <TouchableOpacity
                    style={[
                      styles.filterButton,
                      sortBy === 'date' && [styles.filterButtonActive, { backgroundColor: PRIMARY_COLOR }],
                      { borderColor: colors.text + '20' },
                    ]}
                    onPress={() => {
                      setSortBy('date');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <IconSymbol 
                      name="calendar" 
                      size={14} 
                      color={sortBy === 'date' ? '#000' : colors.text} 
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.filterButton,
                      sortBy === 'opponent' && [styles.filterButtonActive, { backgroundColor: PRIMARY_COLOR }],
                      { borderColor: colors.text + '20' },
                    ]}
                    onPress={() => {
                      setSortBy('opponent');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <IconSymbol 
                      name="person.fill" 
                      size={14} 
                      color={sortBy === 'opponent' ? '#000' : colors.text} 
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.filterButton,
                      sortBy === 'score' && [styles.filterButtonActive, { backgroundColor: PRIMARY_COLOR }],
                      { borderColor: colors.text + '20' },
                    ]}
                    onPress={() => {
                      setSortBy('score');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <ThemedText 
                      style={[
                        styles.filterButtonText, 
                        sortBy === 'score' && { color: '#000', fontWeight: '600' }
                      ]}
                    >
                      Δ
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Liste des matchs */}
            <View style={styles.matchHistoryList}>
              {filteredMatches.map((match, index) => (
                <View
                  key={index}
                  style={[
                    styles.matchHistoryItem,
                    index !== filteredMatches.length - 1 && [
                      styles.matchHistoryBorder,
                      { borderBottomColor: colors.text + '15' },
                    ],
                  ]}
                >
                  <View style={styles.matchHistoryLeft}>
                    <ThemedText style={styles.matchHistoryOpponent}>
                      {match.opponent}
                    </ThemedText>
                    <ThemedText style={[styles.matchHistoryDate, { color: colors.text, opacity: 0.5 }]}>
                      {formatDate(match.date)}
                    </ThemedText>
                  </View>
                  <View
                    style={[
                      styles.matchHistoryScore,
                      { 
                        backgroundColor: (() => {
                          if (!currentPlayer) return colors.text + '10';
                          const specialStatus = getMatchSpecialStatus(match.matchData, currentPlayer.id, match.won);
                          return specialStatus.backgroundColor;
                        })()
                      },
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.matchHistoryScoreText,
                        { 
                          color: (() => {
                            if (!currentPlayer) return colors.text;
                            const specialStatus = getMatchSpecialStatus(match.matchData, currentPlayer.id, match.won);
                            return specialStatus.textColor;
                          })()
                        },
                      ]}
                    >
                      {(() => {
                        if (!currentPlayer) return match.score;
                        const [playerScore, opponentScore] = match.score.split('-').map(Number);
                        return formatMatchScore(match.matchData, currentPlayer.id, playerScore, opponentScore);
                      })()}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Paramètres */}
        <View style={[styles.card, { backgroundColor: colors.background }]}>
          <ThemedText style={styles.sectionTitle}>Paramètres</ThemedText>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <View style={styles.settingLeft}>
              <IconSymbol name="arrow.right.square.fill" size={20} color={colors.text + '60'} />
              <ThemedText style={[styles.settingLabel, { color: colors.text }]}>
                Se déconnecter
              </ThemedText>
            </View>
            <IconSymbol name="chevron.right" size={16} color={colors.text + '40'} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 28,
    marginTop: 8,
    position: 'relative',
  },
  editIconButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    borderRadius: 16,
    padding: 8,
    zIndex: 1,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 32,
  },
  profileName: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 12,
  },
  profileEmail: {
    fontSize: 15,
    fontWeight: '400',
    marginBottom: 16,
  },
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  infoBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  preferenceBadge: {
    // Styles additionnels si besoin
  },
  preferenceBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  boxBadge: {
    // Styles additionnels si besoin
  },
  boxBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    marginBottom: 16,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    marginBottom: 16,
    lineHeight: 20,
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  statusButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    gap: 8,
  },
  statusButtonActive: {
    borderWidth: 2,
  },
  statusButtonText: {
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  filterRow: {
    flexDirection: 'column',
    gap: 12,
    marginBottom: 16,
  },
  filterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '500',
    minWidth: 60,
  },
  filterButtons: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  filterButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
  },
  filterButtonActive: {
    borderWidth: 0,
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '400',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 6,
    lineHeight: 36,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  matchHistoryList: {
    gap: 0,
  },
  matchHistoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  matchHistoryBorder: {
    borderBottomWidth: 1,
  },
  matchHistoryLeft: {
    flex: 1,
  },
  matchHistoryOpponent: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  matchHistoryDate: {
    fontSize: 13,
    fontWeight: '400',
  },
  matchHistoryScore: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  matchHistoryScoreText: {
    fontSize: 14,
    fontWeight: '600',
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '400',
  },
  // Styles pour la vue publique
  featuresList: {
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 15,
    fontWeight: '500',
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 12,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
});
