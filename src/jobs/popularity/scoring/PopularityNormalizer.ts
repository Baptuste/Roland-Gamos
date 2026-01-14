/**
 * Service de normalisation des métriques de popularité
 * Transforme les valeurs brutes en scores normalisés [0..1]
 */

import { ArtistPopularityRaw } from '../types';

/**
 * Statistiques min/max pour la normalisation
 * Ces valeurs doivent être calculées OFFLINE sur l'ensemble des données
 */
export interface NormalizationStats {
  listenbrainz: { min: number; max: number };
  wikidata_sitelinks: { min: number; max: number };
  wikipedia_pageviews: { min: number; max: number };
  musicbrainz_recordings: { min: number; max: number };
  musicbrainz_releases: { min: number; max: number };
  musicbrainz_relations: { min: number; max: number };
}

/**
 * Service de normalisation des métriques
 */
export class PopularityNormalizer {
  private stats: NormalizationStats;

  constructor(stats: NormalizationStats) {
    this.stats = stats;
  }

  /**
   * Calcule les statistiques de normalisation depuis les données brutes
   * À exécuter OFFLINE avant le calcul des scores
   */
  static calculateStats(rawData: ArtistPopularityRaw[]): NormalizationStats {
    // Filtrer les valeurs nulles et appliquer log1p
    const listenbrainzValues = rawData
      .map(d => d.listenbrainz_listens_365d)
      .filter((v): v is number => v !== null)
      .map(v => Math.log1p(v));

    const sitelinksValues = rawData
      .map(d => d.wikidata_sitelinks)
      .filter((v): v is number => v !== null)
      .map(v => Math.log1p(v));

    const pageviewsValues = rawData
      .map(d => d.wikipedia_pageviews_365d)
      .filter((v): v is number => v !== null)
      .map(v => Math.log1p(v));

    const recordingsValues = rawData
      .map(d => d.musicbrainz_recordings_count)
      .filter((v): v is number => v !== null)
      .map(v => Math.log1p(v));

    const releasesValues = rawData
      .map(d => d.musicbrainz_release_count)
      .filter((v): v is number => v !== null)
      .map(v => Math.log1p(v));

    const relationsValues = rawData
      .map(d => d.musicbrainz_relations_count)
      .filter((v): v is number => v !== null)
      .map(v => Math.log1p(v));

    // Calculer min/max pour chaque métrique
    const getMinMax = (values: number[]) => {
      if (values.length === 0) {
        return { min: 0, max: 1 };
      }
      return {
        min: Math.min(...values),
        max: Math.max(...values),
      };
    };

    return {
      listenbrainz: getMinMax(listenbrainzValues),
      wikidata_sitelinks: getMinMax(sitelinksValues),
      wikipedia_pageviews: getMinMax(pageviewsValues),
      musicbrainz_recordings: getMinMax(recordingsValues),
      musicbrainz_releases: getMinMax(releasesValues),
      musicbrainz_relations: getMinMax(relationsValues),
    };
  }

  /**
   * Normalise une valeur avec log1p puis min/max
   */
  private normalize(value: number | null, min: number, max: number): number | null {
    if (value === null || value < 0) {
      return null;
    }

    const transformed = Math.log1p(value);
    const range = max - min;
    
    if (range === 0) {
      return 0.5; // Si toutes les valeurs sont identiques
    }

    // Normaliser entre 0 et 1
    const normalized = (transformed - min) / range;
    
    // Clamper strictement entre 0 et 1
    return Math.max(0, Math.min(1, normalized));
  }

  /**
   * Normalise toutes les métriques d'une donnée brute
   */
  normalizeRaw(raw: ArtistPopularityRaw): {
    listenbrainz_norm: number | null;
    wikidata_sitelinks_norm: number | null;
    wikipedia_pageviews_norm: number | null;
    musicbrainz_recordings_norm: number | null;
    musicbrainz_releases_norm: number | null;
    musicbrainz_relations_norm: number | null;
  } {
    return {
      listenbrainz_norm: this.normalize(
        raw.listenbrainz_listens_365d,
        this.stats.listenbrainz.min,
        this.stats.listenbrainz.max
      ),
      wikidata_sitelinks_norm: this.normalize(
        raw.wikidata_sitelinks,
        this.stats.wikidata_sitelinks.min,
        this.stats.wikidata_sitelinks.max
      ),
      wikipedia_pageviews_norm: this.normalize(
        raw.wikipedia_pageviews_365d,
        this.stats.wikipedia_pageviews.min,
        this.stats.wikipedia_pageviews.max
      ),
      musicbrainz_recordings_norm: this.normalize(
        raw.musicbrainz_recordings_count,
        this.stats.musicbrainz_recordings.min,
        this.stats.musicbrainz_recordings.max
      ),
      musicbrainz_releases_norm: this.normalize(
        raw.musicbrainz_release_count,
        this.stats.musicbrainz_releases.min,
        this.stats.musicbrainz_releases.max
      ),
      musicbrainz_relations_norm: this.normalize(
        raw.musicbrainz_relations_count,
        this.stats.musicbrainz_relations.min,
        this.stats.musicbrainz_relations.max
      ),
    };
  }
}
