/**
 * Types pour le système de popularité des artistes
 */

/**
 * Données brutes récupérées depuis les sources externes
 */
export interface ArtistPopularityRaw {
  artist_id: string;
  mbid: string | null;
  listenbrainz_listens_365d: number | null;
  wikidata_sitelinks: number | null;
  wikipedia_pageviews_365d: number | null;
  musicbrainz_recordings_count: number | null;
  musicbrainz_release_count: number | null;
  musicbrainz_relations_count: number | null;
  sources_json: Record<string, any>;
  fetched_at: Date;
}

/**
 * Score de popularité calculé (0..1)
 */
export interface ArtistPopularityScore {
  artist_id: string;
  score: number; // Strictement borné entre 0 et 1
  components_json: ScoreComponents;
  computed_at: Date;
}

/**
 * Composants détaillés du score
 */
export interface ScoreComponents {
  version: string; // Version du modèle (ex: "v1")
  raw: {
    listenbrainz_listens_365d: number | null;
    wikidata_sitelinks: number | null;
    wikipedia_pageviews_365d: number | null;
    musicbrainz_recordings_count: number | null;
    musicbrainz_release_count: number | null;
    musicbrainz_relations_count: number | null;
  };
  transformed: {
    listenbrainz_log1p: number | null;
    wikidata_sitelinks_log1p: number | null;
    wikipedia_pageviews_log1p: number | null;
    musicbrainz_recordings_log1p: number | null;
    musicbrainz_release_log1p: number | null;
    musicbrainz_relations_log1p: number | null;
  };
  normalized: {
    listenbrainz_norm: number | null;
    wikidata_sitelinks_norm: number | null;
    wikipedia_pageviews_norm: number | null;
    musicbrainz_norm: number | null;
  };
  weights: {
    listenbrainz: number;
    wikipedia_wikidata: number;
    musicbrainz: number;
  };
  sub_scores: {
    listenbrainz_score: number;
    wikipedia_wikidata_score: number;
    musicbrainz_score: number;
  };
}

/**
 * Tier de popularité assigné par quantiles
 */
export type PopularityTier = 
  | 'ULTRA_MAINSTREAM'
  | 'MAINSTREAM'
  | 'POPULAR'
  | 'NICHE'
  | 'UNDERGROUND';

/**
 * Tier assigné à un artiste
 */
export interface ArtistPopularityTier {
  artist_id: string;
  tier: PopularityTier;
  quantile: number; // Position dans la distribution (0..1)
  tier_version: string; // Version de la distribution (ex: "v1")
  assigned_at: Date;
}

/**
 * Quantiles calculés pour une version de distribution
 */
export interface PopularityQuantiles {
  tier_version: string;
  q20: number; // Quantile 20%
  q40: number; // Quantile 40%
  q60: number; // Quantile 60%
  q80: number; // Quantile 80%
  computed_at: Date;
}

/**
 * Résultat d'une ingestion pour un artiste
 */
export interface IngestResult {
  artist_id: string;
  success: boolean;
  error?: string;
  data?: Partial<ArtistPopularityRaw>;
}

/**
 * Configuration pour un job d'ingestion
 */
export interface IngestJobConfig {
  batchSize?: number;
  retryAttempts?: number;
  retryDelay?: number;
  timeout?: number;
}
