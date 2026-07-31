import { Player } from './Player';
import { Turn } from './Turn';

/**
 * État d'une partie
 */
export enum GameStatus {
  WAITING = 'waiting',
  IN_PROGRESS = 'in_progress',
  FINISHED = 'finished',
}

/**
 * Identité canonique d'un artiste
 */
export interface CanonicalArtist {
  name: string;
  mbid?: string;   // MusicBrainz ID (prioritaire)
  qid?: string;    // Wikidata QID (fallback)
  gameId?: number; // ID interne GameDataStore (validation locale)
}

/**
 * Réglages d'une partie, configurables par l'hôte tant que status === WAITING.
 * Défauts choisis pour reproduire exactement l'ancien comportement fixe
 * (30s par tour, 1 vie = élimination immédiate) — voir CLAUDE_3.md §7.1.
 */
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

/**
 * Représente une partie de jeu
 */
export interface Game {
  id: string;
  status: GameStatus;
  players: Player[];
  turns: Turn[];
  currentPlayerIndex: number;
  lastArtistName: string | null; // Legacy - gardé pour compatibilité
  lastArtist?: CanonicalArtist;   // Nouveau - identité canonique
  usedArtists: string[];          // Identifiants canoniques utilisés (MBID prioritaire, sinon nom)
  currentTurnEndsAt?: number;     // Timestamp (epoch ms) de fin du tour actuel
  attemptsUsed?: number;          // Nombre de tentatives utilisées par le joueur actuel
  settings: GameSettings;
  readyPlayerIds: string[];       // joueurs non-hôtes ayant appuyé sur PRÊT
}

/**
 * Crée une nouvelle partie
 */
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
    usedArtists: [],
    attemptsUsed: 0,
    settings,
    readyPlayerIds: [],
  };
}
