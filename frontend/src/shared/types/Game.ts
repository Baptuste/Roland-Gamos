import { Player } from './Player';
import { Turn } from './Turn';

export enum GameStatus {
  WAITING = 'waiting',
  IN_PROGRESS = 'in_progress',
  FINISHED = 'finished',
}

export interface CanonicalArtist {
  name: string;
  mbid?: string;
  qid?: string;
}

export interface GameSettings {
  turnDurationMs: number; // 15000 | 30000 | 60000
  maxLives: number;       // 1 | 2 | 3
  jokersEnabled: boolean; // stocké, aucune mécanique branchée pour l'instant
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  turnDurationMs: 30000,
  maxLives: 1,
  jokersEnabled: false,
};

export interface Game {
  id: string;
  status: GameStatus;
  players: Player[];
  turns: Turn[];
  currentPlayerIndex: number;
  lastArtistName: string | null;
  lastArtist?: CanonicalArtist;
  usedArtists?: string[];
  currentTurnEndsAt?: number;
  attemptsUsed?: number;
  settings: GameSettings;
  readyPlayerIds: string[];
}

export function createGame(id: string, players: Player[], settings: GameSettings = DEFAULT_GAME_SETTINGS): Game {
  if (players.length < 2) {
    throw new Error('Une partie nécessite au moins 2 joueurs');
  }

  return {
    id,
    status: GameStatus.WAITING,
    players,
    turns: [],
    currentPlayerIndex: 0,
    lastArtistName: null,
    settings,
    readyPlayerIds: [],
  };
}
