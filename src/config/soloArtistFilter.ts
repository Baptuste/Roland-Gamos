/**
 * Filtre de "trouvabilité" pour la sélection automatique d'artistes en Solo
 * (Solo Infini + Solo vs Bot uniquement — jamais en Multijoueur, où seuls
 * les joueurs choisissent, jamais le jeu).
 *
 * Seuil sur artists.category, calculé par npm run popularity:lastfm à partir
 * de artists.lastfm_listeners (quantiles relatifs sur 7 paliers — remplace
 * l'ancien proxy fr_collab_count, cf. CLAUDE_3.md §2.5).
 */

import { ArtistCategory } from '../services/ScoringService';
export type { ArtistCategory };

const CATEGORY_RANK: Record<ArtistCategory, number> = {
  confidentiel: 0,
  underground: 1,
  niche: 2,
  intermediate: 3,
  connu: 4,
  mainstream: 5,
  ultra_mainstream: 6,
};

export function categoryRank(category: string | undefined | null): number {
  return CATEGORY_RANK[category as ArtistCategory] ?? 0;
}

/**
 * Catégorie minimale en dessous de laquelle un artiste est exclu de la
 * sélection automatique en Solo (seed de partie, choix du bot).
 * Configurable via SOLO_MIN_ARTIST_CATEGORY — valeurs possibles :
 * 'confidentiel' | 'underground' | 'niche' | 'intermediate' | 'connu' | 'mainstream' | 'ultra_mainstream'.
 * Défaut 'niche' : exclut 'confidentiel' et 'underground' (les 2 paliers les plus
 * obscurs — l'ajout du palier 'confidentiel' sous 'underground' élargit légèrement
 * l'exclusion par défaut par rapport à l'ancien système à 5 paliers).
 * Seuil exact à ajuster empiriquement une fois en jeu — voir CLAUDE_3.md.
 */
const envValue = process.env.SOLO_MIN_ARTIST_CATEGORY as ArtistCategory | undefined;
export const SOLO_MIN_ARTIST_CATEGORY: ArtistCategory =
  envValue && envValue in CATEGORY_RANK ? envValue : 'niche';
export const SOLO_MIN_ARTIST_CATEGORY_RANK = categoryRank(SOLO_MIN_ARTIST_CATEGORY);

export function meetsMinCategory(category: string | undefined | null): boolean {
  return categoryRank(category) >= SOLO_MIN_ARTIST_CATEGORY_RANK;
}
