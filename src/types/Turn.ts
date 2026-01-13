/**
 * Source de validation
 */
export type ValidationSource = 'musicbrainz' | 'wikidata_fallback';

/**
 * Raison d'invalidité
 */
export type InvalidReason = 'REPEAT' | 'TIMEOUT' | 'NO_RELATION' | 'NOT_FOUND' | 'SINGLE_CIRCULAR' | 'OTHER';

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
  invalidReason?: InvalidReason
): Turn {
  return {
    playerId,
    artistName,
    isValid,
    timestamp: new Date(),
    attemptNumber,
    validationSource,
    invalidReason,
  };
}
