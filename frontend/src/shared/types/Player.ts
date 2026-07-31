export interface Jokers {
  extraTime?: number;
  skipTurn?: number;
  hint?: number;
  attemptBonus?: number;
}

export interface Player {
  id: string;
  name: string;
  isEliminated: boolean;
  livesRemaining: number;
  jokers?: Jokers;
  teamId?: string;
}

export function createPlayer(id: string, name: string, maxLives: number = 1): Player {
  return {
    id,
    name,
    isEliminated: false,
    livesRemaining: maxLives,
  };
}
