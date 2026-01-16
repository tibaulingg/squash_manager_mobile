import type { PlayerDTO, SeasonDTO } from '@/types/api';

/**
 * Trouve la saison du box où le joueur a un membership
 * @param player Le joueur avec son current_box
 * @param seasons Liste de toutes les saisons
 * @returns La saison du boxmembership ou null si le joueur n'a pas de box
 */
export function getSeasonFromBoxMembership(
  player: PlayerDTO | null,
  seasons: SeasonDTO[]
): SeasonDTO | null {
  if (!player?.current_box?.season_id) {
    return null;
  }
  
  return seasons.find(s => s.id === player.current_box!.season_id) || null;
}

/**
 * Trouve toutes les saisons actives (status = 'running')
 * @param seasons Liste de toutes les saisons
 * @returns Liste des saisons actives
 */
export function getActiveSeasons(seasons: SeasonDTO[]): SeasonDTO[] {
  return seasons.filter(s => s.status === 'running');
}

/**
 * Trouve la première saison active ou la première saison disponible
 * @param seasons Liste de toutes les saisons
 * @returns La première saison active ou la première saison, ou null
 */
export function getDefaultSeason(seasons: SeasonDTO[]): SeasonDTO | null {
  const activeSeasons = getActiveSeasons(seasons);
  return activeSeasons[0] || seasons[0] || null;
}
