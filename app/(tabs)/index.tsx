import * as Calendar from 'expo-calendar';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, RefreshControl, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthModal } from '@/components/auth-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { api } from '@/services/api';
import type { MatchDTO, PlayerDTO, WaitingListEntryDTO } from '@/types/api';
import { formatMatchScore, getMatchSpecialStatus } from '@/utils/match-helpers';

// Couleur d'avatar sobre
const AVATAR_COLOR = '#9ca3af';

const getInitials = (firstName: string, lastName: string): string => {
  return `${firstName[0]}${lastName[0]}`.toUpperCase();
};

const formatDate = (date: Date): string => {
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  
  const day = days[date.getDay()];
  const month = months[date.getMonth()];
  const dayNumber = date.getDate();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  return `${day} ${dayNumber} ${month} • ${hours}:${minutes}`;
};

const getDayOfWeek = (): string => {
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  return days[new Date().getDay()];
};

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerDTO | null>(null);
  const [nextMatch, setNextMatch] = useState<{
    match: MatchDTO;
    opponent: PlayerDTO;
  } | null>(null);
  const [boxMatches, setBoxMatches] = useState<Array<{
    match: MatchDTO;
    opponent: PlayerDTO;
    isCompleted: boolean;
  }>>([]);
  const [waitingList, setWaitingList] = useState<WaitingListEntryDTO[]>([]);
  const [myWaitingEntry, setMyWaitingEntry] = useState<WaitingListEntryDTO | null>(null);
  const [desiredBoxNumber, setDesiredBoxNumber] = useState<string>('');
  const [allPlayers, setAllPlayers] = useState<PlayerDTO[]>([]);

  const loadData = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setLoading(false);
      return;
    }
    
    try {
      if (!refreshing) {
        setLoading(true);
      }
      
      // 1. Trouver le joueur par email
      const players = await api.getPlayers();
      setAllPlayers(players); // Sauvegarder tous les joueurs
      const player = players.find((p) => p.email?.toLowerCase() === user.email.toLowerCase());
      
      if (!player) {
        Alert.alert('Erreur', 'Joueur non trouvé dans la base de données');
        return;
      }
      
      setCurrentPlayer(player);
      
      // Si le joueur n'a pas de membership actif, charger la file d'attente
      if (!player.current_box) {
        const allWaitingList = await api.getWaitingList();
        setWaitingList(allWaitingList.filter((entry) => !entry.processed));
        
        const myEntry = allWaitingList.find((entry) => entry.player_id === player.id && !entry.processed);
        setMyWaitingEntry(myEntry || null);
        
        setLoading(false);
        setRefreshing(false);
        return;
      }
      
      // 2. Récupérer la saison en cours
      const seasons = await api.getSeasons();
      const currentSeason = seasons.find((s) => s.status === 'running') || seasons[0];
      
      if (!currentSeason) return;
      
      // 3. Récupérer les matchs du joueur
      const matches = await api.getMatches(currentSeason.id);
      const playerMatches = matches.filter(
        (m) => m.player_a_id === player.id || m.player_b_id === player.id
      );
      
      // Prochain match (à venir, non joué)
      const upcomingMatches = playerMatches.filter(
        (m) => {
          if (!m.scheduled_at) return false;
          if (new Date(m.scheduled_at) <= new Date()) return false;
          
          // Vérifier si le match a été joué ou a un cas spécial
          const hasScore = (m.score_a !== null && m.score_a !== undefined) || 
                          (m.score_b !== null && m.score_b !== undefined);
          const hasSpecialStatus = m.no_show_player_id || m.retired_player_id || m.delayed_player_id;
          
          return !hasScore && !hasSpecialStatus;
        }
      );
      
      upcomingMatches.sort((a, b) => 
        new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime()
      );
      
      if (upcomingMatches.length > 0) {
        const match = upcomingMatches[0];
        const opponentId = match.player_a_id === player.id ? match.player_b_id : match.player_a_id;
        const opponent = players.find((p) => p.id === opponentId);
        
        if (opponent) {
          setNextMatch({ match, opponent });
        }
      }
      
      // Tous les matchs du box actuel
      if (player.current_box) {
        const currentBoxMatches = matches.filter((m) => m.box_id === player.current_box?.box_id);
        const myBoxMatches = currentBoxMatches
          .filter((m) => m.player_a_id === player.id || m.player_b_id === player.id)
          .map((match) => {
            const opponentId = match.player_a_id === player.id ? match.player_b_id : match.player_a_id;
            const opponent = players.find((p) => p.id === opponentId)!;
            return {
              match,
              opponent,
              isCompleted: match.score_a !== null && match.score_b !== null,
            };
          })
          .sort((a, b) => {
            if (a.isCompleted === b.isCompleted) {
              if (a.match.scheduled_at && b.match.scheduled_at) {
                return new Date(a.match.scheduled_at).getTime() - new Date(b.match.scheduled_at).getTime();
              }
              return 0;
            }
            return a.isCompleted ? 1 : -1;
          });
        
        setBoxMatches(myBoxMatches);
      }
    } catch (error) {
      console.error('Erreur chargement données:', error);
      Alert.alert('Erreur', 'Impossible de charger les données');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, refreshing]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Recharger les données quand on revient sur l'onglet
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    await loadData();
  };

  const handleCall = async (phone: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = `tel:${phone}`;
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
    }
  };

  const handleMessage = async (phone: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = `sms:${phone}`;
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
    }
  };

  const handleViewBox = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(tabs)/box');
  };

  const handleExportToCalendar = async () => {
    if (!currentPlayer || boxMatches.length === 0) {
      Alert.alert('Aucun match', 'Vous n\'avez aucun match à venir à exporter');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Demander la permission d'accès au calendrier
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission refusée', 'L\'accès au calendrier est nécessaire pour exporter vos matchs');
        return;
      }

      // Récupérer le calendrier par défaut
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const defaultCalendar = calendars.find(cal => cal.isPrimary) || calendars[0];

      if (!defaultCalendar) {
        Alert.alert('Erreur', 'Aucun calendrier trouvé sur votre appareil');
        return;
      }

      // Filtrer les matchs à venir (non joués)
      const upcomingMatches = boxMatches.filter(m => !m.isCompleted && m.match.scheduled_at);
      
      if (upcomingMatches.length === 0) {
        Alert.alert('Aucun match', 'Vous n\'avez aucun match à venir à exporter');
        return;
      }

      let exportedCount = 0;

      // Créer un événement pour chaque match
      for (const item of upcomingMatches) {
        const matchDate = new Date(item.match.scheduled_at!);
        const endDate = new Date(matchDate.getTime() + 60 * 60 * 1000); // +1h par défaut

        await Calendar.createEventAsync(defaultCalendar.id, {
          title: `Squash - ${item.opponent.first_name} ${item.opponent.last_name}`,
          startDate: matchDate,
          endDate: endDate,
          notes: `Match de squash contre ${item.opponent.first_name} ${item.opponent.last_name}`,
          alarms: [{ relativeOffset: -60 }], // Rappel 1h avant
        });

        exportedCount++;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Export réussi',
        `${exportedCount} match${exportedCount > 1 ? 's' : ''} exporté${exportedCount > 1 ? 's' : ''} dans votre calendrier`
      );
    } catch (error) {
      console.error('Erreur export calendrier:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erreur', 'Impossible d\'exporter les matchs dans le calendrier');
    }
  };

  // Helper pour obtenir le nom d'un joueur
  const getPlayerName = (playerId: string): string => {
    const player = allPlayers.find((p) => p.id === playerId);
    if (!player) return 'Joueur inconnu';
    return `${player.first_name} ${player.last_name}`;
  };

  const handleJoinWaitingList = async () => {
    if (!currentPlayer) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      const boxNum = desiredBoxNumber ? parseInt(desiredBoxNumber) : null;
      
      const entry = await api.addToWaitingList(currentPlayer.id, boxNum);
      setMyWaitingEntry(entry);
      
      // Recharger la liste complète
      const allWaitingList = await api.getWaitingList();
      setWaitingList(allWaitingList.filter((e) => !e.processed));
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Succès', 'Vous avez rejoint la file d\'attente !');
    } catch (error: any) {
      console.error('Erreur ajout file d\'attente:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erreur', error.message || 'Impossible de rejoindre la file d\'attente');
    }
  };

  const handleLeaveWaitingList = async () => {
    if (!myWaitingEntry) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      await api.removeFromWaitingList(myWaitingEntry.id);
      setMyWaitingEntry(null);
      
      // Recharger la liste complète
      const allWaitingList = await api.getWaitingList();
      setWaitingList(allWaitingList.filter((e) => !e.processed));
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Succès', 'Vous avez quitté la file d\'attente');
    } catch (error: any) {
      console.error('Erreur sortie file d\'attente:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erreur', error.message || 'Impossible de quitter la file d\'attente');
    }
  };

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
            { paddingTop: insets.top + 10, paddingBottom: 60 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Section */}
          <View style={styles.heroSection}>
            <View style={styles.logoContainer}>
              <Image
                source={require('@/favicon-logo-header.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <ThemedText style={styles.heroTitle}>Squash 22</ThemedText>
            <ThemedText style={[styles.heroSubtitle, { color: colors.text + '70' }]}>
              Lundi des box
            </ThemedText>
          </View>

          {/* CTA Principal */}
          <View style={styles.ctaSection}>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: PRIMARY_COLOR }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowAuthModal(true);
              }}
              activeOpacity={0.8}
            >
              <ThemedText style={styles.primaryButtonText}>S'identifier</ThemedText>
              <IconSymbol name="arrow.right.circle.fill" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          {/* Features Grid */}
          <View style={styles.featuresGrid}>
            <View style={[styles.featureCard, { backgroundColor: colors.background }]}>
              <View style={[styles.featureIconContainer, { backgroundColor: PRIMARY_COLOR + '15' }]}>
                <IconSymbol name="calendar.badge.clock" size={28} color={PRIMARY_COLOR} />
              </View>
              <ThemedText style={styles.featureCardTitle}>Matchs réguliers</ThemedText>
              <ThemedText style={[styles.featureCardDescription, { color: colors.text + '70' }]}>
                Compétitions chaque lundi soir
              </ThemedText>
            </View>

            <View style={[styles.featureCard, { backgroundColor: colors.background }]}>
              <View style={[styles.featureIconContainer, { backgroundColor: PRIMARY_COLOR + '15' }]}>
                <IconSymbol name="square.grid.2x2.fill" size={28} color={PRIMARY_COLOR} />
              </View>
              <ThemedText style={styles.featureCardTitle}>Système de Box</ThemedText>
              <ThemedText style={[styles.featureCardDescription, { color: colors.text + '70' }]}>
                Jouez selon votre niveau
              </ThemedText>
            </View>

            <View style={[styles.featureCard, { backgroundColor: colors.background }]}>
              <View style={[styles.featureIconContainer, { backgroundColor: PRIMARY_COLOR + '15' }]}>
                <IconSymbol name="chart.line.uptrend.xyaxis" size={28} color={PRIMARY_COLOR} />
              </View>
              <ThemedText style={styles.featureCardTitle}>Statistiques</ThemedText>
              <ThemedText style={[styles.featureCardDescription, { color: colors.text + '70' }]}>
                Suivez votre progression
              </ThemedText>
            </View>

            <View style={[styles.featureCard, { backgroundColor: colors.background }]}>
              <View style={[styles.featureIconContainer, { backgroundColor: PRIMARY_COLOR + '15' }]}>
                <IconSymbol name="person.3.fill" size={28} color={PRIMARY_COLOR} />
              </View>
              <ThemedText style={styles.featureCardTitle}>Communauté</ThemedText>
              <ThemedText style={[styles.featureCardDescription, { color: colors.text + '70' }]}>
                Rencontrez d'autres joueurs
              </ThemedText>
            </View>
          </View>

          {/* Info Section */}
          <View style={[styles.infoSection, { backgroundColor: colors.background }]}>
            <IconSymbol name="info.circle.fill" size={24} color={PRIMARY_COLOR} />
            <View style={styles.infoContent}>
              <ThemedText style={styles.infoTitle}>Comment ça marche ?</ThemedText>
              <ThemedText style={[styles.infoDescription, { color: colors.text + '70' }]}>
                Inscrivez-vous, rejoignez un box adapté à votre niveau, et participez aux tournois hebdomadaires pour progresser et vous amuser.
              </ThemedText>
            </View>
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  // Vue file d'attente (connecté sans membership)
  if (isAuthenticated && currentPlayer && !currentPlayer.current_box) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: Math.max(insets.top, 20) + 20 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={PRIMARY_COLOR}
              colors={[PRIMARY_COLOR]}
            />
          }
        >
          {/* Header */}
          <View style={styles.welcomeHeader}>
            <ThemedText style={styles.welcomeName}>
              {currentPlayer.first_name} {currentPlayer.last_name}
            </ThemedText>
          </View>

          {/* Message d'information */}
          <View style={[styles.card, { backgroundColor: colors.background }]}>
            <View style={[styles.infoIconContainer, { backgroundColor: PRIMARY_COLOR + '15' }]}>
              <IconSymbol name="info.circle.fill" size={32} color={PRIMARY_COLOR} />
            </View>
            <ThemedText style={styles.waitingTitle}>Aucun box actif</ThemedText>
            <ThemedText style={[styles.waitingDescription, { color: colors.text + '70' }]}>
              Vous n'avez pas de membership actif pour cette saison. Rejoignez la file d'attente pour participer au prochain box !
            </ThemedText>
          </View>

          {/* Formulaire d'inscription à la file */}
          {!myWaitingEntry && (
            <View style={[styles.card, { backgroundColor: colors.background }]}>
              <ThemedText style={styles.cardTitle}>Rejoindre la file d'attente</ThemedText>
              
              <View style={styles.inputGroup}>
                <ThemedText style={[styles.inputLabel, { color: colors.text + '80' }]}>
                  Box souhaité (optionnel)
                </ThemedText>
                <TextInput
                  style={[styles.boxInput, { backgroundColor: colors.text + '05', color: colors.text, borderColor: colors.text + '20' }]}
                  value={desiredBoxNumber}
                  onChangeText={setDesiredBoxNumber}
                  placeholder="Ex: 16"
                  placeholderTextColor={colors.text + '40'}
                  keyboardType="number-pad"
                />
              </View>

              <TouchableOpacity
                style={[styles.joinButton, { backgroundColor: PRIMARY_COLOR }]}
                onPress={handleJoinWaitingList}
                activeOpacity={0.7}
              >
                <IconSymbol name="person.badge.plus" size={20} color="#000" />
                <ThemedText style={styles.joinButtonText}>Rejoindre la file</ThemedText>
              </TouchableOpacity>
            </View>
          )}

          {/* Ma position dans la file */}
          {myWaitingEntry && (
            <View style={[styles.card, { backgroundColor: colors.background }]}>
              <View style={[styles.statusIconContainer, { backgroundColor: '#10b981' + '15' }]}>
                <IconSymbol name="checkmark.circle.fill" size={32} color="#10b981" />
              </View>
              <ThemedText style={styles.waitingTitle}>Vous êtes dans la file !</ThemedText>
              
              <View style={styles.positionInfo}>
                <View style={styles.positionBadge}>
                  <ThemedText style={styles.positionNumber}>
                    #{myWaitingEntry.order_no || '?'}
                  </ThemedText>
                  <ThemedText style={[styles.positionLabel, { color: colors.text + '70' }]}>
                    Position
                  </ThemedText>
                </View>
                
                {myWaitingEntry.target_box_number && (
                  <View style={styles.positionBadge}>
                    <ThemedText style={styles.positionNumber}>
                      Box {myWaitingEntry.target_box_number}
                    </ThemedText>
                    <ThemedText style={[styles.positionLabel, { color: colors.text + '70' }]}>
                      Souhaité
                    </ThemedText>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[styles.leaveButton, { backgroundColor: colors.text + '10' }]}
                onPress={handleLeaveWaitingList}
                activeOpacity={0.7}
              >
                <IconSymbol name="xmark.circle" size={20} color={colors.text + '60'} />
                <ThemedText style={[styles.leaveButtonText, { color: colors.text }]}>
                  Quitter la file
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}

          {/* Liste d'attente complète */}
          <View style={[styles.card, { backgroundColor: colors.background }]}>
            <ThemedText style={styles.cardTitle}>
              File d'attente ({waitingList.length} {waitingList.length > 1 ? 'personnes' : 'personne'})
            </ThemedText>
            
            {waitingList.length === 0 ? (
              <ThemedText style={[styles.emptyText, { color: colors.text + '60' }]}>
                Aucune personne en attente pour le moment
              </ThemedText>
            ) : (
              <View style={styles.waitingListContainer}>
                {waitingList.map((entry, index) => (
                  <View
                    key={entry.id}
                    style={[
                      styles.waitingListItem,
                      { borderBottomColor: colors.text + '10' },
                      index === waitingList.length - 1 && styles.waitingListItemLast,
                      entry.id === myWaitingEntry?.id && { backgroundColor: PRIMARY_COLOR + '08' }
                    ]}
                  >
                    <View style={styles.waitingListLeft}>
                      <ThemedText style={styles.waitingListPosition}>
                        #{entry.order_no || index + 1}
                      </ThemedText>
                      <View style={styles.waitingListInfo}>
                        <ThemedText style={styles.waitingListText}>
                          {entry.id === myWaitingEntry?.id ? 'Vous' : getPlayerName(entry.player_id)}
                        </ThemedText>
                        {entry.target_box_number && (
                          <ThemedText style={[styles.waitingListBox, { color: colors.text + '60' }]}>
                            Box {entry.target_box_number} souhaité
                          </ThemedText>
                        )}
                      </View>
                    </View>
                    <ThemedText style={[styles.waitingListDate, { color: colors.text + '60' }]}>
                      {new Date(entry.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </ThemedText>
                  </View>
                ))}
              </View>
            )}
          </View>

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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={PRIMARY_COLOR}
            colors={[PRIMARY_COLOR]}
          />
        }
      >
        {/* Header d'accueil */}
        {currentPlayer && (
          <View style={styles.welcomeHeader}>
            <View style={styles.welcomeTextContainer}>
              <ThemedText style={styles.welcomeName}>
                {currentPlayer.first_name} {currentPlayer.last_name}
              </ThemedText>
            </View>
            
            {currentPlayer.current_box && (
              <View style={styles.statusRow}>
                <View style={[styles.boxPill, { backgroundColor: PRIMARY_COLOR + '15' }]}>
                  <IconSymbol name="square.grid.2x2.fill" size={12} color={PRIMARY_COLOR} />
                  <ThemedText style={[styles.boxPillText, { color: PRIMARY_COLOR }]}>
                    {currentPlayer.current_box.box_name}
                  </ThemedText>
                </View>
                
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor:
                        currentPlayer.current_box.next_box_status === 'continue'
                          ? '#10b981' + '20'
                          : currentPlayer.current_box.next_box_status === 'stop'
                          ? '#ef4444' + '20'
                          : colors.text + '10',
                    },
                  ]}
                >
                  <IconSymbol
                    name={
                      currentPlayer.current_box.next_box_status === 'continue'
                        ? 'checkmark.circle.fill'
                        : currentPlayer.current_box.next_box_status === 'stop'
                        ? 'xmark.circle.fill'
                        : 'questionmark.circle.fill'
                    }
                    size={12}
                    color={
                      currentPlayer.current_box.next_box_status === 'continue'
                        ? '#10b981'
                        : currentPlayer.current_box.next_box_status === 'stop'
                        ? '#ef4444'
                        : colors.text
                    }
                  />
                  <ThemedText
                    style={[
                      styles.statusPillText,
                      {
                        color:
                          currentPlayer.current_box.next_box_status === 'continue'
                            ? '#10b981'
                            : currentPlayer.current_box.next_box_status === 'stop'
                            ? '#ef4444'
                            : colors.text,
                      },
                    ]}
                  >
                    {currentPlayer.current_box.next_box_status === 'continue'
                      ? 'Réinscrit'
                      : currentPlayer.current_box.next_box_status === 'stop'
                      ? 'Arrêt'
                      : 'Indécis'}
                  </ThemedText>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Prochain match */}
        {nextMatch ? (
          <View style={[styles.card, { backgroundColor: colors.background }]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={[styles.iconContainer, { backgroundColor: PRIMARY_COLOR + '20' }]}>
                  <IconSymbol name="calendar" size={18} color={PRIMARY_COLOR} />
                </View>
                <ThemedText style={styles.cardTitle}>Prochain match</ThemedText>
              </View>
            </View>
            
            <View style={styles.matchContent}>
              <View style={styles.matchOpponent}>
                <View style={[styles.avatar, { backgroundColor: AVATAR_COLOR }]}>
                  <ThemedText style={styles.avatarText}>
                    {getInitials(nextMatch.opponent.first_name, nextMatch.opponent.last_name)}
                  </ThemedText>
                </View>
                <View style={styles.opponentInfo}>
                  <ThemedText style={styles.opponentName}>
                    {nextMatch.opponent.first_name} {nextMatch.opponent.last_name}
                  </ThemedText>
                  <ThemedText style={[styles.dateText, { color: colors.text }]}>
                    {formatDate(new Date(nextMatch.match.scheduled_at!))}
                  </ThemedText>
                </View>
              </View>

              {/* Actions de contact */}
              {nextMatch.opponent.phone && (
                <View style={styles.contactActions}>
                  <TouchableOpacity
                    style={[styles.contactButton, { backgroundColor: colors.text + '08' }]}
                    onPress={() => handleCall(nextMatch.opponent.phone!)}
                    activeOpacity={0.7}
                  >
                    <IconSymbol name="phone.fill" size={14} color={colors.text} />
                    <ThemedText style={[styles.contactButtonText, { color: colors.text }]}>
                      Appeler
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.contactButton, { backgroundColor: colors.text + '08' }]}
                    onPress={() => handleMessage(nextMatch.opponent.phone!)}
                    activeOpacity={0.7}
                  >
                    <IconSymbol name="message.fill" size={14} color={colors.text} />
                    <ThemedText style={[styles.contactButtonText, { color: colors.text }]}>
                      Message
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.background }]}>
            <ThemedText style={styles.noMatch}>Aucun match programmé</ThemedText>
          </View>
        )}

        {/* Mon box */}
        {currentPlayer?.current_box && (
          <View style={[styles.card, { backgroundColor: colors.background }]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={[styles.iconContainer, { backgroundColor: PRIMARY_COLOR + '20' }]}>
                  <IconSymbol name="square.grid.2x2.fill" size={20} color={PRIMARY_COLOR} />
                </View>
                <ThemedText style={styles.cardTitle}>Mes matchs</ThemedText>
              </View>
              <TouchableOpacity onPress={handleViewBox}>
                <View style={styles.cardHeaderRight}>
                  <ThemedText style={[styles.boxNumber, { color: colors.text, opacity: 0.6 }]}>
                    {currentPlayer.current_box.box_name}
                  </ThemedText>
                  <IconSymbol name="chevron.right" size={16} color={colors.text + '40'} />
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.matchesList}>
              {boxMatches.map((item, index) => (
                <View
                  key={item.match.id}
                  style={[
                    styles.matchItem,
                    index !== boxMatches.length - 1 && [
                      styles.matchItemBorder,
                      { borderBottomColor: colors.text + '15' },
                    ],
                  ]}
                >
                  <View style={styles.matchItemLeft}>
                    <View style={[styles.smallAvatar, { backgroundColor: AVATAR_COLOR }]}>
                      <ThemedText style={styles.smallAvatarText}>
                        {getInitials(item.opponent.first_name, item.opponent.last_name)}
                      </ThemedText>
                    </View>
                    <View style={styles.matchItemInfo}>
                      <ThemedText style={styles.matchOpponentName}>
                        {item.opponent.first_name} {item.opponent.last_name}
                      </ThemedText>
                      <ThemedText style={[styles.matchDate, { color: colors.text, opacity: 0.5 }]}>
                        {item.match.scheduled_at ? formatDate(new Date(item.match.scheduled_at)) : 'Date non définie'}
                      </ThemedText>
                    </View>
                  </View>
                  <View style={styles.matchItemRight}>
                    {item.isCompleted ? (
                      (() => {
                        const isPlayerA = item.match.player_a_id === currentPlayer.id;
                        const playerScore = isPlayerA ? item.match.score_a! : item.match.score_b!;
                        const opponentScore = isPlayerA ? item.match.score_b! : item.match.score_a!;
                        const isWin = playerScore > opponentScore;
                        const specialStatus = getMatchSpecialStatus(item.match, currentPlayer.id, isWin);
                        const scoreText = formatMatchScore(item.match, currentPlayer.id, playerScore, opponentScore);

                        return (
                          <View
                            style={[
                              styles.scoreTag,
                              { backgroundColor: specialStatus.backgroundColor },
                            ]}
                          >
                            <ThemedText
                              style={[
                                styles.scoreTagText,
                                { color: specialStatus.textColor },
                              ]}
                            >
                              {scoreText}
                            </ThemedText>
                          </View>
                        );
                      })()
                    ) : (
                      <View style={[styles.pendingTag, { backgroundColor: colors.text + '10' }]}>
                        <ThemedText style={[styles.pendingTagText, { color: colors.text, opacity: 0.6 }]}>
                          À venir
                        </ThemedText>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
            
            {/* Bouton export calendrier */}
            {boxMatches.some(m => !m.isCompleted && m.match.scheduled_at) && (
              <TouchableOpacity
                style={[styles.exportButton, { backgroundColor: colors.text + '05', borderColor: colors.text + '20' }]}
                onPress={handleExportToCalendar}
                activeOpacity={0.7}
              >
                <IconSymbol name="calendar.badge.plus" size={18} color={PRIMARY_COLOR} />
                <ThemedText style={[styles.exportButtonText, { color: colors.text }]}>
                  Exporter dans le calendrier
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
        )}

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
  welcomeHeader: {
    marginBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  welcomeTextContainer: {
    flex: 1,
  },
  welcomeName: {
    fontSize: 24,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  boxPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  boxPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  boxNumber: {
    fontSize: 15,
    fontWeight: '500',
    marginRight: 8,
  },
  matchContent: {
    gap: 12,
  },
  matchOpponent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  opponentInfo: {
    flex: 1,
  },
  opponentName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '500',
  },
  contactActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  contactButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  contactButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  noMatch: {
    fontSize: 15,
    textAlign: 'center',
    opacity: 0.6,
  },
  matchesList: {
    gap: 0,
  },
  matchItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  matchItemBorder: {
    borderBottomWidth: 1,
  },
  matchItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  smallAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  smallAvatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  matchItemInfo: {
    flex: 1,
  },
  matchOpponentName: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  matchDate: {
    fontSize: 12,
    fontWeight: '400',
  },
  matchItemRight: {
    marginLeft: 8,
  },
  scoreTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  scoreTagText: {
    fontSize: 13,
    fontWeight: '600',
  },
  pendingTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pendingTagText: {
    fontSize: 12,
    fontWeight: '500',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
  },
  exportButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  // Styles pour la vue publique - Design moderne
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  logoContainer: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#000',
    letterSpacing: -1,
  },
  heroTitle: {
    fontSize: 25,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: 0,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  ctaSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 36,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 0.3,
  },
  ctaSubtext: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 32,
  },
  featureCard: {
    width: '47%',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  featureIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  featureCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  featureCardDescription: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 18,
  },
  infoSection: {
    flexDirection: 'row',
    padding: 20,
    borderRadius: 16,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  infoDescription: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  // Styles pour la vue file d'attente
  infoIconContainer: {
    alignSelf: 'center',
    marginBottom: 16,
  },
  statusIconContainer: {
    alignSelf: 'center',
    marginBottom: 16,
  },
  waitingTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  waitingDescription: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  boxInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 6,
  },
  inputHelper: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  joinButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  positionInfo: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginVertical: 20,
  },
  positionBadge: {
    alignItems: 'center',
  },
  positionNumber: {
    fontSize: 25,
    fontWeight: '800',
    marginBottom: 4,
  },
  positionLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  leaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  leaveButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  waitingListContainer: {
    marginTop: 12,
  },
  waitingListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderRadius: 8,
  },
  waitingListItemLast: {
    borderBottomWidth: 0,
  },
  waitingListLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  waitingListPosition: {
    fontSize: 16,
    fontWeight: '700',
    minWidth: 32,
  },
  waitingListInfo: {
    flex: 1,
  },
  waitingListText: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  waitingListBox: {
    fontSize: 13,
    fontWeight: '500',
  },
  waitingListDate: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
});

