import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { PlayerAvatar } from '@/components/player-avatar';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, PRIMARY_COLOR } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { BoxDTO, MatchDTO, PlayerDTO } from '@/types/api';

interface LiveMatchCardProps {
  match: MatchDTO;
  playerA: PlayerDTO;
  playerB: PlayerDTO;
  box?: BoxDTO;
  onPlayerPress?: (playerId: string) => void;
  onRefereePress?: (matchId: string) => void;
}

export function LiveMatchCard({ match, playerA, playerB, box, onPlayerPress, onRefereePress }: LiveMatchCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { user } = useAuth();
  const [timeElapsed, setTimeElapsed] = useState<string>('');
  
  // Vérifier si l'utilisateur connecté est l'arbitre du match
  const isReferee = user && match.referee_id && user.id === match.referee_id;

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

  // Parser le live_score pour afficher les scores détaillés de chaque jeu
  const parseGameScores = (liveScore: string | null): Array<{ scoreA: number; scoreB: number }> => {
    if (!liveScore || liveScore.trim() === '') return [];
    
    const parts = liveScore.split(';');
    const gameScores: Array<{ scoreA: number; scoreB: number }> = [];
    
    parts.forEach((part) => {
      const [scoreAStr, scoreBStr] = part.split('-');
      const scoreA = parseInt(scoreAStr, 10) || 0;
      const scoreB = parseInt(scoreBStr, 10) || 0;
      gameScores.push({ scoreA, scoreB });
    });
    
    return gameScores;
  };

  const gameScores = parseGameScores(match.live_score);
  
  // Format du nom complet du joueur
  const playerAName = `${playerA.first_name} ${playerA.last_name}`.trim();
  const playerBName = `${playerB.first_name} ${playerB.last_name}`.trim();

  // Déterminer qui sert basé sur server_id
  const isPlayerAServing = match.server_id === playerA.id;
  const isPlayerBServing = match.server_id === playerB.id;

  // Vérifier si un set est fini (au moins 11 points et 2 points d'écart)
  const isSetFinished = (scoreA: number, scoreB: number): boolean => {
    const maxScore = Math.max(scoreA, scoreB);
    const diff = Math.abs(scoreA - scoreB);
    return maxScore >= 11 && diff >= 2;
  };

  return (
    <View style={[styles.card, { 
      backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#ffffff',
      borderColor: colors.text + '12',
      shadowColor: '#000',
    }]}>
      {/* Header compact */}
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
          {box && (
            <>
              <View style={[styles.boxChip, { 
                backgroundColor: colorScheme === 'dark' ? '#2a2a2a' : '#ffffff',
                borderColor: colors.text + '15',
              }]}>
                <IconSymbol name="square.grid.2x2.fill" size={9} color={colors.text + '70'} />
                <ThemedText style={[styles.boxText, { color: colors.text }]}>
                  {box.name}
                </ThemedText>
              </View>
              {match.terrain_number && (
                <ThemedText style={[styles.terrainInline, { color: colors.text + '70' }]}>
                  T{match.terrain_number}
                </ThemedText>
              )}
            </>
          )}
        </View>
        
        <View style={styles.headerRight}>
          {onRefereePress && isReferee && (
            <TouchableOpacity
              style={[styles.refereeButton, { 
                backgroundColor: PRIMARY_COLOR + '15',
                borderColor: PRIMARY_COLOR + '30',
              }]}
              onPress={() => onRefereePress(match.id)}
              activeOpacity={0.7}
            >
              <IconSymbol name="checkmark.circle.fill" size={12} color={PRIMARY_COLOR} />
              <ThemedText style={[styles.refereeText, { color: PRIMARY_COLOR }]}>
                Arbitrer
              </ThemedText>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Contenu compact avec scores */}
      <View style={[styles.content, { 
        backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#ffffff',
      }]}>
        {/* Joueur A avec ses scores */}
        <View style={styles.scoreRow}>
          <TouchableOpacity
            style={styles.playerContainer}
            onPress={() => onPlayerPress?.(playerA.id)}
            activeOpacity={0.6}
            disabled={!onPlayerPress}
          >
            <PlayerAvatar
              firstName={playerA.first_name || 'Joueur'}
              lastName={playerA.last_name || ''}
              pictureUrl={playerA.picture}
              size={20}
            />
            <ThemedText style={[styles.playerName, { color: colors.text }]} numberOfLines={1}>
              {playerAName}
            </ThemedText>
            {isPlayerAServing && (
              <View style={styles.squashBall}>
                <View style={styles.squashBallBase} />
                <View style={styles.squashBallDot1} />
                <View style={styles.squashBallDot2} />
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.scoresContainer}>
            {gameScores.length > 0 ? (
              gameScores.map((game, index) => {
                const isWon = game.scoreA > game.scoreB;
                const isCurrentSet = index === gameScores.length - 1;
                const finished = isSetFinished(game.scoreA, game.scoreB);
                
                if (finished) {
                  return (
                    <View
                      key={index}
                      style={[
                        styles.scoreBadge,
                        isWon 
                          ? { backgroundColor: '#22c55e' }
                          : { backgroundColor: '#ef4444' }
                      ]}
                    >
                      <ThemedText style={styles.scoreBadgeText}>
                        {game.scoreA}
                      </ThemedText>
                    </View>
                  );
                }
                
                if (isCurrentSet) {
                  // Set en cours - afficher avec un badge distinctif
                  return (
                    <View
                      key={index}
                      style={[
                        styles.currentSetBadge,
                        { 
                          backgroundColor: colorScheme === 'dark' ? '#2a2a2a' : '#f0f0f0',
                          borderColor: colors.text + '30',
                        }
                      ]}
                    >
                      <ThemedText style={[styles.currentSetScore, { color: colors.text }]}>
                        {game.scoreA}
                      </ThemedText>
                    </View>
                  );
                }
                
                return (
                  <ThemedText 
                    key={index}
                    style={[
                      styles.gameScoreText, 
                      { color: colors.text + '70' },
                    ]}
                  >
                    {String(game.scoreA).padStart(2, ' ')}
                  </ThemedText>
                );
              })
            ) : (
              <ThemedText style={[styles.gameScoreText, { color: colors.text }]}>
                {String(scoreA).padStart(2, ' ')}
              </ThemedText>
            )}
          </View>
        </View>

        {/* Séparateur */}
        <View style={[styles.separator, { backgroundColor: colors.text + '10' }]} />

        {/* Joueur B avec ses scores */}
        <View style={styles.scoreRow}>
          <TouchableOpacity
            style={styles.playerContainer}
            onPress={() => onPlayerPress?.(playerB.id)}
            activeOpacity={0.6}
            disabled={!onPlayerPress}
          >
            <PlayerAvatar
              firstName={playerB.first_name || 'Joueur'}
              lastName={playerB.last_name || ''}
              pictureUrl={playerB.picture}
              size={20}
            />
            <ThemedText style={[styles.playerName, { color: colors.text }]} numberOfLines={1}>
              {playerBName}
            </ThemedText>
            {isPlayerBServing && (
              <View style={styles.squashBall}>
                <View style={styles.squashBallBase} />
                <View style={styles.squashBallDot1} />
                <View style={styles.squashBallDot2} />
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.scoresContainer}>
            {gameScores.length > 0 ? (
              gameScores.map((game, index) => {
                const isWon = game.scoreB > game.scoreA;
                const isCurrentSet = index === gameScores.length - 1;
                const finished = isSetFinished(game.scoreA, game.scoreB);
                
                if (finished) {
                  return (
                    <View
                      key={index}
                      style={[
                        styles.scoreBadge,
                        isWon 
                          ? { backgroundColor: '#22c55e' }
                          : { backgroundColor: '#ef4444' }
                      ]}
                    >
                      <ThemedText style={styles.scoreBadgeText}>
                        {game.scoreB}
                      </ThemedText>
                    </View>
                  );
                }
                
                if (isCurrentSet) {
                  // Set en cours - afficher avec un badge distinctif
                  return (
                    <View
                      key={index}
                      style={[
                        styles.currentSetBadge,
                        { 
                          backgroundColor: colorScheme === 'dark' ? '#2a2a2a' : '#f0f0f0',
                          borderColor: colors.text + '30',
                        }
                      ]}
                    >
                      <ThemedText style={[styles.currentSetScore, { color: colors.text }]}>
                        {game.scoreB}
                      </ThemedText>
                    </View>
                  );
                }
                
                return (
                  <ThemedText 
                    key={index}
                    style={[
                      styles.gameScoreText, 
                      { color: colors.text + '70' },
                    ]}
                  >
                    {String(game.scoreB).padStart(2, ' ')}
                  </ThemedText>
                );
              })
            ) : (
              <ThemedText style={[styles.gameScoreText, { color: colors.text }]}>
                {String(scoreB).padStart(2, ' ')}
              </ThemedText>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 8,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    gap: 6,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  boxChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
  },
  boxText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  liveText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  timeElapsed: {
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  terrainChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
  },
  terrainText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  terrainInline: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.1,
    marginLeft: 2,
  },
  content: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 20,
  },
  playerContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 8,
    minWidth: 100,
  },
  playerName: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  scoresContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 80,
    justifyContent: 'flex-end',
  },
  gameScoreText: {
    fontSize: 12,
    fontWeight: '500',
    width: 20,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  currentSetBadge: {
    minWidth: 28,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  currentSetScore: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    lineHeight: 14,
    includeFontPadding: false,
  },
  separator: {
    height: 1,
    marginVertical: 4,
  },
  scoreBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  refereeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    minHeight: 24,
  },
  refereeText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  squashBall: {
    width: 12,
    height: 12,
    position: 'relative',
    marginLeft: 3,
    alignSelf: 'center',
  },
  squashBallBase: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#000000',
    position: 'absolute',
  },
  squashBallDot1: {
    width: 2,
    height: 2,
    borderRadius: 1.5,
    backgroundColor: '#fbbf24',
    position: 'absolute',
    top: 2,
    left: 3,
  },
  squashBallDot2: {
    width: 2,
    height: 2,
    borderRadius: 1.5,
    backgroundColor: '#fbbf24',
    position: 'absolute',
    bottom: 5,
    right: 5,
  },
});
