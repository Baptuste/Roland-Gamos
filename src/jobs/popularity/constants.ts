/**
 * Constantes pour le système de popularité
 */

/**
 * Version du modèle de scoring
 */
export const SCORING_MODEL_VERSION = 'v1';

/**
 * Version des tiers de popularité
 */
export const TIER_VERSION = 'v1';

/**
 * Pondérations fixes pour le calcul du score (v1)
 */
export const SCORE_WEIGHTS = {
  LISTENBRAINZ: 0.50,
  WIKIPEDIA_WIKIDATA: 0.30,
  MUSICBRAINZ: 0.20,
} as const;

/**
 * Pondérations pour Wikipedia/Wikidata
 */
export const WIKIPEDIA_WEIGHTS = {
  SITELINKS: 0.70,
  PAGEVIEWS: 0.30,
} as const;

/**
 * Seuils de quantiles pour les tiers
 */
export const QUANTILE_THRESHOLDS = {
  Q20: 0.20,
  Q40: 0.40,
  Q60: 0.60,
  Q80: 0.80,
} as const;

/**
 * Mapping des tiers selon les quantiles
 */
export const TIER_MAPPING: Array<{
  tier: 'UNDERGROUND' | 'NICHE' | 'POPULAR' | 'MAINSTREAM' | 'ULTRA_MAINSTREAM';
  minQuantile: number;
  maxQuantile: number;
}> = [
  { tier: 'UNDERGROUND', minQuantile: 0, maxQuantile: QUANTILE_THRESHOLDS.Q20 },
  { tier: 'NICHE', minQuantile: QUANTILE_THRESHOLDS.Q20, maxQuantile: QUANTILE_THRESHOLDS.Q40 },
  { tier: 'POPULAR', minQuantile: QUANTILE_THRESHOLDS.Q40, maxQuantile: QUANTILE_THRESHOLDS.Q60 },
  { tier: 'MAINSTREAM', minQuantile: QUANTILE_THRESHOLDS.Q60, maxQuantile: QUANTILE_THRESHOLDS.Q80 },
  { tier: 'ULTRA_MAINSTREAM', minQuantile: QUANTILE_THRESHOLDS.Q80, maxQuantile: 1.0 },
];

/**
 * Configuration par défaut pour les jobs
 */
export const DEFAULT_JOB_CONFIG = {
  batchSize: 100,
  retryAttempts: 3,
  retryDelay: 1000, // ms
  timeout: 30000, // 30s
} as const;

/**
 * URLs des APIs externes
 */
export const API_URLS = {
  LISTENBRAINZ: 'https://api.listenbrainz.org/1',
  WIKIDATA: 'https://query.wikidata.org/sparql',
  WIKIPEDIA_PAGEVIEWS: 'https://wikimedia.org/api/rest_v1',
  MUSICBRAINZ: 'https://musicbrainz.org/ws/2',
} as const;

/**
 * User-Agent pour les requêtes API
 */
export const API_USER_AGENT = 'RolandGamos/1.0.0 (https://github.com/roland-gamos)';
