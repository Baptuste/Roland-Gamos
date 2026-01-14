/**
 * Catégorie de popularité d'un artiste
 */
export type PopularityCategory = 'ultra_mainstream' | 'mainstream' | 'connu' | 'niche' | 'underground';

/**
 * Catégories de popularité avec leurs seuils
 * Basées sur le degré de popularité (nombre de collaborations)
 */
const CATEGORY_THRESHOLDS: Record<PopularityCategory, { min: number; max: number }> = {
  ultra_mainstream: { min: 100, max: Infinity },
  mainstream: { min: 50, max: 99 },
  connu: { min: 20, max: 49 },
  niche: { min: 5, max: 19 },
  underground: { min: 0, max: 4 },
};

/**
 * Cache des catégories de popularité
 * Clé: MBID de l'artiste
 * Valeur: catégorie de popularité
 */
const categoryCache = new Map<string, PopularityCategory>();

/**
 * Mapping des tiers depuis la base de données vers les catégories du jeu
 */
const TIER_TO_CATEGORY_MAP: Record<string, PopularityCategory> = {
  'ULTRA_MAINSTREAM': 'ultra_mainstream',
  'MAINSTREAM': 'mainstream',
  'POPULAR': 'connu',
  'NICHE': 'niche',
  'UNDERGROUND': 'underground',
};

/**
 * Provider pour les catégories de popularité des artistes
 * Lit UNIQUEMENT depuis le cache mémoire (pré-chargé depuis la base de données)
 * AUCUN appel API externe autorisé
 */
export class PopularityCategoryProvider {
  /**
   * Obtient la catégorie de popularité d'un artiste
   * 
   * @param artistMbid MBID de l'artiste
   * @param degree Degré de popularité (ignoré si catégorie en cache)
   * @returns Catégorie de popularité (fallback: 'niche' si absent)
   */
  getCategory(artistMbid: string, degree?: number): PopularityCategory {
    if (!artistMbid) {
      return 'niche'; // Fallback selon spécifications
    }

    // Vérifier le cache direct (pré-chargé depuis la base de données)
    const cached = categoryCache.get(artistMbid);
    if (cached) {
      return cached;
    }

    // Si pas en cache, retourner le fallback 'niche' (pas de calcul dynamique)
    return 'niche';
  }

  /**
   * Convertit un tier de la base de données en catégorie du jeu
   */
  private tierToCategory(tier: string): PopularityCategory {
    return TIER_TO_CATEGORY_MAP[tier] || 'niche';
  }

  /**
   * Précharge les catégories depuis le repository (base de données)
   * Cette méthode doit être appelée AVANT le début d'une partie
   * 
   * @param tiers Map de MBID -> tier (depuis artist_popularity_tier)
   */
  preloadCategoriesFromTiers(tiers: Map<string, string>): void {
    categoryCache.clear();
    for (const [mbid, tier] of tiers.entries()) {
      const category = this.tierToCategory(tier);
      categoryCache.set(mbid, category);
    }
  }

  /**
   * Précharge les catégories depuis une source de données
   * Cette méthode doit être appelée AVANT le début d'une partie
   * 
   * @param categories Map de MBID -> catégorie
   */
  preloadCategories(categories: Map<string, PopularityCategory>): void {
    categoryCache.clear();
    for (const [mbid, category] of categories.entries()) {
      categoryCache.set(mbid, category);
    }
  }

  /**
   * Ajoute ou met à jour une catégorie
   * Utile pour mettre à jour le cache pendant le préchargement
   */
  setCategory(artistMbid: string, category: PopularityCategory): void {
    categoryCache.set(artistMbid, category);
  }

  /**
   * Vide le cache (utile pour les tests)
   */
  clearCache(): void {
    categoryCache.clear();
  }
}

// Instance singleton
export const popularityCategoryProvider = new PopularityCategoryProvider();
