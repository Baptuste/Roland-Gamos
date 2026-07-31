import { levenshtein, maxDistanceForLength, fuzzyMatch } from '../fuzzyMatch';

describe('levenshtein', () => {
  it('vaut 0 pour deux chaînes identiques', () => {
    expect(levenshtein('booba', 'booba', 3)).toBe(0);
  });

  it('compte 1 substitution', () => {
    expect(levenshtein('booba', 'boobs', 3)).toBe(1);
  });

  it('compte 1 insertion/suppression', () => {
    expect(levenshtein('booba', 'boob', 3)).toBe(1);
  });

  it('plafonne à maxDistance + 1 pour une sortie anticipée', () => {
    expect(levenshtein('booba', 'xxxxxxxxxx', 2)).toBe(3);
  });
});

describe('maxDistanceForLength', () => {
  it('aucune tolérance pour les noms très courts (<=3)', () => {
    expect(maxDistanceForLength(1)).toBe(0);
    expect(maxDistanceForLength(3)).toBe(0);
  });

  it('tolérance 1 pour les noms moyens (4-6)', () => {
    expect(maxDistanceForLength(4)).toBe(1);
    expect(maxDistanceForLength(6)).toBe(1);
  });

  it('tolérance 2 pour les noms longs (>6)', () => {
    expect(maxDistanceForLength(7)).toBe(2);
    expect(maxDistanceForLength(20)).toBe(2);
  });
});

describe('fuzzyMatch', () => {
  const candidates = new Map<string, string>([
    ['booba', 'Booba'],
    ['kaaris', 'Kaaris'],
    ['damso', 'Damso'],
    ['jul', 'Jul'],
  ]);

  it('corrige une faute de frappe à distance 1 sur un nom long', () => {
    expect(fuzzyMatch('boobq', candidates)).toBe('Booba'); // substitution
    expect(fuzzyMatch('kaari', candidates)).toBe('Kaaris'); // suppression finale
  });

  it('ne corrige pas les noms trop courts (<=3 caractères)', () => {
    expect(fuzzyMatch('jol', candidates)).toBeNull();
  });

  it('ne corrige pas si deux candidats sont à égale distance (ambiguïté)', () => {
    const ambiguous = new Map<string, string>([
      ['sch', 'SCH'],
      ['sco', 'Sco'],
      ['scr', 'Scr'],
    ]);
    // "sc_" à distance 1 de sco/scr/sch selon la lettre — teste un cas à deux ex-aequo
    expect(fuzzyMatch('scx', ambiguous)).toBeNull();
  });

  it('retourne null si rien n\'est assez proche', () => {
    expect(fuzzyMatch('xyzxyzxyz', candidates)).toBeNull();
  });
});
