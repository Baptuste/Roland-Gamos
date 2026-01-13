export type ValidationSource = 'musicbrainz' | 'wikidata_fallback';
export type InvalidReason = 'REPEAT' | 'TIMEOUT' | 'NO_RELATION' | 'NOT_FOUND' | 'SINGLE_CIRCULAR' | 'OTHER';

export interface Turn {
  playerId: string;
  artistName: string;
  isValid: boolean;
  timestamp: Date;
  attemptNumber?: number;
  validationSource?: ValidationSource;
  invalidReason?: InvalidReason;
}

export function createTurn(
  playerId: string,
  artistName: string,
  isValid: boolean
): Turn {
  return {
    playerId,
    artistName,
    isValid,
    timestamp: new Date(),
  };
}
