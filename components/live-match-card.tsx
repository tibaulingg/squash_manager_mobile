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
      // Parser la date - si c'est une string ISO, elle est déjà en UTC
      const startTime = new Date(match.running_since!);
      const now = new Date();
      
      // Calculer la différence en millisecondes (les deux dates sont déjà dans le même timezone)
      const diff = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      
      // Si la différence est négative, le match n'a pas encore commencé
      if (diff < 0) {
        setTimeElapsed('00:00');
        return;
      }
      
      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;
      
      // Formater en HH:MM:SS ou MM:SS selon la durée
      if (hours > 0) {
        const formattedHours = String(hours).padStart(2, '0');
        const formattedMinutes = String(minutes).padStart(2, '0');
        const formattedSeconds = String(seconds).padStart(2, '0');
        setTimeElapsed(`${formattedHours}:${formattedMinutes}:${formattedSeconds}`);
      } else {
        const formattedMinutes = String(minutes).padStart(2, '0');
        const formattedSeconds = String(seconds).padStart(2, '0');
        setTimeElapsed(`${formattedMinutes}:${formattedSeconds}`);
      }
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
      backgroundColor: colorScheme === 'dark' ? colors.background : '#ffffff',
      borderColor: colorScheme === 'dark' ? colors.text + '15' : '#E5E7EB',
      shadowColor: '#000',
    }]}>
      {/* Header sobre et épuré */}
      <View style={[styles.header, { 
        backgroundColor: colorScheme === 'dark' ? colors.background : '#ffffff',
        borderBottomColor: colorScheme === 'dark' ? colors.text + '08' : '#F0F0F0',
      }]}>
        <View style={styles.headerContent}>
          {/* Bouton arbitrer et temps à gauche */}
          <View style={styles.leftSection}>
            {onRefereePress && isReferee && (
              <TouchableOpacity
                style={[styles.refereeButton, { 
                  backgroundColor: colorScheme === 'dark' ? PRIMARY_COLOR + '15' : PRIMARY_COLOR + '10',
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
            {timeElapsed && (
              <View style={[styles.timeChip, {
                backgroundColor: colorScheme === 'dark' ? colors.text + '08' : '#F5F5F5',
              }]}>
                <View style={[styles.liveDot, { backgroundColor: '#ef4444' }]} />
                <ThemedText style={[styles.timeElapsed, { color: colors.text + '70' }]}>
                  {timeElapsed}
                </ThemedText>
              </View>
            )}
          </View>

          {/* Infos alignées à droite */}
          <View style={styles.rightSection}>
            {box && (
              <View style={[styles.infoChip, {
                backgroundColor: colorScheme === 'dark' ? colors.text + '08' : '#F5F5F5',
              }]}>
                <IconSymbol name="square.grid.2x2.fill" size={10} color={PRIMARY_COLOR} />
                <ThemedText style={[styles.infoChipText, { color: colors.text }]}>
                  {box.name}
                </ThemedText>
              </View>
            )}
            {match.terrain_number && (
              <View style={[styles.infoChip, {
                backgroundColor: colorScheme === 'dark' ? colors.text + '08' : '#F5F5F5',
              }]}>
                <IconSymbol name="sportscourt.fill" size={10} color={colors.text + '60'} />
                <ThemedText style={[styles.infoChipText, { color: colors.text + '70' }]}>
                  {match.terrain_number}
                </ThemedText>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Contenu compact avec scores */}
      <View style={[styles.content, { 
        backgroundColor: colorScheme === 'dark' ? colors.background : '#ffffff',
      }]}>
        {/* Joueur A avec ses scores */}
        <View style={styles.scoreRow}>
          <TouchableOpacity
            style={styles.playerContainer}
            onPress={() => onPlayerPress?.(playerA.id)}
            activeOpacity={0.6}
            disabled={!onPlayerPress}
          >
            <View style={styles.avatarWrapper}>
              <PlayerAvatar
                firstName={playerA.first_name || 'Joueur'}
                lastName={playerA.last_name || ''}
                pictureUrl={playerA.picture}
                size={28}
              />
              {isPlayerAServing && (
                <View style={styles.servingBadge}>
                  <View style={styles.squashBall}>
                    <View style={styles.squashBallBase} />
                    <View style={styles.squashBallDot1} />
                    <View style={styles.squashBallDot2} />
                  </View>
                </View>
              )}
            </View>
            <View style={styles.playerInfo}>
              <ThemedText style={[styles.playerName, { color: colors.text }]} numberOfLines={1}>
                {playerAName}
              </ThemedText>
            </View>
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
                      <ThemedText style={[styles.scoreBadgeText, { color: '#FFFFFF' }]}>
                        {game.scoreA}
                      </ThemedText>
                    </View>
                  );
                }
                
                if (isCurrentSet) {
                  // Set en cours - afficher avec un badge rond en gris
                  return (
                    <View
                      key={index}
                      style={[
                        styles.scoreBadge,
                        { 
                          backgroundColor: colorScheme === 'dark' ? colors.text + '20' : colors.text + '10',
                        }
                      ]}
                    >
                      <ThemedText style={[styles.scoreBadgeText, { 
                        color: colorScheme === 'dark' ? colors.text + '80' : colors.text + '60' 
                      }]}>
                        {game.scoreA}
                      </ThemedText>
                    </View>
                  );
                }
                
                return (
                  <View
                    key={index}
                    style={styles.gameScoreText}
                  >
                    <ThemedText style={{ color: colors.text + '70', fontSize: 13, fontWeight: '500' }}>
                      {String(game.scoreA).padStart(2, ' ')}
                    </ThemedText>
                  </View>
                );
              })
            ) : (
              // Si pas de score (0-0), ne rien afficher ou afficher un chip vide
              scoreA === 0 && scoreB === 0 ? null : (
                <View style={styles.gameScoreText}>
                  <ThemedText style={{ color: colors.text, fontSize: 13, fontWeight: '500' }}>
                    {String(scoreA).padStart(2, ' ')}
                  </ThemedText>
                </View>
              )
            )}
          </View>
        </View>

        {/* Séparateur */}
        <View style={[styles.separator, { 
          backgroundColor: colorScheme === 'dark' ? colors.text + '08' : '#F3F4F6',
        }]} />

        {/* Joueur B avec ses scores */}
        <View style={styles.scoreRow}>
          <TouchableOpacity
            style={styles.playerContainer}
            onPress={() => onPlayerPress?.(playerB.id)}
            activeOpacity={0.6}
            disabled={!onPlayerPress}
          >
            <View style={styles.avatarWrapper}>
              <PlayerAvatar
                firstName={playerB.first_name || 'Joueur'}
                lastName={playerB.last_name || ''}
                pictureUrl={playerB.picture}
                size={28}
              />
              {isPlayerBServing && (
                <View style={styles.servingBadge}>
                  <View style={styles.squashBall}>
                    <View style={styles.squashBallBase} />
                    <View style={styles.squashBallDot1} />
                    <View style={styles.squashBallDot2} />
                  </View>
                </View>
              )}
            </View>
            <View style={styles.playerInfo}>
              <ThemedText style={[styles.playerName, { color: colors.text }]} numberOfLines={1}>
                {playerBName}
              </ThemedText>
            </View>
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
                      <ThemedText style={[styles.scoreBadgeText, { color: '#FFFFFF' }]}>
                        {game.scoreB}
                      </ThemedText>
                    </View>
                  );
                }
                
                if (isCurrentSet) {
                  // Set en cours - afficher avec un badge rond en gris
                  return (
                    <View
                      key={index}
                      style={[
                        styles.scoreBadge,
                        { 
                          backgroundColor: colorScheme === 'dark' ? colors.text + '20' : colors.text + '10',
                        }
                      ]}
                    >
                      <ThemedText style={[styles.scoreBadgeText, { 
                        color: colorScheme === 'dark' ? colors.text + '80' : colors.text + '60' 
                      }]}>
                        {game.scoreB}
                      </ThemedText>
                    </View>
                  );
                }
                
                return (
                  <View
                    key={index}
                    style={styles.gameScoreText}
                  >
                    <ThemedText style={{ color: colors.text + '70', fontSize: 13, fontWeight: '500' }}>
                      {String(game.scoreB).padStart(2, ' ')}
                    </ThemedText>
                  </View>
                );
              })
            ) : (
              // Si pas de score (0-0), ne rien afficher ou afficher un chip vide
              scoreA === 0 && scoreB === 0 ? null : (
                <View style={styles.gameScoreText}>
                  <ThemedText style={{ color: colors.text, fontSize: 13, fontWeight: '500' }}>
                    {String(scoreB).padStart(2, ' ')}
                  </ThemedText>
                </View>
              )
            )}
          </View>
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
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  timeElapsed: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  infoChipText: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  content: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
  },
  playerContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginRight: 12,
    minWidth: 100,
  },
  avatarWrapper: {
    position: 'relative',
  },
  servingBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 8,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  scoresContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 100,
    justifyContent: 'flex-end',
  },
  gameScoreText: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  separator: {
    height: 1,
    marginVertical: 6,
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
    fontVariant: ['tabular-nums'],
  },
  refereeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  refereeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  squashBall: {
    width: 10,
    height: 10,
    position: 'relative',
    alignSelf: 'center',
  },
  squashBallBase: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#000000',
    position: 'absolute',
  },
  squashBallDot1: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#fbbf24',
    position: 'absolute',
    top: 2,
    left: 2.5,
  },
  squashBallDot2: {
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#fbbf24',
    position: 'absolute',
    bottom: 3,
    right: 4,
  },
});
