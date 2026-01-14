/**
 * Job de calcul des quantiles et attribution des tiers
 * Exécuté UNIQUEMENT en background, jamais pendant une partie
 */

import { IPopularityRepository } from '../PopularityRepository';
import {
  ArtistPopularityScore,
  ArtistPopularityTier,
  PopularityQuantiles,
  PopularityTier,
} from '../types';
import {
  TIER_VERSION,
  QUANTILE_THRESHOLDS,
  TIER_MAPPING,
} from '../constants';

/**
 * Job pour calculer les quantiles et assigner les tiers
 */
export class PopularityQuantilesJob {
  private repository: IPopularityRepository;

  constructor(repository: IPopularityRepository) {
    this.repository = repository;
  }

  /**
   * Calcule les quantiles et assigne les tiers pour tous les artistes
   */
  async computeQuantilesAndTiers(): Promise<void> {
    // 1. Récupérer tous les scores
    const scores = await this.repository.getAllScores();
    
    if (scores.length === 0) {
      console.warn('Aucun score disponible pour le calcul des quantiles');
      return;
    }

    console.log(JSON.stringify({
      level: 'info',
      job: 'popularity_quantiles',
      step: 'computing_quantiles',
      scores_count: scores.length,
      timestamp: new Date().toISOString(),
    }));

    // 2. Trier les scores par ordre croissant
    const sortedScores = [...scores].sort((a, b) => a.score - b.score);

    // 3. Calculer les quantiles
    const quantiles = this.computeQuantiles(sortedScores);

    // 4. Sauvegarder les quantiles
    await this.repository.saveQuantiles(quantiles);

    console.log(JSON.stringify({
      level: 'info',
      job: 'popularity_quantiles',
      step: 'quantiles_computed',
      q20: quantiles.q20,
      q40: quantiles.q40,
      q60: quantiles.q60,
      q80: quantiles.q80,
      timestamp: new Date().toISOString(),
    }));

    // 5. Assigner les tiers à chaque artiste
    console.log(JSON.stringify({
      level: 'info',
      job: 'popularity_quantiles',
      step: 'assigning_tiers',
      timestamp: new Date().toISOString(),
    }));

    const tiers: ArtistPopularityTier[] = [];

    for (const score of scores) {
      const tier = this.assignTier(score, quantiles);
      tiers.push(tier);
    }

    // 6. Sauvegarder tous les tiers
    for (const tier of tiers) {
      await this.repository.saveTier(tier);
    }

    // 7. Compter les artistes par tier
    const tierCounts: Record<PopularityTier, number> = {
      UNDERGROUND: 0,
      NICHE: 0,
      POPULAR: 0,
      MAINSTREAM: 0,
      ULTRA_MAINSTREAM: 0,
    };

    for (const tier of tiers) {
      tierCounts[tier.tier]++;
    }

    console.log(JSON.stringify({
      level: 'info',
      job: 'popularity_quantiles',
      step: 'completed',
      tiers_assigned: tiers.length,
      tier_distribution: tierCounts,
      timestamp: new Date().toISOString(),
    }));
  }

  /**
   * Calcule les quantiles q20, q40, q60, q80
   */
  private computeQuantiles(sortedScores: ArtistPopularityScore[]): PopularityQuantiles {
    const n = sortedScores.length;

    // Fonction pour obtenir le quantile à un percentile donné
    const getQuantile = (percentile: number): number => {
      const index = Math.floor((percentile / 100) * (n - 1));
      const lower = sortedScores[index].score;
      const upper = sortedScores[Math.min(index + 1, n - 1)].score;
      
      // Interpolation linéaire si nécessaire
      const fraction = (percentile / 100) * (n - 1) - index;
      return lower + fraction * (upper - lower);
    };

    return {
      tier_version: TIER_VERSION,
      q20: getQuantile(20),
      q40: getQuantile(40),
      q60: getQuantile(60),
      q80: getQuantile(80),
      computed_at: new Date(),
    };
  }

  /**
   * Assign un tier à un artiste selon son score et les quantiles
   */
  private assignTier(
    score: ArtistPopularityScore,
    quantiles: PopularityQuantiles
  ): ArtistPopularityTier {
    // Trouver le tier correspondant selon les quantiles
    let tier: PopularityTier = 'UNDERGROUND';
    let quantile = 0;

    if (score.score < quantiles.q20) {
      tier = 'UNDERGROUND';
      quantile = score.score / quantiles.q20 * QUANTILE_THRESHOLDS.Q20;
    } else if (score.score < quantiles.q40) {
      tier = 'NICHE';
      quantile = QUANTILE_THRESHOLDS.Q20 + 
        ((score.score - quantiles.q20) / (quantiles.q40 - quantiles.q20)) * 
        (QUANTILE_THRESHOLDS.Q40 - QUANTILE_THRESHOLDS.Q20);
    } else if (score.score < quantiles.q60) {
      tier = 'POPULAR';
      quantile = QUANTILE_THRESHOLDS.Q40 + 
        ((score.score - quantiles.q40) / (quantiles.q60 - quantiles.q40)) * 
        (QUANTILE_THRESHOLDS.Q60 - QUANTILE_THRESHOLDS.Q40);
    } else if (score.score < quantiles.q80) {
      tier = 'MAINSTREAM';
      quantile = QUANTILE_THRESHOLDS.Q60 + 
        ((score.score - quantiles.q60) / (quantiles.q80 - quantiles.q60)) * 
        (QUANTILE_THRESHOLDS.Q80 - QUANTILE_THRESHOLDS.Q60);
    } else {
      tier = 'ULTRA_MAINSTREAM';
      quantile = QUANTILE_THRESHOLDS.Q80 + 
        ((score.score - quantiles.q80) / (1 - quantiles.q80)) * 
        (1 - QUANTILE_THRESHOLDS.Q80);
    }

    // Clamper le quantile entre 0 et 1
    quantile = Math.max(0, Math.min(1, quantile));

    return {
      artist_id: score.artist_id,
      tier,
      quantile,
      tier_version: TIER_VERSION,
      assigned_at: new Date(),
    };
  }
}
