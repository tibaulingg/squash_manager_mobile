import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { PlayerAvatar } from '@/components/player-avatar';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { BoxDTO, MatchDTO, PlayerDTO } from '@/types/api';

interface LiveMatchCardProps {
  match: MatchDTO;
  playerA: PlayerDTO;
  playerB: PlayerDTO;
  box?: BoxDTO;
  onPlayerPress?: (playerId: string) => void;
}

export function LiveMatchCard({ match, playerA, playerB, box, onPlayerPress }: LiveMatchCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [timeElapsed, setTimeElapsed] = useState<string>('');

  // Calculer le temps écoulé depuis le début du match (format MM:SS)
  useEffect(() => {
    if (!match.running_since) return;

    const updateTime = () => {
      const startTime = new Date(match.running_since!);
      const now = new Date();
      const diff = Math.floor((now.getTime() - startTime.getTime()) / 1000); // Différence en secondes
      
      const minutes = Math.floor(diff / 60);
      const seconds = diff % 60;
      
      // Formater en MM:SS
      const formattedMinutes = String(minutes).padStart(2, '0');
      const formattedSeconds = String(seconds).padStart(2, '0');
      setTimeElapsed(`${formattedMinutes}:${formattedSeconds}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000); // Mettre à jour chaque seconde

    return () => clearInterval(interval);
  }, [match.running_since]);

  const scoreA = match.score_a ?? 0;
  const scoreB = match.score_b ?? 0;

  return (
    <View style={[styles.card, { 
      backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#ffffff',
      borderColor: colors.text + '12',
      shadowColor: '#000',
    }]}>
      {/* Header avec fond distinct */}
      <View style={[styles.header, { 
        backgroundColor: colorScheme === 'dark' ? '#252525' : '#f8f9fa',
        borderBottomColor: colors.text + '08',
      }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.liveIndicator, { backgroundColor: '#ef4444' + '20' }]}>
            <View style={[styles.liveDot, { backgroundColor: '#ef4444' }]} />
            <ThemedText style={[styles.liveText, { color: '#ef4444' }]}>LIVE</ThemedText>
            {timeElapsed && (
              <ThemedText style={[styles.timeElapsed, { color: colors.text + '60' }]}>
                • {timeElapsed}
              </ThemedText>
            )}
          </View>
        </View>
        
        <View style={styles.headerRight}>
          {box && (
            <View style={[styles.boxChip, { 
              backgroundColor: colorScheme === 'dark' ? '#2a2a2a' : '#ffffff',
              borderColor: colors.text + '15',
            }]}>
              <IconSymbol name="square.grid.2x2.fill" size={10} color={colors.text + '70'} />
              <ThemedText style={[styles.boxText, { color: colors.text }]}>
                {box.name}
              </ThemedText>
            </View>
          )}
          
          {match.terrain_number && (
            <View style={[styles.terrainChip, { 
              backgroundColor: colorScheme === 'dark' ? '#2a2a2a' : '#ffffff',
              borderColor: colors.text + '15',
            }]}>
              <IconSymbol name="sportscourt.fill" size={10} color={colors.text + '70'} />
              <ThemedText style={[styles.terrainText, { color: colors.text }]}>
                Terrain {match.terrain_number}
              </ThemedText>
            </View>
          )}
        </View>
      </View>

      {/* Contenu du match avec fond clair */}
      <View style={[styles.content, { 
        backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#ffffff',
      }]}>
        <View style={styles.playersRow}>
          {/* Joueur 1 : Nom à gauche, Avatar à droite */}
          <TouchableOpacity
            style={[styles.playerContainer, styles.playerLeft]}
            onPress={() => onPlayerPress?.(playerA.id)}
            activeOpacity={0.6}
            disabled={!onPlayerPress}
          >
            <View style={[styles.playerNameContainer, styles.playerNameContainerLeft]}>
              <ThemedText style={[styles.playerFirstName, { color: colors.text }]} numberOfLines={1}>
                {playerA.first_name}
              </ThemedText>
              <ThemedText style={[styles.playerLastName, { color: colors.text }]} numberOfLines={1}>
                {playerA.last_name}
              </ThemedText>
            </View>
            <PlayerAvatar
              firstName={playerA.first_name || 'Joueur'}
              lastName={playerA.last_name || ''}
              pictureUrl={playerA.picture}
              size={32}
            />
          </TouchableOpacity>

          <View style={[styles.scoreContainer, { 
            backgroundColor: colorScheme === 'dark' ? '#2a2a2a' : '#f8f9fa',
            borderColor: colors.text + '10',
          }]}>
            <ThemedText style={[styles.score, { color: colors.text }]}>
              {scoreA}
            </ThemedText>
            <View style={[styles.scoreSeparator, { backgroundColor: colors.text + '25' }]} />
            <ThemedText style={[styles.score, { color: colors.text }]}>
              {scoreB}
            </ThemedText>
          </View>

          {/* Joueur 2 : Avatar à gauche, Nom à droite */}
          <TouchableOpacity
            style={[styles.playerContainer, styles.playerRight]}
            onPress={() => onPlayerPress?.(playerB.id)}
            activeOpacity={0.6}
            disabled={!onPlayerPress}
          >
            <PlayerAvatar
              firstName={playerB.first_name || 'Joueur'}
              lastName={playerB.last_name || ''}
              pictureUrl={playerB.picture}
              size={32}
            />
            <View style={[styles.playerNameContainer, styles.playerNameContainerRight]}>
              <ThemedText style={[styles.playerFirstName, { color: colors.text }]} numberOfLines={1}>
                {playerB.first_name}
              </ThemedText>
              <ThemedText style={[styles.playerLastName, { color: colors.text }]} numberOfLines={1}>
                {playerB.last_name}
              </ThemedText>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  boxChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 0.5,
  },
  boxText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    alignSelf: 'flex-start',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  timeElapsed: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  terrainChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 0.5,
  },
  terrainText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  playersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  playerContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  playerLeft: {
    justifyContent: 'flex-start',
  },
  playerRight: {
    justifyContent: 'flex-end',
  },
  playerNameContainer: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 32, // Aligner avec la hauteur de l'avatar
  },
  playerNameContainerLeft: {
    alignItems: 'flex-start',
  },
  playerNameContainerRight: {
    alignItems: 'flex-end',
  },
  playerFirstName: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
    lineHeight: 13,
  },
  playerLastName: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
    lineHeight: 13,
    marginTop: 0,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 70,
  },
  score: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
    minWidth: 22,
    textAlign: 'center',
  },
  scoreSeparator: {
    width: 1.5,
    height: 20,
  },
});
