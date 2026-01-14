import { CanonicalArtist } from './Game';

/**
 * Détails de scoring pour un coup
 */
export interface ScoringDetails {
  basePoints: number;
  pairBonus: number;
  degreeBonus: number;
  categoryBonus: number;
  timeBonus: number;
  chainBonus: number;
  finalScore: number; // Score après application du plafond
  pairFamilyCount: number; // Nombre de familles communes entre A et B
  degree: number; // Degré de popularité de l'artiste proposé
  category: 'ultra_mainstream' | 'mainstream' | 'connu' | 'niche' | 'underground';
  timeSpent: number; // Temps en secondes
  chainLength: number; // Longueur de la chaîne (tour actuel)
}

/**
 * Représente un coup dans une run solo
 */
export interface SoloMove {
  turn: number; // Numéro du tour (commence à 1)
  artist: CanonicalArtist; // Artiste proposé
  previousArtist: CanonicalArtist; // Artiste précédent
  isValid: boolean;
  timestamp: number; // Timestamp du coup
  validationSource?: 'musicbrainz' | 'wikidata_fallback';
  invalidReason?: 'INVALID_FEAT' | 'REPEAT' | 'TIMEOUT' | 'NOT_FOUND' | 'OTHER';
  scoring?: ScoringDetails; // Présent uniquement si isValid === true
}

/**
 * Crée un nouveau coup solo
 */
export function createSoloMove(
  turn: number,
  artist: CanonicalArtist,
  previousArtist: CanonicalArtist,
  isValid: boolean,
  validationSource?: 'musicbrainz' | 'wikidata_fallback',
  invalidReason?: 'INVALID_FEAT' | 'REPEAT' | 'TIMEOUT' | 'NOT_FOUND' | 'OTHER',
  scoring?: ScoringDetails
): SoloMove {
  return {
    turn,
    artist,
    previousArtist,
    isValid,
    timestamp: Date.now(),
    validationSource,
    invalidReason,
    scoring,
  };
}
