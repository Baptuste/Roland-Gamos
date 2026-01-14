import { CanonicalArtist } from './Game';

export type PopularityCategory = 'ultra_mainstream' | 'mainstream' | 'connu' | 'niche' | 'underground';

export interface ScoringDetails {
  basePoints: number;
  pairBonus: number;
  degreeBonus: number;
  categoryBonus: number;
  timeBonus: number;
  chainBonus: number;
  finalScore: number;
  pairFamilyCount: number;
  degree: number;
  category: PopularityCategory;
  timeSpent: number;
  chainLength: number;
}

export interface SoloMove {
  turn: number;
  artist: CanonicalArtist;
  previousArtist: CanonicalArtist;
  isValid: boolean;
  timestamp: number;
  validationSource?: 'musicbrainz' | 'wikidata_fallback';
  invalidReason?: 'INVALID_FEAT' | 'REPEAT' | 'TIMEOUT' | 'NOT_FOUND' | 'OTHER';
  scoring?: ScoringDetails;
}
