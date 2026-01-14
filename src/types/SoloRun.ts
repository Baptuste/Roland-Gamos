import { CanonicalArtist } from './Game';
import { SoloMove } from './SoloMove';

/**
 * État d'une run solo
 */
export enum SoloRunStatus {
  IN_PROGRESS = 'in_progress',
  FINISHED = 'finished',
}

/**
 * Représente une run solo infinie
 */
export interface SoloRun {
  id: string;
  status: SoloRunStatus;
  playerName: string;
  seedArtist: CanonicalArtist; // Artiste de départ choisi par le serveur
  currentArtist: CanonicalArtist | null; // Artiste actuel (dernier joué)
  usedArtists: string[]; // Identifiants canoniques utilisés (MBID prioritaire, sinon nom)
  moves: SoloMove[]; // Historique des coups
  currentTurn: number; // Numéro du tour actuel (commence à 1)
  currentTurnEndsAt?: number; // Timestamp (epoch ms) de fin du tour actuel
  totalScore: number; // Score total accumulé
  startedAt: number; // Timestamp de début de la run
  endedAt?: number; // Timestamp de fin de la run
  endReason?: 'INVALID_FEAT' | 'REPEAT' | 'TIMEOUT' | 'OTHER'; // Raison de fin
}

/**
 * Crée une nouvelle run solo
 */
export function createSoloRun(
  id: string,
  playerName: string,
  seedArtist: CanonicalArtist
): SoloRun {
  return {
    id,
    status: SoloRunStatus.IN_PROGRESS,
    playerName,
    seedArtist,
    currentArtist: seedArtist,
    usedArtists: [seedArtist.mbid || seedArtist.name],
    moves: [],
    currentTurn: 1,
    totalScore: 0,
    startedAt: Date.now(),
  };
}
