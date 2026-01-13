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
}

export function createGame(id: string, players: Player[]): Game {
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
  };
}
