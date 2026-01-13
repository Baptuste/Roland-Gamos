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
  jokers?: Jokers;
}

export function createPlayer(id: string, name: string): Player {
  return {
    id,
    name,
    isEliminated: false,
  };
}
