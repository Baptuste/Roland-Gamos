/**
 * Repository pour la gestion de la popularité des artistes
 * Abstraction pour permettre différentes implémentations de base de données
 */

import {
  ArtistPopularityRaw,
  ArtistPopularityScore,
  ArtistPopularityTier,
  PopularityQuantiles,
  PopularityTier,
} from './types';

/**
 * Interface abstraite du repository
 * À implémenter selon la base de données utilisée (PostgreSQL, SQLite, etc.)
 */
export interface IPopularityRepository {
  // Raw data
  saveRawData(data: ArtistPopularityRaw): Promise<void>;
  getRawData(artistId: string): Promise<ArtistPopularityRaw | null>;
  getAllRawData(): Promise<ArtistPopularityRaw[]>;
  getRawDataByMbid(mbid: string): Promise<ArtistPopularityRaw | null>;

  // Scores
  saveScore(score: ArtistPopularityScore): Promise<void>;
  getScore(artistId: string): Promise<ArtistPopularityScore | null>;
  getAllScores(): Promise<ArtistPopularityScore[]>;
  getScoresBatch(limit: number, offset: number): Promise<ArtistPopularityScore[]>;

  // Tiers
  saveTier(tier: ArtistPopularityTier): Promise<void>;
  getTier(artistId: string): Promise<ArtistPopularityTier | null>;
  getTierByMbid(mbid: string): Promise<ArtistPopularityTier | null>;
  getAllTiers(): Promise<ArtistPopularityTier[]>;
  getTiersByVersion(version: string): Promise<ArtistPopularityTier[]>;

  // Quantiles
  saveQuantiles(quantiles: PopularityQuantiles): Promise<void>;
  getQuantiles(version: string): Promise<PopularityQuantiles | null>;
  getLatestQuantiles(): Promise<PopularityQuantiles | null>;

  // Utilitaires
  initialize(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Implémentation en mémoire pour les tests et le développement
 * À remplacer par une implémentation réelle (PostgreSQL, SQLite, etc.)
 */
export class InMemoryPopularityRepository implements IPopularityRepository {
  private rawData: Map<string, ArtistPopularityRaw> = new Map();
  private scores: Map<string, ArtistPopularityScore> = new Map();
  private tiers: Map<string, ArtistPopularityTier> = new Map();
  private quantiles: Map<string, PopularityQuantiles> = new Map();

  async saveRawData(data: ArtistPopularityRaw): Promise<void> {
    this.rawData.set(data.artist_id, data);
  }

  async getRawData(artistId: string): Promise<ArtistPopularityRaw | null> {
    return this.rawData.get(artistId) || null;
  }

  async getAllRawData(): Promise<ArtistPopularityRaw[]> {
    return Array.from(this.rawData.values());
  }

  async getRawDataByMbid(mbid: string): Promise<ArtistPopularityRaw | null> {
    for (const data of this.rawData.values()) {
      if (data.mbid === mbid) {
        return data;
      }
    }
    return null;
  }

  async saveScore(score: ArtistPopularityScore): Promise<void> {
    this.scores.set(score.artist_id, score);
  }

  async getScore(artistId: string): Promise<ArtistPopularityScore | null> {
    return this.scores.get(artistId) || null;
  }

  async getAllScores(): Promise<ArtistPopularityScore[]> {
    return Array.from(this.scores.values());
  }

  async getScoresBatch(limit: number, offset: number): Promise<ArtistPopularityScore[]> {
    const allScores = Array.from(this.scores.values());
    return allScores.slice(offset, offset + limit);
  }

  async saveTier(tier: ArtistPopularityTier): Promise<void> {
    this.tiers.set(tier.artist_id, tier);
  }

  async getTier(artistId: string): Promise<ArtistPopularityTier | null> {
    return this.tiers.get(artistId) || null;
  }

  async getTierByMbid(mbid: string): Promise<ArtistPopularityTier | null> {
    // Pour trouver par MBID, on doit chercher dans les raw data d'abord
    const rawData = await this.getRawDataByMbid(mbid);
    if (!rawData) {
      return null;
    }
    return this.getTier(rawData.artist_id);
  }

  async getAllTiers(): Promise<ArtistPopularityTier[]> {
    return Array.from(this.tiers.values());
  }

  async getTiersByVersion(version: string): Promise<ArtistPopularityTier[]> {
    return Array.from(this.tiers.values()).filter(t => t.tier_version === version);
  }

  async saveQuantiles(quantiles: PopularityQuantiles): Promise<void> {
    this.quantiles.set(quantiles.tier_version, quantiles);
  }

  async getQuantiles(version: string): Promise<PopularityQuantiles | null> {
    return this.quantiles.get(version) || null;
  }

  async getLatestQuantiles(): Promise<PopularityQuantiles | null> {
    const allQuantiles = Array.from(this.quantiles.values());
    if (allQuantiles.length === 0) {
      return null;
    }
    // Retourner le plus récent
    return allQuantiles.sort((a, b) => 
      b.computed_at.getTime() - a.computed_at.getTime()
    )[0];
  }

  async initialize(): Promise<void> {
    // Pas d'initialisation nécessaire pour la mémoire
  }

  async close(): Promise<void> {
    // Pas de fermeture nécessaire pour la mémoire
  }
}

/**
 * Factory pour créer le repository selon la configuration
 * Par défaut, utilise l'implémentation en mémoire
 * À remplacer par une implémentation réelle en production
 */
export function createPopularityRepository(): IPopularityRepository {
  // TODO: Implémenter avec PostgreSQL pour Railway
  // const dbUrl = process.env.DATABASE_URL;
  // if (dbUrl) {
  //   return new PostgresPopularityRepository(dbUrl);
  // }
  
  // Pour l'instant, utiliser la mémoire
  console.warn('⚠️  Utilisation du repository en mémoire. Implémentez une base de données réelle pour la production.');
  return new InMemoryPopularityRepository();
}
