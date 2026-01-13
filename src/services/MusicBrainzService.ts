import axios, { AxiosInstance } from 'axios';

/**
 * Cache simple pour stocker les résultats de validation
 * Clé: "artist1|artist2" (toujours dans l'ordre alphabétique)
 * Valeur: boolean (true si collaboration existe)
 */
const collaborationCache = new Map<string, boolean>();

/**
 * Service pour interagir avec l'API MusicBrainz
 * Utilisé uniquement comme source de vérité pour valider les collaborations
 */
export class MusicBrainzService {
  private client: AxiosInstance;
  private readonly baseURL = 'https://musicbrainz.org/ws/2';
  private readonly userAgent: string;

  constructor(userAgent: string = 'RolandGamos/1.0.0') {
    this.userAgent = userAgent;
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'User-Agent': this.userAgent,
      },
      timeout: 10000, // 10 secondes
    });
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
          error.code === 'ECONNRESET' ||
          error.code === 'ETIMEDOUT' ||
          error.code === 'ENOTFOUND' ||
          error.message?.includes('timeout');

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

  /**
   * Résout un artiste par nom et retourne son identité canonique
   */
  async resolveArtist(artistName: string): Promise<{ mbid: string; canonicalName: string; aliases: string[] } | null> {
    const normalizedName = artistName.trim();
    
    // Stratégies de recherche
    const searchStrategies = [
      `artist:"${normalizedName}"`,
      `artist:${normalizedName}`,
      normalizedName,
    ];

    for (const query of searchStrategies) {
      const result = await this.retry(async () => {
        const response = await this.client.get('/artist', {
          params: {
            query,
            limit: 5,
            fmt: 'json',
          },
        });

        const artists = response.data.artists;
        if (artists && artists.length > 0) {
          const exactMatch = artists.find((a: any) => 
            a.name.toLowerCase() === normalizedName.toLowerCase()
          );
          const artist = exactMatch || artists[0];
          
          // Récupérer les détails complets avec aliases
          try {
            const detailResponse = await this.client.get(`/artist/${artist.id}`, {
              params: {
                fmt: 'json',
                inc: 'aliases',
              },
            });
            
            const aliases = detailResponse.data.aliases?.map((a: any) => a.name) || [];
            
            return {
              mbid: artist.id,
              canonicalName: artist.name,
              aliases: aliases,
            };
          } catch {
            // Si on ne peut pas récupérer les détails, retourner quand même l'info de base
            return {
              mbid: artist.id,
              canonicalName: artist.name,
              aliases: [],
            };
          }
        }
        return null;
      });

      if (result) {
        return result;
      }
    }

    return null;
  }

  /**
   * Recherche un artiste par nom avec plusieurs stratégies
   * Retourne l'ID MusicBrainz de l'artiste s'il est trouvé
   */
  async searchArtist(artistName: string): Promise<string | null> {
    const normalizedName = artistName.trim();
    
    // Stratégies de recherche (nom exact, puis recherche plus large)
    const searchStrategies = [
      `artist:"${normalizedName}"`,  // Recherche exacte
      `artist:${normalizedName}`,    // Recherche sans guillemets
      normalizedName,                 // Recherche simple
    ];

    for (const query of searchStrategies) {
      const result = await this.retry(async () => {
        const response = await this.client.get('/artist', {
          params: {
            query,
            limit: 5, // Augmenter pour avoir plus de résultats
            fmt: 'json',
          },
        });

        const artists = response.data.artists;
        if (artists && artists.length > 0) {
          // Chercher une correspondance exacte ou très proche
          const exactMatch = artists.find((a: any) => 
            a.name.toLowerCase() === normalizedName.toLowerCase()
          );
          if (exactMatch) {
            return exactMatch.id;
          }
          // Sinon prendre le premier résultat
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

  /**
   * Vérifie si deux artistes ont collaboré ensemble
   * Recherche les enregistrements où les deux artistes apparaissent comme artistes
   */
  async hasCollaboration(
    artist1Name: string,
    artist2Name: string
  ): Promise<boolean> {
    // Vérifier le cache d'abord
    const cacheKey = this.getCacheKey(artist1Name, artist2Name);
    if (collaborationCache.has(cacheKey)) {
      return collaborationCache.get(cacheKey)!;
    }

    try {
      // Rechercher les IDs des deux artistes avec retry
      const [artist1Id, artist2Id] = await Promise.all([
        this.searchArtist(artist1Name),
        this.searchArtist(artist2Name),
      ]);

      if (!artist1Id || !artist2Id) {
        console.warn(
          `Un des artistes n'a pas été trouvé: "${artist1Name}" (${artist1Id ? 'trouvé' : 'non trouvé'}), "${artist2Name}" (${artist2Id ? 'trouvé' : 'non trouvé'})`
        );
        // Ne pas mettre en cache si un artiste n'est pas trouvé (peut être une erreur temporaire)
        return false;
      }

      // Rechercher les collaborations avec retry
      const hasCollab = await this.retry(
        () => this.checkCollaborationInRecordings(artist1Id, artist2Id),
        3,
        1000
      );

      const result = hasCollab === true;
      
      // Ne mettre en cache que les résultats positifs ou les échecs confirmés (pas les erreurs réseau)
      if (result || hasCollab === false) {
        collaborationCache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      console.error(
        `Erreur lors de la vérification de collaboration entre "${artist1Name}" et "${artist2Name}":`,
        error
      );
      // Ne pas mettre en cache en cas d'erreur pour permettre un nouvel essai
      return false;
    }
  }

  /**
   * Vérifie si un artiste a au moins une autre collaboration avec un autre artiste
   * (pas seulement avec l'artiste donné)
   */
  async hasOtherCollaborations(
    artistName: string,
    excludeArtistName: string
  ): Promise<boolean> {
    try {
      // Rechercher l'ID de l'artiste
      const artistId = await this.searchArtist(artistName);
      if (!artistId) {
        console.log(`hasOtherCollaborations: Artiste "${artistName}" non trouvé`);
        return false;
      }

      // Rechercher l'ID de l'artiste à exclure pour comparaison
      const excludeArtistId = await this.searchArtist(excludeArtistName);
      if (!excludeArtistId) {
        console.log(`hasOtherCollaborations: Artiste exclu "${excludeArtistName}" non trouvé`);
        // Si on ne peut pas trouver l'artiste exclu, on considère qu'il n'y a pas d'autres collaborations
        return false;
      }

      console.log(`hasOtherCollaborations: Vérification pour "${artistName}" (ID: ${artistId}), excluant "${excludeArtistName}" (ID: ${excludeArtistId})`);
      
      // Rechercher les enregistrements de l'artiste avec d'autres artistes
      // Utiliser inc=artist-credits pour obtenir les informations sur les artistes
      const response = await this.retry(async () => {
        return await this.client.get('/recording', {
          params: {
            query: `arid:${artistId}`,
            limit: 100, // Augmenter pour avoir plus de chances de trouver d'autres collaborations
            fmt: 'json',
            inc: 'artist-credits',
          },
        });
      });

      if (!response || !response.data.recordings) {
        console.log(`hasOtherCollaborations: Aucun enregistrement trouvé pour "${artistName}"`);
        return false;
      }

      const recordings = response.data.recordings;
      console.log(`hasOtherCollaborations: ${recordings.length} enregistrements trouvés pour "${artistName}"`);
      
      // Parcourir les enregistrements pour trouver des collaborations avec d'autres artistes
      for (const recording of recordings) {
        // Vérifier les artistes crédités dans l'enregistrement
        const artistCredits = recording['artist-credit'];
        if (!artistCredits) {
          continue;
        }

        // Extraire tous les IDs d'artistes uniques de cet enregistrement
        const artistIdsSet = new Set<string>();
        
        // Gérer différents formats de artist-credit
        if (Array.isArray(artistCredits)) {
          for (const ac of artistCredits) {
            if (ac.artist && ac.artist.id) {
              artistIdsSet.add(ac.artist.id);
            }
          }
        } else if (artistCredits.artist && artistCredits.artist.id) {
          artistIdsSet.add(artistCredits.artist.id);
        }

        // Convertir en array pour faciliter la manipulation
        const artistIds = Array.from(artistIdsSet);

        // Vérifier qu'il y a au moins 3 artistes distincts :
        // 1. L'artiste lui-même
        // 2. L'artiste exclu
        // 3. Au moins un autre artiste
        if (artistIds.length < 2) {
          // Pas assez d'artistes pour être une collaboration
          continue;
        }

        // Vérifier s'il y a au moins un autre artiste (pas l'artiste lui-même, pas l'artiste exclu)
        const hasOtherArtist = artistIds.some(
          (id) => id !== artistId && id !== excludeArtistId
        );

        if (hasOtherArtist) {
          console.log(`hasOtherCollaborations: Collaboration trouvée pour "${artistName}" avec un autre artiste que "${excludeArtistName}" (${artistIds.length} artistes dans l'enregistrement)`);
          return true;
        }
      }

      // Ne pas chercher dans les releases - on veut uniquement des collaborations sur des sons individuels

      console.log(`hasOtherCollaborations: Aucune autre collaboration trouvée pour "${artistName}" (seulement avec "${excludeArtistName}")`);
      return false;
    } catch (error) {
      console.error(
        `Erreur lors de la vérification des autres collaborations de "${artistName}":`,
        error
      );
      return false;
    }
  }

  /**
   * Vérifie si deux artistes ont collaboré en cherchant uniquement dans les enregistrements (sons individuels)
   * Ne cherche PAS dans les releases (albums/projets complets)
   */
  async haveCommonRecording(prevMbid: string, currMbid: string): Promise<boolean> {
    return this.checkCollaborationInRecordings(prevMbid, currMbid);
  }

  /**
   * Vérifie si deux artistes ont collaboré en cherchant uniquement dans les enregistrements (sons individuels)
   * Ne cherche PAS dans les releases (albums/projets complets)
   */
  private async checkCollaborationInRecordings(
    artist1Id: string,
    artist2Id: string
  ): Promise<boolean> {
    // Recherche uniquement dans les enregistrements (sons individuels)
    try {
      const response = await this.retry(async () => {
        return await this.client.get('/recording', {
          params: {
            query: `arid:${artist1Id} AND arid:${artist2Id}`,
            limit: 1,
            fmt: 'json',
          },
        });
      });

      if (!response || !response.data.recordings) {
        return false;
      }

      // Vérifier qu'il y a au moins un enregistrement où les deux artistes apparaissent
      const hasCollaboration = response.data.recordings.length > 0;
      
      if (hasCollaboration) {
        console.log(`Collaboration trouvée sur un enregistrement entre ${artist1Id} et ${artist2Id}`);
      }

      return hasCollaboration;
    } catch (error) {
      console.error('Erreur lors de la recherche de collaboration dans les enregistrements:', error);
      return false;
    }
  }

  /**
   * Obtient la liste des collaborateurs connus d'un artiste (via MBIDs)
   * Utilisé pour détecter la règle "single circular collaboration"
   */
  async getKnownCollaborators(mbid: string): Promise<string[]> {
    try {
      // Rechercher les enregistrements de l'artiste avec d'autres artistes
      const response = await this.retry(async () => {
        return await this.client.get('/recording', {
          params: {
            query: `arid:${mbid}`,
            limit: 100,
            fmt: 'json',
            inc: 'artist-credits',
          },
        });
      });

      if (!response || !response.data.recordings) {
        return [];
      }

      const collaboratorsSet = new Set<string>();
      
      for (const recording of response.data.recordings) {
        const artistCredits = recording['artist-credit'];
        if (!artistCredits) continue;

        if (Array.isArray(artistCredits)) {
          for (const ac of artistCredits) {
            if (ac.artist && ac.artist.id && ac.artist.id !== mbid) {
              collaboratorsSet.add(ac.artist.id);
            }
          }
        } else if (artistCredits.artist && artistCredits.artist.id && artistCredits.artist.id !== mbid) {
          collaboratorsSet.add(artistCredits.artist.id);
        }
      }

      return Array.from(collaboratorsSet);
    } catch (error) {
      console.error(`Erreur lors de la récupération des collaborateurs pour ${mbid}:`, error);
      return [];
    }
  }

  /**
   * Génère une clé de cache normalisée (ordre alphabétique)
   */
  private getCacheKey(artist1: string, artist2: string): string {
    const normalized1 = artist1.toLowerCase().trim();
    const normalized2 = artist2.toLowerCase().trim();
    return normalized1 < normalized2
      ? `${normalized1}|${normalized2}`
      : `${normalized2}|${normalized1}`;
  }

  /**
   * Vide le cache (utile pour les tests ou le débogage)
   */
  clearCache(): void {
    collaborationCache.clear();
  }
}
