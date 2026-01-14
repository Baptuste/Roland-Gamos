import { ScoringDetails } from '../types/SoloMove';
import { pairStatsProvider } from './providers/PairStatsProvider';
import { degreeProvider } from './providers/DegreeProvider';
import { popularityCategoryProvider, PopularityCategory } from './providers/PopularityCategoryProvider';

/**
 * Points de base pour chaque coup valide
 */
const BASE_POINTS = 100;

/**
 * Plafond de score maximum par tour
 */
const SCORE_CAP = 280;

/**
 * Service de calcul de score
 * Fonction pure, testable et réutilisable en Solo et Multi
 */
export class ScoringService {
  /**
   * Calcule le score d'un coup selon toutes les règles de bonus
   * 
   * @param previousArtistMbid MBID de l'artiste précédent
   * @param currentArtistMbid MBID de l'artiste proposé
   * @param turnNumber Numéro du tour (commence à 1)
   * @param timeSpentSeconds Temps écoulé en secondes depuis le début du tour
   * @returns Détails du scoring avec tous les bonus appliqués
   */
  calculateScore(
    previousArtistMbid: string,
    currentArtistMbid: string,
    turnNumber: number,
    timeSpentSeconds: number
  ): ScoringDetails {
    // 1. PAIR BONUS (fréquence du duo)
    const pairFamilyCount = pairStatsProvider.getPairFamilyCount(
      previousArtistMbid,
      currentArtistMbid
    );
    const pairBonus = this.calculatePairBonus(pairFamilyCount);

    // 2. DEGREE BONUS (soft)
    const degree = degreeProvider.getDegree(currentArtistMbid);
    const degreeBonus = this.calculateDegreeBonus(degree);

    // 3. CATEGORY BONUS (pré-calculé, stocké)
    const category = popularityCategoryProvider.getCategory(currentArtistMbid, degree);
    const categoryBonus = this.calculateCategoryBonus(category);

    // 4. TIME BONUS
    const timeBonus = this.calculateTimeBonus(timeSpentSeconds);

    // 5. CHAIN BONUS
    const chainBonus = this.calculateChainBonus(turnNumber);

    // Calcul du score final avec plafond
    const rawScore = BASE_POINTS * pairBonus * degreeBonus * categoryBonus * timeBonus * chainBonus;
    const finalScore = Math.min(Math.round(rawScore), SCORE_CAP);

    return {
      basePoints: BASE_POINTS,
      pairBonus,
      degreeBonus,
      categoryBonus,
      timeBonus,
      chainBonus,
      finalScore,
      pairFamilyCount,
      degree,
      category,
      timeSpent: timeSpentSeconds,
      chainLength: turnNumber,
    };
  }

  /**
   * Calcule le bonus de paire selon le nombre de familles communes
   * 
   * Règles :
   * - 1 famille        → 1.30
   * - 2–3 familles     → 1.18
   * - 4–7 familles     → 1.08
   * - 8–15 familles    → 1.03
   * - >15 familles     → 1.00
   */
  private calculatePairBonus(pairFamilyCount: number): number {
    if (pairFamilyCount === 0) {
      return 1.00; // Pas de collaboration = pas de bonus
    }
    if (pairFamilyCount === 1) {
      return 1.30;
    }
    if (pairFamilyCount >= 2 && pairFamilyCount <= 3) {
      return 1.18;
    }
    if (pairFamilyCount >= 4 && pairFamilyCount <= 7) {
      return 1.08;
    }
    if (pairFamilyCount >= 8 && pairFamilyCount <= 15) {
      return 1.03;
    }
    // >15 familles
    return 1.00;
  }

  /**
   * Calcule le bonus de degré selon la popularité de l'artiste
   * 
   * Règles :
   * - 0–10   → 1.05
   * - 11–25  → 1.03
   * - 26–60  → 1.01
   * - >60    → 1.00
   */
  private calculateDegreeBonus(degree: number): number {
    if (degree >= 0 && degree <= 10) {
      return 1.05;
    }
    if (degree >= 11 && degree <= 25) {
      return 1.03;
    }
    if (degree >= 26 && degree <= 60) {
      return 1.01;
    }
    // >60
    return 1.00;
  }

  /**
   * Calcule le bonus de catégorie selon la popularité
   * 
   * Règles :
   * - Ultra mainstream → 1.00
   * - Mainstream       → 1.02
   * - Connu            → 1.04
   * - Niche            → 1.08
   * - Underground      → 1.12
   */
  private calculateCategoryBonus(category: PopularityCategory): number {
    const bonuses: Record<PopularityCategory, number> = {
      ultra_mainstream: 1.00,
      mainstream: 1.02,
      connu: 1.04,
      niche: 1.08,
      underground: 1.12,
    };
    return bonuses[category];
  }

  /**
   * Calcule le bonus de temps selon la rapidité de réponse
   * 
   * Règles :
   * - ≤5s      → 1.20
   * - 6–10s    → 1.12
   * - 11–20s   → 1.06
   * - 21–35s   → 1.02
   * - >35s     → 1.00
   */
  private calculateTimeBonus(timeSpentSeconds: number): number {
    if (timeSpentSeconds <= 5) {
      return 1.20;
    }
    if (timeSpentSeconds >= 6 && timeSpentSeconds <= 10) {
      return 1.12;
    }
    if (timeSpentSeconds >= 11 && timeSpentSeconds <= 20) {
      return 1.06;
    }
    if (timeSpentSeconds >= 21 && timeSpentSeconds <= 35) {
      return 1.02;
    }
    // >35s
    return 1.00;
  }

  /**
   * Calcule le bonus de chaîne selon la longueur de la run
   * 
   * Formule :
   * palier = floor((tour - 1) / 5)
   * ChainBonus = 1 + min(0.20, 0.05 × palier)
   * 
   * Exemples :
   * - Tour 1-5:   palier 0 → 1.00
   * - Tour 6-10:  palier 1 → 1.05
   * - Tour 11-15: palier 2 → 1.10
   * - Tour 16-20: palier 3 → 1.15
   * - Tour 21+:   palier 4+ → 1.20 (plafond)
   */
  private calculateChainBonus(turnNumber: number): number {
    const palier = Math.floor((turnNumber - 1) / 5);
    const bonus = Math.min(0.20, 0.05 * palier);
    return 1 + bonus;
  }
}

// Instance singleton
export const scoringService = new ScoringService();
