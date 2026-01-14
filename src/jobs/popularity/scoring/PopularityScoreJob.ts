/**
 * Job de calcul des scores de popularité
 * Exécuté UNIQUEMENT en background, jamais pendant une partie
 */

import { IPopularityRepository } from '../PopularityRepository';
import { PopularityNormalizer } from './PopularityNormalizer';
import {
  ArtistPopularityRaw,
  ArtistPopularityScore,
  ScoreComponents,
} from '../types';
import {
  SCORING_MODEL_VERSION,
  SCORE_WEIGHTS,
  WIKIPEDIA_WEIGHTS,
} from '../constants';

/**
 * Job pour calculer les scores de popularité depuis les données brutes
 */
export class PopularityScoreJob {
  private repository: IPopularityRepository;
  private normalizer: PopularityNormalizer | null = null;

  constructor(repository: IPopularityRepository) {
    this.repository = repository;
  }

  /**
   * Calcule et sauvegarde les scores pour tous les artistes
   */
  async computeAllScores(): Promise<void> {
    // 1. Récupérer toutes les données brutes
    const rawData = await this.repository.getAllRawData();
    
    if (rawData.length === 0) {
      console.warn('Aucune donnée brute disponible pour le calcul des scores');
      return;
    }

    // 2. Calculer les statistiques de normalisation
    console.log(JSON.stringify({
      level: 'info',
      job: 'popularity_score',
      step: 'calculating_normalization_stats',
      artists_count: rawData.length,
      timestamp: new Date().toISOString(),
    }));

    const normalizationStats = PopularityNormalizer.calculateStats(rawData);
    this.normalizer = new PopularityNormalizer(normalizationStats);

    // 3. Calculer le score pour chaque artiste
    console.log(JSON.stringify({
      level: 'info',
      job: 'popularity_score',
      step: 'computing_scores',
      timestamp: new Date().toISOString(),
    }));

    const scores: ArtistPopularityScore[] = [];

    for (const raw of rawData) {
      const score = this.computeScore(raw);
      scores.push(score);
    }

    // 4. Sauvegarder tous les scores
    for (const score of scores) {
      await this.repository.saveScore(score);
    }

    console.log(JSON.stringify({
      level: 'info',
      job: 'popularity_score',
      step: 'completed',
      scores_computed: scores.length,
      timestamp: new Date().toISOString(),
    }));
  }

  /**
   * Calcule le score pour un artiste unique
   */
  private computeScore(raw: ArtistPopularityRaw): ArtistPopularityScore {
    if (!this.normalizer) {
      throw new Error('Normalizer non initialisé. Appelez computeAllScores() d\'abord.');
    }

    // 1. Normaliser les métriques
    const normalized = this.normalizer.normalizeRaw(raw);

    // 2. Calculer les sous-scores
    const listenbrainzScore = normalized.listenbrainz_norm ?? 0;

    // Wikipedia/Wikidata: combinaison de sitelinks et pageviews
    let wikipediaWikidataScore = 0;
    if (normalized.wikidata_sitelinks_norm !== null || normalized.wikipedia_pageviews_norm !== null) {
      const sitelinks = normalized.wikidata_sitelinks_norm ?? 0;
      const pageviews = normalized.wikipedia_pageviews_norm ?? 0;
      
      if (normalized.wikipedia_pageviews_norm !== null) {
        // Les deux sont disponibles
        wikipediaWikidataScore = 
          WIKIPEDIA_WEIGHTS.SITELINKS * sitelinks +
          WIKIPEDIA_WEIGHTS.PAGEVIEWS * pageviews;
      } else {
        // Seulement sitelinks disponible, renormaliser à 100%
        wikipediaWikidataScore = sitelinks;
      }
    }

    // MusicBrainz: moyenne des métriques disponibles
    let musicbrainzScore = 0;
    const musicbrainzValues: number[] = [];
    if (normalized.musicbrainz_recordings_norm !== null) {
      musicbrainzValues.push(normalized.musicbrainz_recordings_norm);
    }
    if (normalized.musicbrainz_releases_norm !== null) {
      musicbrainzValues.push(normalized.musicbrainz_releases_norm);
    }
    if (normalized.musicbrainz_relations_norm !== null) {
      musicbrainzValues.push(normalized.musicbrainz_relations_norm);
    }
    
    if (musicbrainzValues.length > 0) {
      musicbrainzScore = musicbrainzValues.reduce((sum, v) => sum + v, 0) / musicbrainzValues.length;
    }

    // 3. Calculer le score final avec pondérations
    const finalScore = this.clamp01(
      SCORE_WEIGHTS.LISTENBRAINZ * listenbrainzScore +
      SCORE_WEIGHTS.WIKIPEDIA_WIKIDATA * wikipediaWikidataScore +
      SCORE_WEIGHTS.MUSICBRAINZ * musicbrainzScore
    );

    // 4. Construire les composants détaillés
    const components: ScoreComponents = {
      version: SCORING_MODEL_VERSION,
      raw: {
        listenbrainz_listens_365d: raw.listenbrainz_listens_365d,
        wikidata_sitelinks: raw.wikidata_sitelinks,
        wikipedia_pageviews_365d: raw.wikipedia_pageviews_365d,
        musicbrainz_recordings_count: raw.musicbrainz_recordings_count,
        musicbrainz_release_count: raw.musicbrainz_release_count,
        musicbrainz_relations_count: raw.musicbrainz_relations_count,
      },
      transformed: {
        listenbrainz_log1p: raw.listenbrainz_listens_365d !== null 
          ? Math.log1p(raw.listenbrainz_listens_365d) 
          : null,
        wikidata_sitelinks_log1p: raw.wikidata_sitelinks !== null
          ? Math.log1p(raw.wikidata_sitelinks)
          : null,
        wikipedia_pageviews_log1p: raw.wikipedia_pageviews_365d !== null
          ? Math.log1p(raw.wikipedia_pageviews_365d)
          : null,
        musicbrainz_recordings_log1p: raw.musicbrainz_recordings_count !== null
          ? Math.log1p(raw.musicbrainz_recordings_count)
          : null,
        musicbrainz_release_log1p: raw.musicbrainz_release_count !== null
          ? Math.log1p(raw.musicbrainz_release_count)
          : null,
        musicbrainz_relations_log1p: raw.musicbrainz_relations_count !== null
          ? Math.log1p(raw.musicbrainz_relations_count)
          : null,
      },
      normalized: {
        listenbrainz_norm: normalized.listenbrainz_norm,
        wikidata_sitelinks_norm: normalized.wikidata_sitelinks_norm,
        wikipedia_pageviews_norm: normalized.wikipedia_pageviews_norm,
        musicbrainz_norm: musicbrainzScore,
      },
      weights: {
        listenbrainz: SCORE_WEIGHTS.LISTENBRAINZ,
        wikipedia_wikidata: SCORE_WEIGHTS.WIKIPEDIA_WIKIDATA,
        musicbrainz: SCORE_WEIGHTS.MUSICBRAINZ,
      },
      sub_scores: {
        listenbrainz_score: listenbrainzScore,
        wikipedia_wikidata_score: wikipediaWikidataScore,
        musicbrainz_score: musicbrainzScore,
      },
    };

    return {
      artist_id: raw.artist_id,
      score: finalScore,
      components_json: components,
      computed_at: new Date(),
    };
  }

  /**
   * Clampe une valeur strictement entre 0 et 1
   */
  private clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }
}
