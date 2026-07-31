import { CanonicalArtist } from './Game';

/**
 * Détails de scoring pour un coup
 */
export interface ScoringDetails {
  basePoints: number;
  pairBonus: number; // multiplicateur pairMult
  degreeBonus: number; // multiplicateur degreeMult
  categoryBonus: number; // multiplicateur categoryMult
  timeBonus: number; // bonus additif (points)
  chainBonus: number; // bonus additif (points)
  finalScore: number; // Score après application du plafond (300)
  overflow: number; // Montant au-dessus du plafond (0 si pas de dépassement)
  pairFamilyCount: number; // Nombre de familles communes entre A et B
  degree: number; // collab_degree de l'artiste proposé
  category: 'ultra_mainstream' | 'mainstream' | 'intermediate' | 'niche' | 'underground';
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
  validationSource?: 'musicbrainz' | 'wikidata_fallback' | 'local_store';
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
  validationSource?: 'musicbrainz' | 'wikidata_fallback' | 'local_store',
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
