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
  jokers?: Jokers;
}

/**
 * Crée un nouveau joueur
 */
export function createPlayer(id: string, name: string): Player {
  return {
    id,
    name,
    isEliminated: false,
    jokers: {},
  };
}
