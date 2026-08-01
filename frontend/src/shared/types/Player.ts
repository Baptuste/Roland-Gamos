export type JokerType = 'timer' | 'skip' | 'combo' | 'bouclier' | 'archives' | 'resurrection';

export interface Player {
  id: string;
  name: string;
  isEliminated: boolean;
  livesRemaining: number;
  jokerStock?: Partial<Record<JokerType, number>>;
  teamId?: string;
  score: number;
  persistentId?: string;
}

export function createPlayer(id: string, name: string, maxLives: number = 1, persistentId?: string): Player {
  return {
    id,
    name,
    isEliminated: false,
    livesRemaining: maxLives,
    score: 0,
    persistentId,
  };
}
