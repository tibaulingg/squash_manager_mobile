import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  unlocked: boolean;
  progress?: number;
  maxProgress?: number;
  group?: string; // Groupe d'achievements (ex: 'wins', 'matches', 'streak', etc.)
  tier?: number; // Niveau dans le groupe (1, 2, 3, etc.)
}

export interface AchievementGroup {
  id: string;
  name: string;
  icon: string;
  achievements: Achievement[];
  displayAchievement: Achievement; // Achievement à afficher dans la grille
}

interface AchievementsProps {
  stats: {
    wins: number;
    losses: number;
    winRate: number;
    totalMatches: number;
    bestStreak: number;
    currentStreak: number;
    totalPoints: number;
    rankingPosition: number;
  };
  hasPicture?: boolean;
}

export function Achievements({ stats, hasPicture = false }: AchievementsProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);

  // Calculer tous les achievements avec groupes
  const allAchievements: Achievement[] = [
    // Première victoire (standalone)
    {
      id: 'first_win',
      name: 'Première victoire',
      description: 'Gagnez votre premier match',
      icon: 'star.fill',
      color: '#fbbf24',
      unlocked: stats.wins >= 1,
    },
    // Meilleure winstreak (standalone)
    {
      id: 'best_winstreak',
      name: 'Meilleure série',
      description: `Meilleure série de victoires : ${stats.bestStreak}`,
      icon: 'flame.fill',
      color: '#ff6b35',
      unlocked: stats.bestStreak > 0,
      progress: stats.bestStreak,
      maxProgress: Math.max(stats.bestStreak, 10), // Afficher la progression jusqu'à la meilleure série ou 10 minimum
    },
    // Upload de photo (oneshot)
    {
      id: 'profile_picture',
      name: 'Photogénique',
      description: 'Ajoutez une photo à votre profil',
      icon: 'camera.fill',
      color: '#ffd700',
      unlocked: hasPicture,
    },
    // Victoires (groupe) - Bronze, Argent, Or, Diamant
    {
      id: 'wins_10',
      name: 'Débutant',
      description: 'Gagnez 10 matchs',
      icon: 'trophy.fill',
      color: '#cd7f32', // Bronze
      unlocked: stats.wins >= 10,
      progress: stats.wins,
      maxProgress: 10,
      group: 'wins',
      tier: 1,
    },
    {
      id: 'wins_25',
      name: 'Vétéran',
      description: 'Gagnez 25 matchs',
      icon: 'trophy.fill',
      color: '#c0c0c0', // Argent
      unlocked: stats.wins >= 25,
      progress: stats.wins,
      maxProgress: 25,
      group: 'wins',
      tier: 2,
    },
    {
      id: 'wins_50',
      name: 'Champion',
      description: 'Gagnez 50 matchs',
      icon: 'trophy.fill',
      color: '#ffd700', // Or
      unlocked: stats.wins >= 50,
      progress: stats.wins,
      maxProgress: 50,
      group: 'wins',
      tier: 3,
    },
    {
      id: 'wins_100',
      name: 'Légende',
      description: 'Gagnez 100 matchs',
      icon: 'trophy.fill',
      color: '#b19cd9', // Diamant (mauve)
      unlocked: stats.wins >= 100,
      progress: stats.wins,
      maxProgress: 100,
      group: 'wins',
      tier: 4,
    },
    // Matchs joués (groupe) - Bronze, Argent, Or, Diamant
    {
      id: 'matches_10',
      name: 'Actif',
      description: 'Jouez 10 matchs',
      icon: 'figure.squash',
      color: '#cd7f32', // Bronze
      unlocked: stats.totalMatches >= 10,
      progress: stats.totalMatches,
      maxProgress: 10,
      group: 'matches',
      tier: 1,
    },
    {
      id: 'matches_25',
      name: 'Passionné',
      description: 'Jouez 25 matchs',
      icon: 'figure.squash',
      color: '#c0c0c0', // Argent
      unlocked: stats.totalMatches >= 25,
      progress: stats.totalMatches,
      maxProgress: 25,
      group: 'matches',
      tier: 2,
    },
    {
      id: 'matches_50',
      name: 'Dévoué',
      description: 'Jouez 50 matchs',
      icon: 'figure.squash',
      color: '#ffd700', // Or
      unlocked: stats.totalMatches >= 50,
      progress: stats.totalMatches,
      maxProgress: 50,
      group: 'matches',
      tier: 3,
    },
    {
      id: 'matches_100',
      name: 'Expert',
      description: 'Jouez 100 matchs',
      icon: 'figure.squash',
      color: '#b19cd9', // Diamant (mauve)
      unlocked: stats.totalMatches >= 100,
      progress: stats.totalMatches,
      maxProgress: 100,
      group: 'matches',
      tier: 4,
    },
    // Série de victoires (groupe) - Bronze, Argent, Or, Diamant
    {
      id: 'streak_3',
      name: 'En feu',
      description: '3 victoires consécutives',
      icon: 'flame.fill',
      color: '#cd7f32', // Bronze
      unlocked: stats.bestStreak >= 3,
      progress: stats.bestStreak,
      maxProgress: 3,
      group: 'streak',
      tier: 1,
    },
    {
      id: 'streak_5',
      name: 'Invincible',
      description: '5 victoires consécutives',
      icon: 'flame.fill',
      color: '#c0c0c0', // Argent
      unlocked: stats.bestStreak >= 5,
      progress: stats.bestStreak,
      maxProgress: 5,
      group: 'streak',
      tier: 2,
    },
    {
      id: 'streak_7',
      name: 'Légendaire',
      description: '7 victoires consécutives',
      icon: 'flame.fill',
      color: '#ffd700', // Or
      unlocked: stats.bestStreak >= 7,
      progress: stats.bestStreak,
      maxProgress: 7,
      group: 'streak',
      tier: 3,
    },
    {
      id: 'streak_10',
      name: 'Immortel',
      description: '10 victoires consécutives',
      icon: 'flame.fill',
      color: '#b19cd9', // Diamant (mauve)
      unlocked: stats.bestStreak >= 10,
      progress: stats.bestStreak,
      maxProgress: 10,
      group: 'streak',
      tier: 4,
    },
    // Taux de victoire (groupe) - Bronze, Argent, Or, Diamant
    {
      id: 'winrate_50',
      name: 'Équilibré',
      description: '50% de taux de victoire (min 10 matchs)',
      icon: 'chart.bar.fill',
      color: '#cd7f32', // Bronze
      unlocked: stats.totalMatches >= 10 && stats.winRate >= 50,
      group: 'winrate',
      tier: 1,
    },
    {
      id: 'winrate_55',
      name: 'Compétent',
      description: '55% de taux de victoire (min 15 matchs)',
      icon: 'chart.bar.fill',
      color: '#c0c0c0', // Argent
      unlocked: stats.totalMatches >= 15 && stats.winRate >= 55,
      group: 'winrate',
      tier: 2,
    },
    {
      id: 'winrate_60',
      name: 'Élite',
      description: '60% de taux de victoire (min 20 matchs)',
      icon: 'chart.bar.fill',
      color: '#ffd700', // Or
      unlocked: stats.totalMatches >= 20 && stats.winRate >= 60,
      group: 'winrate',
      tier: 3,
    },
    {
      id: 'winrate_70',
      name: 'Maître',
      description: '70% de taux de victoire (min 30 matchs)',
      icon: 'chart.bar.fill',
      color: '#b19cd9', // Diamant (mauve)
      unlocked: stats.totalMatches >= 30 && stats.winRate >= 70,
      group: 'winrate',
      tier: 4,
    },
    // Points (groupe) - Bronze, Argent, Or, Diamant
    {
      id: 'points_50',
      name: 'Scorer',
      description: 'Accumulez 50 points',
      icon: 'star.circle.fill',
      color: '#cd7f32', // Bronze
      unlocked: stats.totalPoints >= 50,
      progress: stats.totalPoints,
      maxProgress: 50,
      group: 'points',
      tier: 1,
    },
    {
      id: 'points_150',
      name: 'Point Master',
      description: 'Accumulez 150 points',
      icon: 'star.circle.fill',
      color: '#c0c0c0', // Argent
      unlocked: stats.totalPoints >= 150,
      progress: stats.totalPoints,
      maxProgress: 150,
      group: 'points',
      tier: 2,
    },
    {
      id: 'points_300',
      name: 'Point Legend',
      description: 'Accumulez 300 points',
      icon: 'star.circle.fill',
      color: '#ffd700', // Or
      unlocked: stats.totalPoints >= 300,
      progress: stats.totalPoints,
      maxProgress: 300,
      group: 'points',
      tier: 3,
    },
    {
      id: 'points_500',
      name: 'Point God',
      description: 'Accumulez 500 points',
      icon: 'star.circle.fill',
      color: '#b19cd9', // Diamant (mauve)
      unlocked: stats.totalPoints >= 500,
      progress: stats.totalPoints,
      maxProgress: 500,
      group: 'points',
      tier: 4,
    },
  ];

  // Grouper les achievements
  const groupedAchievements = new Map<string, Achievement[]>();
  const standaloneAchievements: Achievement[] = [];

  allAchievements.forEach((achievement) => {
    if (achievement.group) {
      if (!groupedAchievements.has(achievement.group)) {
        groupedAchievements.set(achievement.group, []);
      }
      groupedAchievements.get(achievement.group)!.push(achievement);
    } else {
      standaloneAchievements.push(achievement);
    }
  });

   // Créer les groupes avec l'achievement à afficher (le plus haut débloqué ou le prochain)
   const achievementGroups: AchievementGroup[] = Array.from(groupedAchievements.entries()).map(([groupId, achievements]) => {
     const sorted = achievements.sort((a, b) => (a.tier || 0) - (b.tier || 0));
     const highestUnlocked = sorted.filter(a => a.unlocked).pop();
     const nextToUnlock = sorted.find(a => !a.unlocked);
     
     return {
       id: groupId,
       name: groupId === 'wins' ? 'Victoires' : 
             groupId === 'matches' ? 'Matchs joués' :
             groupId === 'streak' ? 'Séries de victoires' :
             groupId === 'winrate' ? 'Taux de victoire' :
             groupId === 'points' ? 'Points' :
             groupId === 'ranking' ? 'Classement' : groupId,
       icon: sorted[0].icon,
       achievements: sorted, // Garder les couleurs individuelles de chaque palier
       displayAchievement: highestUnlocked || nextToUnlock || sorted[0],
     };
   });

  // Combiner les groupes et les achievements standalone
  const achievements: (Achievement | AchievementGroup)[] = [
    ...standaloneAchievements,
    ...achievementGroups,
  ];

  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const totalCount = achievements.length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconContainer, { backgroundColor: PRIMARY_COLOR + '20' }]}>
            <IconSymbol name="trophy.fill" size={18} color={PRIMARY_COLOR} />
          </View>
          <ThemedText style={styles.title}>Succès</ThemedText>
        </View>
        <ThemedText style={[styles.progress, { color: colors.text, opacity: 0.6 }]}>
          {unlockedCount}/{totalCount}
        </ThemedText>
      </View>

      <View style={styles.achievementsGrid}>
        {achievements.map((item) => {
          const isGroup = 'achievements' in item;
          const achievement = isGroup ? item.displayAchievement : item;
          const hasMultipleTiers = isGroup && item.achievements.length > 1;
          
          return (
            <TouchableOpacity
              key={isGroup ? item.id : achievement.id}
              style={[
                styles.achievementCard,
                {
                  backgroundColor: achievement.unlocked
                    ? achievement.color + '15'
                    : colors.background,
                  borderColor: achievement.unlocked
                    ? achievement.color + '40'
                    : colors.text + '15',
                },
              ]}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                // Si c'est un groupe, on passe l'achievement d'affichage mais on stocke le groupe
                setSelectedAchievement({ ...achievement, _group: isGroup ? item : undefined } as any);
              }}
            >
              <View
                style={[
                  styles.achievementIconContainer,
                  {
                    backgroundColor: achievement.unlocked
                      ? achievement.color + '20'
                      : colors.text + '08',
                  },
                ]}
              >
                <IconSymbol
                  name={achievement.icon as any}
                  size={24}
                  color={achievement.unlocked ? achievement.color : colors.text + '40'}
                />
              </View>
              <ThemedText
                style={[
                  styles.achievementName,
                  {
                    color: achievement.unlocked ? colors.text : colors.text + '50',
                    fontWeight: achievement.unlocked ? '600' : '500',
                  },
                ]}
              >
                {achievement.name}
              </ThemedText>
               {hasMultipleTiers ? (
                 <View style={styles.tierProgressBar}>
                   {item.achievements.map((tier, tierIndex) => (
                     <View
                       key={tier.id}
                       style={[
                         styles.tierProgressSegment,
                         {
                           backgroundColor: tier.unlocked
                             ? achievement.color
                             : colors.text + '15',
                           marginRight: tierIndex < item.achievements.length - 1 ? 2 : 0,
                         },
                       ]}
                     />
                   ))}
                 </View>
               ) : achievement.progress !== undefined && achievement.maxProgress !== undefined ? (
                 <>
                   <View style={styles.progressBar}>
                     <View
                       style={[
                         styles.progressFill,
                         {
                           width: `${Math.min((achievement.progress / achievement.maxProgress) * 100, 100)}%`,
                           backgroundColor: achievement.unlocked
                             ? achievement.color
                             : colors.text + '20',
                         },
                       ]}
                     />
                   </View>
                   {!achievement.unlocked && (
                     <ThemedText style={[styles.progressText, { color: colors.text + '50' }]}>
                       {achievement.progress}/{achievement.maxProgress}
                     </ThemedText>
                   )}
                 </>
               ) : null}
              {!achievement.unlocked && achievement.progress !== undefined && achievement.maxProgress !== undefined && (
                <ThemedText style={[styles.progressText, { color: colors.text + '50' }]}>
                  {achievement.progress}/{achievement.maxProgress}
                </ThemedText>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Modal de détail d'achievement */}
      <Modal
        visible={selectedAchievement !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedAchievement(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedAchievement(null)}
        >
          <View
            style={[styles.modalContent, { backgroundColor: colors.background, borderColor: colors.text + '20' }]}
            onStartShouldSetResponder={() => true}
          >
            {selectedAchievement && (
              <>
                 <View style={styles.modalHeader}>
                   <View style={styles.modalHeaderLeft}>
                     <View
                       style={[
                         styles.modalIconContainer,
                         {
                           backgroundColor: selectedAchievement.unlocked
                             ? selectedAchievement.color + '20'
                             : colors.text + '08',
                         },
                       ]}
                     >
                       <IconSymbol
                         name={selectedAchievement.icon as any}
                         size={32}
                         color={selectedAchievement.unlocked ? selectedAchievement.color : colors.text + '40'}
                       />
                     </View>
                     <ThemedText style={[styles.modalTitle, { color: colors.text }]}>
                       {(() => {
                         const group = (selectedAchievement as any)._group;
                         return group ? group.name : selectedAchievement.name;
                       })()}
                     </ThemedText>
                   </View>
                   <TouchableOpacity
                     style={styles.modalCloseButton}
                     onPress={() => setSelectedAchievement(null)}
                     activeOpacity={0.7}
                   >
                     <IconSymbol name="xmark.circle.fill" size={24} color={colors.text + '60'} />
                   </TouchableOpacity>
                 </View>

                 <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                   {(() => {
                     const group = (selectedAchievement as any)._group;
                     const achievementsToShow = group ? group.achievements : [selectedAchievement];
                     // Afficher les niveaux de façon croissante (du niveau 1 au niveau 3)
                     
                     return (
                       <>

                         {achievementsToShow.map((achievement, index) => {
                           const isUnlocked = achievement.unlocked;
                           
                           // Trouver le premier palier non débloqué avec progression (le palier en cours)
                           const currentTierIndex = achievementsToShow.findIndex(a => 
                             !a.unlocked && 
                             a.progress !== undefined && 
                             a.maxProgress !== undefined && 
                             a.progress > 0
                           );
                           
                           // Identifier le palier en cours (non débloqué mais avec progression)
                           const isInProgress = !isUnlocked && 
                             achievement.progress !== undefined && 
                             achievement.maxProgress !== undefined && 
                             achievement.progress > 0 &&
                             index === currentTierIndex;
                           
                           // Identifier les paliers futurs (après le palier en cours)
                           const isFutureTier = !isUnlocked && 
                             currentTierIndex !== -1 && 
                             index > currentTierIndex;
                           
                           // Utiliser la couleur du palier, plus visible si en cours
                           const tierColor = isUnlocked 
                             ? achievement.color 
                             : isInProgress 
                               ? achievement.color // Couleur complète pour le palier en cours
                               : colors.text + '25'; // Grisé pour les paliers futurs
                           
                           return (
                             <View
                               key={achievement.id}
                               style={[
                                 styles.tierCard,
                                 {
                                   backgroundColor: isUnlocked
                                     ? achievement.color + '15'
                                     : isInProgress
                                       ? achievement.color + '08' // Fond légèrement coloré pour le palier en cours
                                       : colors.text + '02', // Grisé pour les paliers futurs
                                   borderColor: isUnlocked
                                     ? achievement.color + '40'
                                     : isInProgress
                                       ? achievement.color + '30' // Bordure plus visible pour le palier en cours
                                       : colors.text + '12', // Grisé pour les paliers futurs
                                   borderWidth: isUnlocked ? 1.5 : isInProgress ? 1.5 : 1,
                                   borderStyle: isUnlocked ? 'solid' : isInProgress ? 'solid' : 'dashed',
                                   opacity: isUnlocked ? 1 : isInProgress ? 0.75 : 0.45, // Plus visible si en cours, grisé pour les futurs
                                 },
                                 index !== achievementsToShow.length - 1 && { marginBottom: 12 },
                               ]}
                             >
                               <View style={styles.tierHeader}>
                                 <View style={styles.tierHeaderLeft}>
                                   {isUnlocked ? (
                                     <IconSymbol name="checkmark.circle.fill" size={16} color={achievement.color} />
                                   ) : isInProgress ? (
                                     <View style={[styles.inProgressIcon, { backgroundColor: achievement.color + '15' }]}>
                                       <IconSymbol name="clock.fill" size={14} color={achievement.color} />
                                     </View>
                                   ) : (
                                     <View style={[styles.lockedIcon, { backgroundColor: colors.text + '08' }]}>
                                       <IconSymbol name="lock.fill" size={12} color={colors.text + '30'} />
                                     </View>
                                   )}
                                   <ThemedText
                                     style={[
                                       styles.tierName,
                                       {
                                         color: isUnlocked
                                           ? colors.text
                                           : isInProgress
                                             ? colors.text // Texte normal si en cours
                                             : colors.text + '35', // Grisé pour les paliers futurs
                                         fontWeight: isUnlocked ? '600' : isInProgress ? '600' : '400',
                                       },
                                     ]}
                                   >
                                     {achievement.name}
                                   </ThemedText>
                                 </View>
                                 {achievement.tier && (
                                   <View
                                     style={[
                                       styles.tierBadge,
                                       {
                                         backgroundColor: isUnlocked
                                           ? achievement.color + '15'
                                           : isInProgress
                                             ? achievement.color + '10' // Fond légèrement coloré pour le palier en cours
                                             : colors.text + '03', // Grisé pour les paliers futurs
                                         borderColor: isUnlocked
                                           ? achievement.color + '30'
                                           : isInProgress
                                             ? achievement.color + '25' // Bordure plus visible pour le palier en cours
                                             : colors.text + '15', // Grisé pour les paliers futurs
                                         borderWidth: isUnlocked ? 1.5 : isInProgress ? 1.5 : 1,
                                         borderStyle: isUnlocked ? 'solid' : isInProgress ? 'solid' : 'dashed',
                                       },
                                     ]}
                                   >
                                     <ThemedText
                                       style={[
                                         styles.tierBadgeText,
                                         {
                                           color: tierColor,
                                           fontWeight: isUnlocked ? '600' : isInProgress ? '600' : '400',
                                         },
                                       ]}
                                     >
                                       {achievement.tier === 1 ? 'Bronze' :
                                        achievement.tier === 2 ? 'Argent' :
                                        achievement.tier === 3 ? 'Or' :
                                        achievement.tier === 4 ? 'Diamant' : `Niveau ${achievement.tier}`}
                                     </ThemedText>
                                   </View>
                                 )}
                               </View>
                             <ThemedText style={[styles.tierDescription, { color: isUnlocked ? colors.text + '70' : isInProgress ? colors.text + '70' : colors.text + '40' }]}>
                               {achievement.description}
                             </ThemedText>

                             {isUnlocked ? (
                               <View style={[styles.unlockedBadge, { backgroundColor: achievement.color + '15', borderColor: achievement.color + '30', borderWidth: 1 }]}>
                                 <IconSymbol name="checkmark.circle.fill" size={14} color={achievement.color} />
                                 <ThemedText
                                   style={[styles.unlockedText, { color: achievement.color, fontSize: 13 }]}
                                 >
                                   Débloqué
                                 </ThemedText>
                               </View>
                             ) : achievement.progress !== undefined && achievement.maxProgress !== undefined ? (
                               <View style={styles.modalProgressContainer}>
                                 <View style={styles.modalProgressHeader}>
                                   <ThemedText style={[styles.modalProgressLabel, { color: colors.text }]}>
                                     Progression
                                   </ThemedText>
                                   <ThemedText
                                     style={[
                                       styles.modalProgressValue,
                                       {
                                         color: isInProgress ? achievement.color : tierColor, // Couleur du palier si en cours
                                         fontWeight: isUnlocked ? '600' : isInProgress ? '700' : '400',
                                       },
                                     ]}
                                   >
                                     {Math.min(achievement.progress, achievement.maxProgress)} / {achievement.maxProgress}
                                   </ThemedText>
                                 </View>
                                 <View style={[styles.modalProgressBar, { backgroundColor: colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)' }]}>
                                   <View
                                     style={[
                                       styles.modalProgressFill,
                                       {
                                         width: `${Math.min((achievement.progress / achievement.maxProgress) * 100, 100)}%`,
                                         backgroundColor: isInProgress ? achievement.color : tierColor, // Utiliser la couleur complète si en cours
                                         opacity: isUnlocked ? 0.8 : isInProgress ? 1 : 0.2, // Opacité maximale si en cours
                                       },
                                     ]}
                                   />
                                 </View>
                               </View>
                             ) : null}

                          </View>
                         );
                         })}
                      </>
                    );
                  })()}
                </ScrollView>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  progress: {
    fontSize: 14,
    fontWeight: '600',
  },
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  achievementCard: {
    width: '47%',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: 8,
  },
  achievementIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  achievementName: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 16,
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: 'transparent',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 15,
  },
   modalHeader: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
     marginBottom: 12,
   },
   modalHeaderLeft: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 12,
     flex: 1,
   },
   modalIconContainer: {
     width: 48,
     height: 48,
     borderRadius: 24,
     alignItems: 'center',
     justifyContent: 'center',
   },
  modalCloseButton: {
    padding: 4,
  },
   modalBody: {
     gap: 12,
     maxHeight: 600,
   },
   tierCard: {
     padding: 12,
     borderRadius: 12,
     borderWidth: 1.5,
     gap: 8,
   },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tierHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  tierName: {
    fontSize: 18,
    fontWeight: '700',
  },
  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tierBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tierDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  tierIndicator: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: -4,
  },
  tierCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 8,
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tierHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  tierName: {
    fontSize: 16,
    fontWeight: '700',
  },
  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tierBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tierDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
   tierIndicator: {
     fontSize: 11,
     fontWeight: '500',
     marginTop: -4,
   },
   currentTierIndicator: {
     width: 8,
     height: 8,
     borderRadius: 4,
   },
   lockedIcon: {
     width: 20,
     height: 20,
     borderRadius: 10,
     alignItems: 'center',
     justifyContent: 'center',
   },
   inProgressIcon: {
     width: 20,
     height: 20,
     borderRadius: 10,
     alignItems: 'center',
     justifyContent: 'center',
   },
   tierProgressBar: {
     width: '100%',
     height: 4,
     flexDirection: 'row',
     marginTop: 4,
   },
   tierProgressSegment: {
     flex: 1,
     height: '100%',
     borderRadius: 2,
   },
   modalTitle: {
     fontSize: 20,
     fontWeight: '700',
     flex: 1,
   },
   modalDescription: {
     fontSize: 16,
     textAlign: 'center',
     lineHeight: 22,
   },
   modalProgressContainer: {
     gap: 8,
     marginTop: 4,
   },
  modalProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalProgressLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalProgressValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalProgressBar: {
    width: '100%',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  modalProgressFill: {
    height: '100%',
    borderRadius: 5,
  },
  modalProgressPercentage: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
   unlockedBadge: {
     flexDirection: 'row',
     alignItems: 'center',
     justifyContent: 'center',
     gap: 6,
     paddingVertical: 6,
     paddingHorizontal: 12,
     borderRadius: 8,
     marginTop: 4,
     alignSelf: 'flex-start',
   },
   unlockedText: {
     fontSize: 13,
     fontWeight: '600',
   },
});
