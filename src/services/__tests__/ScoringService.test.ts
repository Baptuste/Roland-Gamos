import { ScoringService, ScoreInput } from '../ScoringService';

describe('ScoringService', () => {
  const service = new ScoringService();

  const baseInput: ScoreInput = {
    category: 'ultra_mainstream',
    collabDegree: 100, // >60 → mult 1.00
    pairFamilyCount: 0, // → mult 1.00
    turnNumber: 1, // <5 → chainBonus 0
    fractionElapsed: 1, // >=80% → timeBonus 0
  };

  it('applique le score de base sans bonus (pire cas sur chaque axe)', () => {
    const result = service.calculateScore(baseInput);
    // base = 100 + 0 + 0 = 100 ; tous les mult = 1.00
    expect(result.finalScore).toBe(100);
    expect(result.overflow).toBe(0);
  });

  describe('timeBonus (fraction du temps de tour écoulée)', () => {
    it.each([
      [0.1, 50],
      [0.3, 35],
      [0.5, 20],
      [0.7, 10],
      [0.9, 0],
    ])('fractionElapsed=%p -> timeBonus=%p', (fractionElapsed, expected) => {
      const result = service.calculateScore({ ...baseInput, fractionElapsed });
      expect(result.timeBonus).toBe(expected);
    });
  });

  describe('chainBonus (longueur de chaîne)', () => {
    it.each([
      [1, 0],
      [5, 10],
      [10, 25],
      [15, 40],
      [20, 60],
      [30, 60],
    ])('turnNumber=%p -> chainBonus=%p', (turnNumber, expected) => {
      const result = service.calculateScore({ ...baseInput, turnNumber });
      expect(result.chainBonus).toBe(expected);
    });
  });

  describe('categoryMult (sens corrigé — picks obscurs récompensés)', () => {
    it.each([
      ['underground', 1.12],
      ['niche', 1.08],
      ['intermediate', 1.04],
      ['mainstream', 1.02],
      ['ultra_mainstream', 1.00],
    ] as const)('category=%p -> mult=%p', (category, expected) => {
      const result = service.calculateScore({ ...baseInput, category });
      expect(result.categoryBonus).toBeCloseTo(expected);
    });
  });

  describe('degreeMult (collab_degree)', () => {
    it.each([
      [0, 1.05],
      [10, 1.05],
      [11, 1.03],
      [25, 1.03],
      [26, 1.01],
      [60, 1.01],
      [61, 1.00],
    ])('collabDegree=%p -> mult=%p', (collabDegree, expected) => {
      const result = service.calculateScore({ ...baseInput, collabDegree });
      expect(result.degreeBonus).toBeCloseTo(expected);
    });
  });

  describe('pairMult (pair_family_count)', () => {
    it.each([
      [0, 1.00],
      [1, 1.30],
      [2, 1.18],
      [3, 1.18],
      [4, 1.08],
      [7, 1.08],
      [8, 1.03],
      [15, 1.03],
      [16, 1.00],
    ])('pairFamilyCount=%p -> mult=%p', (pairFamilyCount, expected) => {
      const result = service.calculateScore({ ...baseInput, pairFamilyCount });
      expect(result.pairBonus).toBeCloseTo(expected);
    });
  });

  describe('plafond et dépassement', () => {
    it('plafonne finalScore à 300 et calcule overflow quand raw le dépasse', () => {
      // Meilleur cas sur tous les axes : base = 100+50+60 = 210
      // raw = 210 * 1.12 * 1.05 * 1.30 = 338.184 -> round 338
      const result = service.calculateScore({
        category: 'underground',
        collabDegree: 5,
        pairFamilyCount: 1,
        turnNumber: 20,
        fractionElapsed: 0.1,
      });
      expect(result.finalScore).toBe(300);
      expect(result.overflow).toBeGreaterThan(0);
      expect(result.overflow).toBe(Math.round(210 * 1.12 * 1.05 * 1.30) - 300);
    });

    it('overflow reste à 0 quand raw est sous le plafond', () => {
      const result = service.calculateScore(baseInput);
      expect(result.overflow).toBe(0);
      expect(result.finalScore).toBeLessThanOrEqual(300);
    });
  });
});
