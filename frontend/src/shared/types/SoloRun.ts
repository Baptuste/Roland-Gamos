import { CanonicalArtist } from './Game';
import { SoloMove } from './SoloMove';

export enum SoloRunStatus {
  IN_PROGRESS = 'in_progress',
  FINISHED = 'finished',
}

export interface SoloRun {
  id: string;
  status: SoloRunStatus;
  playerName: string;
  seedArtist: CanonicalArtist;
  currentArtist: CanonicalArtist | null;
  usedArtists: string[];
  moves: SoloMove[];
  currentTurn: number;
  currentTurnEndsAt?: number;
  totalScore: number;
  startedAt: number;
  endedAt?: number;
  endReason?: 'INVALID_FEAT' | 'REPEAT' | 'TIMEOUT' | 'OTHER';
}
