/**
 * Filtre de "trouvabilité" pour la sélection automatique d'artistes en Solo
 * (Solo Infini + Solo vs Bot uniquement — jamais en Multijoueur, où seuls
 * les joueurs choisissent, jamais le jeu).
 *
 * Remplace l'idée d'un seuil sur artists.popularity (colonne jamais peuplée,
 * pipeline jobs/popularity supprimé) par un seuil sur artists.category,
 * qui lui est réellement peuplé (assignCategory() basé sur fr_collab_count).
 */

export type ArtistCategory = 'ultra_mainstream' | 'mainstream' | 'intermediate' | 'niche' | 'underground';

const CATEGORY_RANK: Record<ArtistCategory, number> = {
  underground: 0,
  niche: 1,
  intermediate: 2,
  mainstream: 3,
  ultra_mainstream: 4,
};

export function categoryRank(category: string | undefined | null): number {
  return CATEGORY_RANK[category as ArtistCategory] ?? 0;
}

/**
 * Catégorie minimale en dessous de laquelle un artiste est exclu de la
 * sélection automatique en Solo (seed de partie, choix du bot).
 * Configurable via SOLO_MIN_ARTIST_CATEGORY — valeurs possibles :
 * 'underground' | 'niche' | 'intermediate' | 'mainstream' | 'ultra_mainstream'.
 * Défaut 'niche' : exclut uniquement 'underground' (le palier le plus confidentiel).
 * Seuil exact à ajuster empiriquement une fois en jeu — voir CLAUDE_3.md.
 */
const envValue = process.env.SOLO_MIN_ARTIST_CATEGORY as ArtistCategory | undefined;
export const SOLO_MIN_ARTIST_CATEGORY: ArtistCategory =
  envValue && envValue in CATEGORY_RANK ? envValue : 'niche';
export const SOLO_MIN_ARTIST_CATEGORY_RANK = categoryRank(SOLO_MIN_ARTIST_CATEGORY);

export function meetsMinCategory(category: string | undefined | null): boolean {
  return categoryRank(category) >= SOLO_MIN_ARTIST_CATEGORY_RANK;
}
