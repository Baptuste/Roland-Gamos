/**
 * Source de validation
 */
export type ValidationSource = 'musicbrainz' | 'wikidata_fallback' | 'local_store';

/**
 * Raison d'invalidité
 */
export type InvalidReason = 'REPEAT' | 'TIMEOUT' | 'NO_RELATION' | 'NOT_FOUND' | 'SINGLE_CIRCULAR' | 'OTHER';

import { JokerType } from './Player';

/**
 * Représente un tour de jeu
 */
export interface Turn {
  playerId: string;
  artistName: string;
  isValid: boolean;
  timestamp: Date;
  attemptNumber?: number;
  validationSource?: ValidationSource;
  invalidReason?: InvalidReason;
  jokerUsed?: JokerType; // joker activé pendant ce tour (ex: Skip), pour affichage historique
}

/**
 * Crée un nouveau tour
 */
export function createTurn(
  playerId: string,
  artistName: string,
  isValid: boolean,
  attemptNumber?: number,
  validationSource?: ValidationSource,
  invalidReason?: InvalidReason,
  jokerUsed?: JokerType
): Turn {
  return {
    playerId,
    artistName,
    isValid,
    timestamp: new Date(),
    attemptNumber,
    validationSource,
    invalidReason,
    jokerUsed,
  };
}
