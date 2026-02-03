import type { MatchDTO } from '@/types/api';

export type MatchSpecialStatus = {
  type: 'normal' | 'no_show' | 'retired' | 'delayed';
  label?: string;
  backgroundColor: string;
  textColor: string;
};

/**
 * Détermine le statut spécial d'un match pour un joueur donné
 */
export function getMatchSpecialStatus(
  match: MatchDTO,
  playerId: string,
  isWin: boolean
): MatchSpecialStatus {
  // Cas spécial : No show (absence)
  if (match.no_show_player_id) {
    const isPlayerAbsent = match.no_show_player_id === playerId;
    return {
      type: 'no_show',
      label: isPlayerAbsent ? 'Absent' : 'Adv. Absent',
      backgroundColor: isPlayerAbsent ? '#f8d7da' : '#f3f4f6', // Rouge si c'est le joueur, gris si c'est l'adversaire
      textColor: isPlayerAbsent ? '#721c24' : '#6b7280', // Rouge si c'est le joueur, gris si c'est l'adversaire
    };
  }

  // Cas spécial : Blessure (retired)
  if (match.retired_player_id) {
    const isPlayerInjured = match.retired_player_id === playerId;
    return {
      type: 'retired',
      label: isPlayerInjured ? 'Blessé' : 'Bless. adv.',
      backgroundColor: isPlayerInjured ? '#f8d7da' : '#f3f4f6', // Rouge si c'est le joueur, gris si c'est l'adversaire
      textColor: isPlayerInjured ? '#721c24' : '#6b7280', // Rouge si c'est le joueur, gris si c'est l'adversaire
    };
  }

  // Cas spécial : Remise (delayed) - GRIS
  if (match.delayed_player_id) {
    return {
      type: 'delayed',
      label: match.delayed_player_id === playerId ? 'Remis' : 'Remis adv.',
      backgroundColor: '#f3f4f6', // Gris clair
      textColor: '#6b7280', // Gris foncé
    };
  }

  // Cas normal : victoire ou défaite
  if (isWin) {
    return {
      type: 'normal',
      backgroundColor: '#d4edda',
      textColor: '#155724',
    };
  } else {
    return {
      type: 'normal',
      backgroundColor: '#f8d7da',
      textColor: '#721c24',
    };
  }
}

/**
 * Formate le score avec le statut spécial si nécessaire
 */
export function formatMatchScore(
  match: MatchDTO,
  playerId: string,
  playerScore: number,
  opponentScore: number
): string {
  const specialStatus = getMatchSpecialStatus(
    match,
    playerId,
    playerScore > opponentScore
  );

  if (specialStatus.type !== 'normal' && specialStatus.label) {
    return specialStatus.label;
  }

  return `${playerScore}-${opponentScore}`;
}

/**
 * Obtient un label court pour le tableau des box
 */
export function getShortMatchLabel(match: MatchDTO, playerId: string): string | null {
  // Cas spécial : No show (absence)
  if (match.no_show_player_id) {
    if (match.no_show_player_id === playerId) {
      return 'PVSP';
    } else {
      return 'Adv.\nPVSP';
    }
  }

  // Cas spécial : Blessure (retired)
  if (match.retired_player_id) {
    if (match.retired_player_id === playerId) {
      return 'Bl.';
    } else {
      return 'Bl.\nAdv.';
    }
  }

  // Cas spécial : Remise (delayed)
  if (match.delayed_player_id) {
    if (match.delayed_player_id === playerId) {
      return 'R';
    } else {
      return 'R.A';
    }
  }

  return null;
}

/**
 * Vérifie si un match est un cas spécial (pas une vraie victoire/défaite)
 */
export function isSpecialCaseMatch(match: MatchDTO): boolean {
  return match.no_show_player_id !== null || 
         match.retired_player_id !== null || 
         match.delayed_player_id !== null;
}

