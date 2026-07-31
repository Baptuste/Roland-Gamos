/**
 * Jokers disponibles pour un joueur (future-proof)
 */
export interface Jokers {
  extraTime?: number;
  skipTurn?: number;
  hint?: number;
  attemptBonus?: number;
}

/**
 * Représente un joueur dans une partie
 */
export interface Player {
  id: string;
  name: string;
  isEliminated: boolean;
  livesRemaining: number;
  jokers?: Jokers;
  teamId?: string; // pertinent seulement si settings.teamsEnabled (voir types/Game.ts)
}

/**
 * Crée un nouveau joueur
 * @param maxLives Nombre de vies de départ (défaut 1 = comportement historique : 1 erreur = élimination)
 */
export function createPlayer(id: string, name: string, maxLives: number = 1): Player {
  return {
    id,
    name,
    isEliminated: false,
    livesRemaining: maxLives,
    jokers: {},
  };
}
