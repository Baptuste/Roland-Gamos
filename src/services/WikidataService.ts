import axios, { AxiosInstance } from 'axios';

/**
 * Cache pour les QIDs d'artistes (nom -> QID)
 */
const artistQidCache = new Map<string, string>();

/**
 * Cache pour les validations de collaborations (pair -> boolean)
 * Clé: "artist1|artist2" (ordre alphabétique)
 */
const collaborationCache = new Map<string, boolean>();

/**
 * Service pour interagir avec Wikidata via SPARQL
 * Utilisé comme fallback quand MusicBrainz ne trouve pas de collaboration
 */
export class WikidataService {
  private readonly sparqlEndpoint = 'https://query.wikidata.org/sparql';
  private readonly userAgent: string;
  private client: AxiosInstance;

  constructor(userAgent: string = 'RolandGamos/1.0.0') {
    this.userAgent = userAgent;
    this.client = axios.create({
      baseURL: this.sparqlEndpoint,
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'application/sparql-results+json',
      },
      timeout: 10000,
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
          console.log(`Wikidata retry ${attempt}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
    return null;
  }

  /**
   * Trouve le QID Wikidata d'un artiste par son nom
   * Recherche dans les instances de "musical artist" ou "rapper"
   */
  async findArtistQidByName(name: string): Promise<string | null> {
    const normalizedName = name.trim().toLowerCase();
    
    // Vérifier le cache
    if (artistQidCache.has(normalizedName)) {
      return artistQidCache.get(normalizedName)!;
    }

    try {
      // SPARQL query pour trouver un artiste musical par nom
      const query = `
        SELECT ?item ?itemLabel WHERE {
          ?item wdt:P31/wdt:P279* wd:Q488205 .  # instance of musical artist or subclass
          ?item ?label "${name}"@en .
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr" }
        }
        LIMIT 1
      `.trim();

      const result = await this.retry(async () => {
        const response = await this.client.get('', {
          params: {
            query,
            format: 'json',
          },
        });
        return response.data;
      });

      if (!result || !result.results || !result.results.bindings || result.results.bindings.length === 0) {
        // Essayer aussi avec "rapper" spécifiquement
        const rapperQuery = `
          SELECT ?item ?itemLabel WHERE {
            ?item wdt:P31/wdt:P279* wd:Q1597618 .  # instance of rapper or subclass
            ?item ?label "${name}"@en .
            SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr" }
          }
          LIMIT 1
        `.trim();

        const rapperResult = await this.retry(async () => {
          const response = await this.client.get('', {
            params: {
              query: rapperQuery,
              format: 'json',
            },
          });
          return response.data;
        });

        if (!rapperResult || !rapperResult.results || !rapperResult.results.bindings || rapperResult.results.bindings.length === 0) {
          artistQidCache.set(normalizedName, null as any);
          return null;
        }

        const qid = rapperResult.results.bindings[0].item.value.split('/').pop() || null;
        if (qid) {
          artistQidCache.set(normalizedName, qid);
          return qid;
        }
        return null;
      }

      const qid = result.results.bindings[0].item.value.split('/').pop() || null;
      if (qid) {
        artistQidCache.set(normalizedName, qid);
        return qid;
      }

      artistQidCache.set(normalizedName, null as any);
      return null;
    } catch (error) {
      console.error(`Erreur lors de la recherche Wikidata pour "${name}":`, error);
      return null;
    }
  }

  /**
   * Vérifie si deux artistes ont une collaboration sur un enregistrement/track partagé
   * Recherche des tracks où les deux artistes apparaissent comme crédités
   */
  async haveCommonRecording(prevName: string, currName: string): Promise<boolean> {
    const cacheKey = this.getCacheKey(prevName, currName);
    
    // Vérifier le cache
    if (collaborationCache.has(cacheKey)) {
      return collaborationCache.get(cacheKey)!;
    }

    try {
      // Trouver les QIDs des deux artistes
      const [prevQid, currQid] = await Promise.all([
        this.findArtistQidByName(prevName),
        this.findArtistQidByName(currName),
      ]);

      if (!prevQid || !currQid) {
        collaborationCache.set(cacheKey, false);
        return false;
      }

      // SPARQL query pour trouver des tracks partagés
      // On cherche des "musical work" (tracks/songs) où les deux artistes sont crédités
      const query = `
        SELECT ?track WHERE {
          {
            # Track où prevArtist est crédité comme performer/composer
            ?track wdt:P175 ?prevArtist .
            ?prevArtist wd:${prevQid} .
            
            # ET currArtist est aussi crédité
            ?track wdt:P175 ?currArtist .
            ?currArtist wd:${currQid} .
            
            FILTER(?prevArtist != ?currArtist)
          }
          UNION
          {
            # Track où prevArtist est crédité
            ?track wdt:P86 ?prevArtist .
            ?prevArtist wd:${prevQid} .
            
            # ET currArtist est aussi crédité
            ?track wdt:P86 ?currArtist .
            ?currArtist wd:${currQid} .
            
            FILTER(?prevArtist != ?currArtist)
          }
        }
        LIMIT 1
      `.trim();

      const result = await this.retry(async () => {
        const response = await this.client.get('', {
          params: {
            query,
            format: 'json',
          },
        });
        return response.data;
      });

      if (!result || !result.results || !result.results.bindings) {
        collaborationCache.set(cacheKey, false);
        return false;
      }

      const hasCollaboration = result.results.bindings.length > 0;
      collaborationCache.set(cacheKey, hasCollaboration);
      
      if (hasCollaboration) {
        console.log(`Wikidata: Collaboration trouvée entre "${prevName}" (${prevQid}) et "${currName}" (${currQid})`);
      }

      return hasCollaboration;
    } catch (error) {
      console.error(`Erreur lors de la vérification Wikidata pour "${prevName}" et "${currName}":`, error);
      collaborationCache.set(cacheKey, false);
      return false;
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
   * Vide les caches (utile pour les tests)
   */
  clearCache(): void {
    artistQidCache.clear();
    collaborationCache.clear();
  }
}
