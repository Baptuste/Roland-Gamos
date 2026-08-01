import { ScoringDetails } from '../types/SoloMove';

/**
 * Points de base pour chaque coup valide
 */
const BASE_POINTS = 100;

/**
 * Plafond de score maximum par tour (au-delà = "Dépassement")
 */
const SCORE_CAP = 300;

/**
 * 7 paliers de popularité, calculés en quantiles relatifs sur artists.lastfm_listeners
 * (npm run popularity:lastfm) — remplace l'ancien système à 5 paliers basé sur
 * fr_collab_count (CLAUDE_3.md §2.5). 'confidentiel' et 'connu' sont les 2 paliers
 * ajoutés ; les 5 autres gardent leurs noms et multiplicateurs d'origine pour ne pas
 * casser une éventuelle config SOLO_MIN_ARTIST_CATEGORY déjà déployée.
 */
export type ArtistCategory =
  | 'ultra_mainstream'
  | 'mainstream'
  | 'connu'
  | 'intermediate'
  | 'niche'
  | 'underground'
  | 'confidentiel';

/**
 * Entrées nécessaires au calcul du score d'un coup.
 * Aucune dépendance MBID/DB — toutes les valeurs viennent de GameDataStore + du contexte de partie.
 */
export interface ScoreInput {
  category: ArtistCategory;
  collabDegree: number; // nombre de collaborateurs distincts de l'artiste proposé
  pairFamilyCount: number; // nombre de familles de titres communes entre l'artiste précédent et le proposé
  turnNumber: number; // longueur de la chaîne après ce coup (1-based)
  fractionElapsed: number; // 0..1, fraction du temps de tour déjà écoulée
}

/**
 * Service de calcul de score — fonction pure, testable et réutilisable
 * (Solo Infini, Solo vs Bot, et potentiellement Multijoueur plus tard).
 *
 * Formule (CLAUDE_3.md §2.2) :
 *   base = 100 + timeBonus + chainBonus
 *   raw  = base × categoryMult × degreeMult × pairMult
 *   finalScore = min(round(raw), 300)
 *   overflow   = max(0, round(raw) - 300)
 */
export class ScoringService {
  calculateScore(input: ScoreInput): ScoringDetails {
    const timeBonus = this.calculateTimeBonus(input.fractionElapsed);
    const chainBonus = this.calculateChainBonus(input.turnNumber);
    const base = BASE_POINTS + timeBonus + chainBonus;

    const categoryBonus = this.calculateCategoryMult(input.category);
    const degreeBonus = this.calculateDegreeMult(input.collabDegree);
    const pairBonus = this.calculatePairMult(input.pairFamilyCount);

    const raw = base * categoryBonus * degreeBonus * pairBonus;
    const rounded = Math.round(raw);
    const finalScore = Math.min(rounded, SCORE_CAP);
    const overflow = Math.max(0, rounded - SCORE_CAP);

    return {
      basePoints: BASE_POINTS,
      pairBonus,
      degreeBonus,
      categoryBonus,
      timeBonus,
      chainBonus,
      finalScore,
      overflow,
      pairFamilyCount: input.pairFamilyCount,
      degree: input.collabDegree,
      category: input.category,
      timeSpent: input.fractionElapsed,
      chainLength: input.turnNumber,
    };
  }

  /**
   * Bonus de temps additif selon la fraction du temps de tour écoulée.
   * - <20%  → +50
   * - <40%  → +35
   * - <60%  → +20
   * - <80%  → +10
   * - sinon → +0
   */
  private calculateTimeBonus(fractionElapsed: number): number {
    if (fractionElapsed < 0.2) return 50;
    if (fractionElapsed < 0.4) return 35;
    if (fractionElapsed < 0.6) return 20;
    if (fractionElapsed < 0.8) return 10;
    return 0;
  }

  /**
   * Bonus de chaîne additif selon la longueur de la chaîne.
   * - ≥20 → +60
   * - ≥15 → +40
   * - ≥10 → +25
   * - ≥5  → +10
   * - <5  → +0
   */
  private calculateChainBonus(turnNumber: number): number {
    if (turnNumber >= 20) return 60;
    if (turnNumber >= 15) return 40;
    if (turnNumber >= 10) return 25;
    if (turnNumber >= 5) return 10;
    return 0;
  }

  /**
   * Multiplicateur de catégorie — pick obscur = bonus élevé (sens corrigé, CLAUDE_3.md §1).
   */
  private calculateCategoryMult(category: ArtistCategory): number {
    const bonuses: Record<ArtistCategory, number> = {
      confidentiel: 1.15,
      underground: 1.12,
      niche: 1.08,
      intermediate: 1.04,
      connu: 1.03,
      mainstream: 1.02,
      ultra_mainstream: 1.00,
    };
    return bonuses[category];
  }

  /**
   * Multiplicateur de degré (nombre de collaborateurs distincts).
   * - 0–10   → 1.05
   * - 11–25  → 1.03
   * - 26–60  → 1.01
   * - >60    → 1.00
   */
  private calculateDegreeMult(collabDegree: number): number {
    if (collabDegree <= 10) return 1.05;
    if (collabDegree <= 25) return 1.03;
    if (collabDegree <= 60) return 1.01;
    return 1.00;
  }

  /**
   * Multiplicateur de paire (familles de titres communes entre les deux artistes).
   * - 0       → 1.00 (pas de collaboration = pas de bonus)
   * - 1       → 1.30
   * - 2–3     → 1.18
   * - 4–7     → 1.08
   * - 8–15    → 1.03
   * - >15     → 1.00
   */
  private calculatePairMult(pairFamilyCount: number): number {
    if (pairFamilyCount === 0) return 1.00;
    if (pairFamilyCount === 1) return 1.30;
    if (pairFamilyCount <= 3) return 1.18;
    if (pairFamilyCount <= 7) return 1.08;
    if (pairFamilyCount <= 15) return 1.03;
    return 1.00;
  }
}

// Instance singleton
export const scoringService = new ScoringService();
