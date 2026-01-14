import { normalizeTitleToFamily } from '../titleFamilyNormalizer';

/**
 * Statistiques de paires d'artistes
 * Clé: "mbid1|mbid2" (toujours dans l'ordre alphabétique des MBID)
 * Valeur: nombre de familles de titres communes
 */
const pairStatsCache = new Map<string, number>();

/**
 * Provider pour les statistiques de paires d'artistes
 * Lit uniquement depuis le cache mémoire (pré-chargé avant le jeu)
 */
export class PairStatsProvider {
  /**
   * Obtient le nombre de familles de titres communes entre deux artistes
   * 
   * @param artist1Mbid MBID du premier artiste
   * @param artist2Mbid MBID du second artiste
   * @returns Nombre de familles communes (0 si aucune)
   */
  getPairFamilyCount(artist1Mbid: string, artist2Mbid: string): number {
    if (!artist1Mbid || !artist2Mbid) {
      return 0;
    }

    // Créer une clé ordonnée (toujours dans le même ordre)
    const cacheKey = this.getCacheKey(artist1Mbid, artist2Mbid);
    return pairStatsCache.get(cacheKey) || 0;
  }

  /**
   * Précharge les statistiques de paires depuis une source de données
   * Cette méthode doit être appelée AVANT le début d'une partie
   * 
   * @param pairStats Map de "mbid1|mbid2" -> nombre de familles
   */
  preloadPairStats(pairStats: Map<string, number>): void {
    pairStatsCache.clear();
    for (const [key, value] of pairStats.entries()) {
      pairStatsCache.set(key, value);
    }
  }

  /**
   * Ajoute ou met à jour une statistique de paire
   * Utile pour mettre à jour le cache pendant le préchargement
   */
  setPairFamilyCount(artist1Mbid: string, artist2Mbid: string, count: number): void {
    const cacheKey = this.getCacheKey(artist1Mbid, artist2Mbid);
    pairStatsCache.set(cacheKey, count);
  }

  /**
   * Crée une clé de cache ordonnée pour une paire d'artistes
   */
  private getCacheKey(mbid1: string, mbid2: string): string {
    // Trier les MBID pour avoir toujours la même clé
    const sorted = [mbid1, mbid2].sort();
    return `${sorted[0]}|${sorted[1]}`;
  }

  /**
   * Vide le cache (utile pour les tests)
   */
  clearCache(): void {
    pairStatsCache.clear();
  }
}

// Instance singleton
export const pairStatsProvider = new PairStatsProvider();
