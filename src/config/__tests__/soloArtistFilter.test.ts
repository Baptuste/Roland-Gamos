import { categoryRank, meetsMinCategory, SOLO_MIN_ARTIST_CATEGORY, SOLO_MIN_ARTIST_CATEGORY_RANK } from '../soloArtistFilter';

describe('soloArtistFilter', () => {
  it('classe les catégories du moins au plus mainstream', () => {
    expect(categoryRank('underground')).toBeLessThan(categoryRank('niche'));
    expect(categoryRank('niche')).toBeLessThan(categoryRank('intermediate'));
    expect(categoryRank('intermediate')).toBeLessThan(categoryRank('mainstream'));
    expect(categoryRank('mainstream')).toBeLessThan(categoryRank('ultra_mainstream'));
  });

  it('traite une catégorie inconnue/absente comme le palier le plus bas', () => {
    expect(categoryRank(undefined)).toBe(0);
    expect(categoryRank(null)).toBe(0);
    expect(categoryRank('n_importe_quoi')).toBe(0);
  });

  it('applique le seuil par défaut (niche) — exclut uniquement underground', () => {
    expect(SOLO_MIN_ARTIST_CATEGORY).toBe('niche');
    expect(meetsMinCategory('underground')).toBe(false);
    expect(meetsMinCategory('niche')).toBe(true);
    expect(meetsMinCategory('intermediate')).toBe(true);
    expect(meetsMinCategory('mainstream')).toBe(true);
    expect(meetsMinCategory('ultra_mainstream')).toBe(true);
  });

  it('le rang du seuil correspond bien à la catégorie configurée', () => {
    expect(SOLO_MIN_ARTIST_CATEGORY_RANK).toBe(categoryRank(SOLO_MIN_ARTIST_CATEGORY));
  });
});
