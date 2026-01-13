// Pour le frontend, on va créer un service qui appelle le backend
// Pour le MVP, on peut aussi créer une version qui fonctionne directement

const collaborationCache = new Map<string, boolean>();

export class MusicBrainzService {
  private readonly baseURL = 'https://musicbrainz.org/ws/2';
  private readonly userAgent: string;

  constructor(userAgent: string = 'RolandGamos/1.0.0') {
    this.userAgent = userAgent;
  }

  /**
   * Retry une fonction avec plusieurs tentatives
   */
  private async retry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        const isNetworkError = 
          error.message?.includes('ECONNRESET') ||
          error.message?.includes('timeout') ||
          error.message?.includes('network');

        if (isNetworkError && attempt < maxRetries) {
          console.log(`Tentative ${attempt}/${maxRetries} échouée, nouvelle tentative dans ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw error;
      }
    }
    return null;
  }

  async searchArtist(artistName: string): Promise<string | null> {
    const normalizedName = artistName.trim();
    
    // Stratégies de recherche
    const searchStrategies = [
      `artist:"${normalizedName}"`,
      `artist:${normalizedName}`,
      normalizedName,
    ];

    for (const query of searchStrategies) {
      const result = await this.retry(async () => {
        const response = await fetch(
          `${this.baseURL}/artist?query=${encodeURIComponent(query)}&limit=5&fmt=json`,
          {
            headers: {
              'User-Agent': this.userAgent,
            },
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const artists = data.artists;
        if (artists && artists.length > 0) {
          // Chercher une correspondance exacte
          const exactMatch = artists.find((a: any) => 
            a.name.toLowerCase() === normalizedName.toLowerCase()
          );
          if (exactMatch) {
            return exactMatch.id;
          }
          return artists[0].id;
        }
        return null;
      });

      if (result) {
        return result;
      }
    }

    console.warn(`Artiste "${artistName}" non trouvé dans MusicBrainz`);
    return null;
  }

  async hasCollaboration(
    artist1Name: string,
    artist2Name: string
  ): Promise<boolean> {
    const cacheKey = this.getCacheKey(artist1Name, artist2Name);
    if (collaborationCache.has(cacheKey)) {
      return collaborationCache.get(cacheKey)!;
    }

    try {
      const [artist1Id, artist2Id] = await Promise.all([
        this.searchArtist(artist1Name),
        this.searchArtist(artist2Name),
      ]);

      if (!artist1Id || !artist2Id) {
        console.warn(
          `Un des artistes n'a pas été trouvé: "${artist1Name}" (${artist1Id ? 'trouvé' : 'non trouvé'}), "${artist2Name}" (${artist2Id ? 'trouvé' : 'non trouvé'})`
        );
        // Ne pas mettre en cache si un artiste n'est pas trouvé
        return false;
      }

      const hasCollab = await this.retry(
        () => this.checkCollaborationInRecordings(artist1Id, artist2Id),
        3,
        1000
      );

      const result = hasCollab === true;
      
      // Ne mettre en cache que les résultats positifs ou les échecs confirmés
      if (result || hasCollab === false) {
        collaborationCache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      console.error(
        `Erreur lors de la vérification de collaboration:`,
        error
      );
      // Ne pas mettre en cache en cas d'erreur
      return false;
    }
  }

  private async checkCollaborationInRecordings(
    artist1Id: string,
    artist2Id: string
  ): Promise<boolean> {
    // Essayer plusieurs méthodes de recherche
    const searchMethods = [
      // Méthode 1: Recherche directe dans les enregistrements
      async () => {
        const response = await fetch(
          `${this.baseURL}/recording?query=arid:${artist1Id} AND arid:${artist2Id}&limit=1&fmt=json`,
          {
            headers: {
              'User-Agent': this.userAgent,
            },
          }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.recordings?.length > 0;
      },
      // Méthode 2: Recherche via les releases
      async () => {
        const response = await fetch(
          `${this.baseURL}/release?query=arid:${artist1Id} AND arid:${artist2Id}&limit=1&fmt=json`,
          {
            headers: {
              'User-Agent': this.userAgent,
            },
          }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.releases?.length > 0;
      },
    ];

    // Essayer chaque méthode jusqu'à trouver une collaboration
    for (const method of searchMethods) {
      try {
        const result = await method();
        if (result) {
          return true;
        }
      } catch (error) {
        // Continuer avec la méthode suivante
        continue;
      }
    }

    return false;
  }

  private getCacheKey(artist1: string, artist2: string): string {
    const normalized1 = artist1.toLowerCase().trim();
    const normalized2 = artist2.toLowerCase().trim();
    return normalized1 < normalized2
      ? `${normalized1}|${normalized2}`
      : `${normalized2}|${normalized1}`;
  }

  clearCache(): void {
    collaborationCache.clear();
  }
}
