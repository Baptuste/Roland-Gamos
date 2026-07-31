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
  jokersEnabled: boolean;
  jokerSelectionMode: 'manuelle' | 'aleatoire'; // pertinent seulement si jokersEnabled
  hintsEnabled: boolean;  // Aide (collabs connues) + Historique visibles par défaut
  teamsEnabled: boolean;
  teamCount: number;      // 2 | 3 | 4, pertinent seulement si teamsEnabled
  eliminationMode: 'vies' | 'erreurs'; // pertinent seulement si teamsEnabled
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  turnDurationMs: 30000,
  maxLives: 1,
  jokersEnabled: false,
  jokerSelectionMode: 'aleatoire',
  hintsEnabled: true,
  teamsEnabled: false,
  teamCount: 2,
  eliminationMode: 'vies',
};

export function getTeamIds(teamCount: number): string[] {
  return Array.from({ length: teamCount }, (_, i) => `team-${i}`);
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
  settings: GameSettings;
  readyPlayerIds: string[];
  teamErrorsRemaining?: Record<string, number>; // teamId -> pool d'erreurs partagé restant (mode ERREURS)
  turnJokerState?: {
    shieldActive?: boolean;
    comboArtistsPlayed?: number;
    archivesRevealedPlayerId?: string;
  };
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
