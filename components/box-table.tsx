import { Image, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { MatchDTO } from '@/types/api';
import { formatMatchScore, getMatchSpecialStatus, getShortMatchLabel } from '@/utils/match-helpers';

interface Match {
  score?: { player1: number; player2: number };
  scheduledDate?: Date;
  matchData?: MatchDTO; // Données complètes pour les cas spéciaux
}

interface Player {
  id: string; // GUID
  firstName: string;
  lastName: string;
  pictureUrl?: string | null;
  nextBoxStatus?: string | null; // 'continue' pour réinscrit, 'stop' pour arrêt
}

interface BoxTableProps {
  players: Player[];
  matches: { [key: string]: Match };
  onPlayerPress?: (playerId: string) => void;
}

// Calculer les points : 2 points par set gagné
const calculatePoints = (score: { player1: number; player2: number }): number => {
  const { player1 } = score;
  return player1 * 2;
};

// Calculer le total pour un joueur
const calculateTotal = (playerIndex: number, players: Player[], matches: { [key: string]: Match }): number => {
  let total = 0;
  
  for (let i = 0; i < players.length; i++) {
    if (i === playerIndex) continue;
    
    const key1 = `${playerIndex}-${i}`;
    const key2 = `${i}-${playerIndex}`;
    
    const match = matches[key1] || matches[key2];
    
    if (match?.score) {
      // Déterminer qui est player1 dans le match
      if (matches[key1]) {
        // playerIndex est player1
        total += calculatePoints(match.score);
      } else {
        // playerIndex est player2, inverser le score
        total += calculatePoints({ player1: match.score.player2, player2: match.score.player1 });
      }
    }
  }
  
  return total;
};

// Obtenir les initiales d'un joueur
const getInitials = (firstName: string, lastName: string): string => {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
};

// Couleurs d'avatar adaptées au thème - sobres et professionnelles
const getAvatarColors = (colorScheme: 'light' | 'dark', index?: number) => {
  if (colorScheme === 'dark') {
    return {
      backgroundColor: '#4B5563', // Gris moyen pour dark
      textColor: '#F3F4F6', // Gris très clair pour le texte
    };
  }
  return {
    backgroundColor: '#E5E7EB', // Gris très clair pour light
    textColor: '#374151', // Gris foncé pour le texte
  };
};

// Formater la date sur deux lignes
const formatDate = (date: Date): string => {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${day}/${month}\n${hours}:${minutes}`;
};

export function BoxTable({ players, matches, onPlayerPress }: BoxTableProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { width } = useWindowDimensions();
  
  // Couleurs de bordure adaptées au thème
  const borderColor = colorScheme === 'dark' ? colors.text + '15' : '#FAFAFA';
  const totalBorderColor = colorScheme === 'dark' ? colors.text + '30' : '#F0F0F0';
  
  // Trier les joueurs par score total décroissant
  const playersWithScores = players.map((player, index) => ({
    player,
    index,
    total: calculateTotal(index, players, matches),
  }));
  
  playersWithScores.sort((a, b) => b.total - a.total);
  
  // Créer un mapping des nouveaux indices après tri
  const sortedIndices = playersWithScores.map(p => p.index);
  const indexMapping = new Map<number, number>();
  sortedIndices.forEach((oldIndex, newIndex) => {
    indexMapping.set(oldIndex, newIndex);
  });
  
  // Reconstruire les matches avec les nouveaux indices
  const sortedMatches: { [key: string]: Match } = {};
  Object.keys(matches).forEach(key => {
    const [oldIndex1, oldIndex2] = key.split('-').map(Number);
    const newIndex1 = indexMapping.get(oldIndex1);
    const newIndex2 = indexMapping.get(oldIndex2);
    if (newIndex1 !== undefined && newIndex2 !== undefined) {
      sortedMatches[`${newIndex1}-${newIndex2}`] = matches[key];
    }
  });
  
  const sortedPlayers = playersWithScores.map(p => p.player);
  
  // Calculer la largeur disponible pour le tableau (écran - padding)
  const screenPadding = 32;
  const availableWidth = width - screenPadding;
  
  // Calculer la largeur des cellules (6 joueurs + 1 colonne nom + 1 colonne total = 8 colonnes)
  const numColumns = sortedPlayers.length + 2; // joueurs + nom + total
  const firstColumnWidth = 90;
  const totalColumnWidth = 50;
  const playerColumnWidth = Math.floor((availableWidth - firstColumnWidth - totalColumnWidth) / sortedPlayers.length);

  const getMatchResult = (player1Index: number, player2Index: number): { 
    text: string; 
    isWin: boolean | null; 
    isScheduled: boolean;
    backgroundColor: string;
    textColor: string;
    matchData?: MatchDTO;
  } => {
    const key = `${player1Index}-${player2Index}`;
    const reverseKey = `${player2Index}-${player1Index}`;
    const match = sortedMatches[key] || sortedMatches[reverseKey];
    
    if (!match) return { 
      text: '-', 
      isWin: null, 
      isScheduled: false,
      backgroundColor: '#000000',
      textColor: '#ffffff',
    };
    
    // Cas spécial sans score (remise, blessure, absence)
    if (match.matchData && !match.score) {
      let playerId: string;
      
      if (sortedMatches[key]) {
        playerId = sortedPlayers[player1Index].id;
      } else {
        playerId = sortedPlayers[player1Index].id;
      }
      
      const shortLabel = getShortMatchLabel(match.matchData, playerId);
      
      if (shortLabel) {
        // Déterminer si c'est en faveur du joueur ou de l'adversaire
        const isFavorable = shortLabel.includes('.Adv') || 
                           (!shortLabel.includes('.Adv') && 
                            (match.matchData.no_show_player_id !== playerId ||
                             match.matchData.retired_player_id !== playerId));
        
        const specialStatus = getMatchSpecialStatus(match.matchData, playerId, isFavorable);
        
        return {
          text: shortLabel,
          isWin: isFavorable,
          isScheduled: false,
          backgroundColor: specialStatus.backgroundColor,
          textColor: specialStatus.textColor,
          matchData: match.matchData,
        };
      }
    }
    
    // Match avec score
    if (match.score && match.matchData) {
      let score1: number, score2: number;
      let playerId: string;
      
      if (sortedMatches[key]) {
        // player1Index est le premier joueur
        score1 = match.score.player1;
        score2 = match.score.player2;
        playerId = sortedPlayers[player1Index].id;
      } else {
        // player1Index est le second joueur, inverser
        score1 = match.score.player2;
        score2 = match.score.player1;
        playerId = sortedPlayers[player1Index].id;
      }
      
      const isWin = score1 > score2;
      const specialStatus = getMatchSpecialStatus(match.matchData, playerId, isWin);
      const scoreText = formatMatchScore(match.matchData, playerId, score1, score2);
      
      return {
        text: scoreText,
        isWin,
        isScheduled: false,
        backgroundColor: specialStatus.backgroundColor,
        textColor: specialStatus.textColor,
        matchData: match.matchData,
      };
    } 
    // Match planifié (avec date)
    else if (match.scheduledDate) {
      return {
        text: formatDate(match.scheduledDate),
        isWin: null,
        isScheduled: true,
        backgroundColor: colorScheme === 'dark' ? colors.background : '#ffffff',
        textColor: colorScheme === 'dark' ? colors.text + '80' : '#666',
      };
    }
    
    return { 
      text: '-', 
      isWin: null, 
      isScheduled: false,
      backgroundColor: colorScheme === 'dark' ? colors.background : '#ffffff',
      textColor: colorScheme === 'dark' ? colors.text + '50' : '#666',
    };
  };

  return (
    <View style={styles.tableContainer}>
      {/* En-tête avec noms des joueurs */}
      <View style={[styles.headerRow, { borderBottomColor: borderColor }]}>
        <View style={[
          styles.cell, 
          styles.headerCell, 
          { 
            width: firstColumnWidth,
            backgroundColor: colorScheme === 'dark' ? colors.background : '#ffffff',
            borderRightColor: borderColor,
          }
        ]}>
          <ThemedText style={styles.headerText}></ThemedText>
        </View>
        {sortedPlayers.map((player, index) => {
          const PlayerComponent = onPlayerPress ? TouchableOpacity : View;
          return (
            <PlayerComponent
              key={player.id}
              style={[
                styles.cell, 
                styles.headerCell, 
                { 
                  width: playerColumnWidth,
                  backgroundColor: colorScheme === 'dark' ? colors.background : '#ffffff',
                  borderRightColor: borderColor,
                }
              ]}
              onPress={onPlayerPress ? () => onPlayerPress(player.id) : undefined}
              activeOpacity={onPlayerPress ? 0.7 : 1}
            >
              <View style={styles.playerHeader}>
                {player.pictureUrl ? (
                  <Image
                    source={{ uri: player.pictureUrl }}
                    style={[styles.avatar, styles.headerAvatar, { borderRadius: 10 }]}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[
                    styles.avatar,
                    styles.headerAvatar,
                    { backgroundColor: getAvatarColors(colorScheme ?? 'light', index).backgroundColor }
                  ]}>
                    <Text style={[styles.avatarText, { color: getAvatarColors(colorScheme ?? 'light', index).textColor }]}>
                      {getInitials(player.firstName, player.lastName)}
                    </Text>
                  </View>
                )}
                <View style={styles.playerNameTextContainer}>
                  <ThemedText style={[styles.lastNameText, { color: colors.text }]} numberOfLines={1}>
                    {player.lastName}
                  </ThemedText>
                  <ThemedText style={[styles.firstNameText, { color: colors.text + '70' }]} numberOfLines={1}>
                    {player.firstName}
                  </ThemedText>
                </View>
              </View>
            </PlayerComponent>
          );
        })}
        <View style={[
          styles.cell, 
          styles.headerCell, 
          styles.totalColumn, 
          { 
            width: totalColumnWidth,
            backgroundColor: colorScheme === 'dark' ? colors.background : '#ffffff',
            borderLeftColor: totalBorderColor,
            borderRightColor: borderColor,
          }
        ]}>
          <ThemedText style={styles.headerText}>Total</ThemedText>
        </View>
      </View>

      {/* Lignes de données */}
      {sortedPlayers.map((player, rowIndex) => {
        // Déterminer la couleur de bordure selon le statut de réinscription
        const reinscriptionBorderColor = player.nextBoxStatus === 'continue' ? '#10b981' : // Vert pour réinscrit
                           player.nextBoxStatus === 'stop' ? '#ef4444' : // Rouge pour arrêt
                           undefined; // Pas de bordure si pas de statut
        
        return (
        <View 
          key={player.id} 
          style={[styles.dataRow, { borderBottomColor: borderColor }]}
        >
          {reinscriptionBorderColor && (
            <View style={[styles.reinscriptionBorder, { backgroundColor: reinscriptionBorderColor }]} />
          )}
          {/* Nom du joueur avec avatar */}
          {(() => {
            const PlayerComponent = onPlayerPress ? TouchableOpacity : View;
            return (
              <PlayerComponent
                style={[
                  styles.cell, 
                  styles.playerNameCell, 
                  { 
                    width: firstColumnWidth,
                    backgroundColor: colorScheme === 'dark' ? colors.background : '#ffffff',
                    borderRightColor: borderColor,
                  }
                ]}
                onPress={onPlayerPress ? () => onPlayerPress(player.id) : undefined}
                activeOpacity={onPlayerPress ? 0.7 : 1}
              >
                <View style={styles.playerNameContainerHorizontal}>
                  {player.pictureUrl ? (
                    <Image
                      source={{ uri: player.pictureUrl }}
                      style={[styles.avatar, styles.verticalAvatar, { borderRadius: 10 }]}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[
                      styles.avatar,
                      styles.verticalAvatar,
                      { backgroundColor: getAvatarColors(colorScheme ?? 'light', rowIndex).backgroundColor }
                    ]}>
                      <Text style={[styles.avatarTextVertical, { color: getAvatarColors(colorScheme ?? 'light', rowIndex).textColor }]}>
                        {getInitials(player.firstName, player.lastName)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.playerNameTextContainerVertical}>
                    <ThemedText style={[styles.lastNameTextVertical, { color: colors.text }]} numberOfLines={1}>
                      {player.lastName}
                    </ThemedText>
                    <ThemedText style={[styles.firstNameTextVertical, { color: colors.text + '70' }]} numberOfLines={1}>
                      {player.firstName}
                    </ThemedText>
                  </View>
                </View>
              </PlayerComponent>
            );
          })()}

          {/* Scores ou dates */}
          {sortedPlayers.map((_, colIndex) => {
            if (rowIndex === colIndex) {
              return (
                <View 
                  key={colIndex} 
                  style={[
                    styles.cell, 
                    styles.diagonalCell, 
                    { 
                      width: playerColumnWidth,
                      backgroundColor: '#000000',
                      borderRightColor: borderColor,
                    }
                  ]}
                >
                  <Text style={styles.diagonalText}>-</Text>
                </View>
              );
            }
            
            const result = getMatchResult(rowIndex, colIndex);
            
            return (
              <View 
                key={colIndex} 
                style={[
                  styles.cell, 
                  styles.dataCell,
                  { 
                    width: playerColumnWidth,
                    backgroundColor: result.backgroundColor,
                    borderRightColor: borderColor,
                  }
                ]}
              >
                <Text 
                  style={[
                    styles.matchText,
                    result.isScheduled && styles.scheduledText,
                    { color: result.textColor },
                  ]}
                  numberOfLines={2}
                >
                  {result.text}
                </Text>
              </View>
            );
          })}

          {/* Total */}
          <View style={[
            styles.cell, 
            styles.totalCell, 
            { 
              width: totalColumnWidth,
              backgroundColor: colorScheme === 'dark' ? colors.background : '#ffffff',
              borderLeftColor: totalBorderColor,
              borderRightColor: borderColor,
            }
          ]}>
            <ThemedText style={styles.totalText}>
              {playersWithScores[rowIndex].total}
            </ThemedText>
          </View>
        </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tableContainer: {
    borderWidth: 0,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
  },
  dataRow: {
    flexDirection: 'row',
    position: 'relative',
    borderBottomWidth: 0.5,
  },
  reinscriptionBorder: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    zIndex: 1,
  },
  cell: {
    padding: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 0.5,
  },
  headerCell: {
    minHeight: 45,
    paddingVertical: 3,
    borderRightWidth: 0.5,
  },
  totalColumn: {
    borderLeftWidth: 2,
    borderRightWidth: 0.5,
  },
  playerNameCell: {
    borderRightWidth: 0.5,
  },
  playerNameContainer: {
    alignItems: 'center',
    gap: 1,
    flex: 1,
    justifyContent: 'center',
  },
  playerNameContainerHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'flex-start',
    paddingLeft: 4,
  },
  playerNameTextContainer: {
    alignItems: 'center',
    width: '100%',
  },
  playerNameTextContainerVertical: {
    alignItems: 'flex-start',
    flex: 1,
  },
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  avatarText: {
    fontSize: 7,
    fontWeight: '700',
  },
  verticalAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
  },
  avatarTextVertical: {
    fontSize: 7,
    fontWeight: '700',
  },
  playerHeader: {
    alignItems: 'center',
    gap: 2,
    justifyContent: 'center',
    width: '100%',
  },
  firstNameText: {
    fontSize: 7,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 9,
  },
  lastNameText: {
    fontSize: 7,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 9,
  },
  firstNameTextVertical: {
    fontSize: 7,
    fontWeight: '400',
    textAlign: 'left',
    lineHeight: 9,
  },
  lastNameTextVertical: {
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'left',
    lineHeight: 11,
  },
  headerText: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  diagonalCell: {
    backgroundColor: '#000000',
  },
  diagonalText: {
    fontSize: 10,
    color: '#ffffff',
    fontWeight: '600',
  },
  dataCell: {
    minHeight: 40,
    paddingVertical: 2,
  },
  matchText: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 12,
  },
  scheduledText: {
    fontSize: 8,
    fontWeight: '400',
    opacity: 0.7,
    lineHeight: 10,
  },
  totalCell: {
    borderLeftWidth: 2,
    borderRightWidth: 0.5,
  },
  totalText: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
});

