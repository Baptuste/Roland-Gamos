import { categoryRank, meetsMinCategory, SOLO_MIN_ARTIST_CATEGORY, SOLO_MIN_ARTIST_CATEGORY_RANK } from '../soloArtistFilter';

describe('soloArtistFilter', () => {
  it('classe les 7 catégories du moins au plus mainstream', () => {
    expect(categoryRank('confidentiel')).toBeLessThan(categoryRank('underground'));
    expect(categoryRank('underground')).toBeLessThan(categoryRank('niche'));
    expect(categoryRank('niche')).toBeLessThan(categoryRank('intermediate'));
    expect(categoryRank('intermediate')).toBeLessThan(categoryRank('connu'));
    expect(categoryRank('connu')).toBeLessThan(categoryRank('mainstream'));
    expect(categoryRank('mainstream')).toBeLessThan(categoryRank('ultra_mainstream'));
  });

  it('traite une catégorie inconnue/absente comme le palier le plus bas (confidentiel)', () => {
    expect(categoryRank(undefined)).toBe(0);
    expect(categoryRank(null)).toBe(0);
    expect(categoryRank('n_importe_quoi')).toBe(0);
    expect(categoryRank('confidentiel')).toBe(0);
  });

  it('applique le seuil par défaut (niche) — exclut confidentiel et underground', () => {
    expect(SOLO_MIN_ARTIST_CATEGORY).toBe('niche');
    expect(meetsMinCategory('confidentiel')).toBe(false);
    expect(meetsMinCategory('underground')).toBe(false);
    expect(meetsMinCategory('niche')).toBe(true);
    expect(meetsMinCategory('intermediate')).toBe(true);
    expect(meetsMinCategory('connu')).toBe(true);
    expect(meetsMinCategory('mainstream')).toBe(true);
    expect(meetsMinCategory('ultra_mainstream')).toBe(true);
  });

  it('le rang du seuil correspond bien à la catégorie configurée', () => {
    expect(SOLO_MIN_ARTIST_CATEGORY_RANK).toBe(categoryRank(SOLO_MIN_ARTIST_CATEGORY));
  });
});
