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
  mbid?: string; // MusicBrainz ID (prioritaire)
  qid?: string;  // Wikidata QID (fallback)
}

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
}

/**
 * Crée une nouvelle partie
 */
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
    usedArtists: [],
    attemptsUsed: 0,
  };
}
