/**
 * Degré de popularité d'un artiste
 * Clé: MBID de l'artiste
 * Valeur: nombre de collaborations totales (degré)
 */
const degreeCache = new Map<string, number>();

/**
 * Provider pour les degrés de popularité des artistes
 * Lit uniquement depuis le cache mémoire (pré-chargé avant le jeu)
 */
export class DegreeProvider {
  /**
   * Obtient le degré de popularité d'un artiste
   * Le degré = nombre total de collaborations distinctes
   * 
   * @param artistMbid MBID de l'artiste
   * @returns Degré de popularité (0 si inconnu)
   */
  getDegree(artistMbid: string): number {
    if (!artistMbid) {
      return 0;
    }
    return degreeCache.get(artistMbid) || 0;
  }

  /**
   * Précharge les degrés depuis une source de données
   * Cette méthode doit être appelée AVANT le début d'une partie
   * 
   * @param degrees Map de MBID -> degré
   */
  preloadDegrees(degrees: Map<string, number>): void {
    degreeCache.clear();
    for (const [mbid, degree] of degrees.entries()) {
      degreeCache.set(mbid, degree);
    }
  }

  /**
   * Ajoute ou met à jour un degré
   * Utile pour mettre à jour le cache pendant le préchargement
   */
  setDegree(artistMbid: string, degree: number): void {
    degreeCache.set(artistMbid, degree);
  }

  /**
   * Vide le cache (utile pour les tests)
   */
  clearCache(): void {
    degreeCache.clear();
  }
}

// Instance singleton
export const degreeProvider = new DegreeProvider();
