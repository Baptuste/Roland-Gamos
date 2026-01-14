/**
 * Client pour Wikidata et Wikipedia
 * Utilisé UNIQUEMENT dans les jobs background
 */

import axios, { AxiosInstance } from 'axios';
import { API_URLS, API_USER_AGENT } from '../constants';

export interface WikidataStats {
  sitelinks: number | null;
  pageviews_365d: number | null;
  error?: string;
}

/**
 * Client pour récupérer les statistiques Wikidata/Wikipedia
 */
export class WikidataClient {
  private sparqlClient: AxiosInstance;
  private pageviewsClient: AxiosInstance;
  private readonly sparqlURL: string;
  private readonly pageviewsURL: string;

  constructor(
    sparqlURL: string = API_URLS.WIKIDATA,
    pageviewsURL: string = API_URLS.WIKIPEDIA_PAGEVIEWS
  ) {
    this.sparqlURL = sparqlURL;
    this.pageviewsURL = pageviewsURL;

    this.sparqlClient = axios.create({
      baseURL: sparqlURL,
      headers: {
        'User-Agent': API_USER_AGENT,
        'Accept': 'application/json',
      },
      timeout: 30000,
    });

    this.pageviewsClient = axios.create({
      baseURL: pageviewsURL,
      headers: {
        'User-Agent': API_USER_AGENT,
      },
      timeout: 30000,
    });
  }

  /**
   * Récupère le nombre de sitelinks (langues) pour un QID Wikidata
   */
  async getSitelinks(qid: string): Promise<number | null> {
    try {
      // Requête SPARQL pour compter les sitelinks
      const query = `
        SELECT (COUNT(?link) AS ?count)
        WHERE {
          wd:${qid} ?p ?link .
          FILTER(STRSTARTS(STR(?link), "http://www.wikidata.org/entity/"))
        }
      `;

      const response = await this.sparqlClient.get('', {
        params: {
          query,
          format: 'json',
        },
      });

      if (response.data?.results?.bindings?.[0]?.count?.value) {
        return parseInt(response.data.results.bindings[0].count.value, 10);
      }

      // Alternative: requête plus simple pour les sitelinks
      const simpleQuery = `
        SELECT ?count WHERE {
          SELECT (COUNT(?article) AS ?count)
          WHERE {
            wd:${qid} ^schema:about ?article .
            ?article schema:inLanguage ?lang .
          }
        }
      `;

      const simpleResponse = await this.sparqlClient.get('', {
        params: {
          query: simpleQuery,
          format: 'json',
        },
      });

      if (simpleResponse.data?.results?.bindings?.[0]?.count?.value) {
        return parseInt(simpleResponse.data.results.bindings[0].count.value, 10);
      }

      return null;
    } catch (error: any) {
      console.warn(`Wikidata: Erreur pour QID ${qid}:`, error.message);
      return null;
    }
  }

  /**
   * Récupère les pageviews Wikipedia sur 365 jours
   * Nécessite le nom de l'article Wikipedia
   */
  async getPageviews365d(articleTitle: string, language: string = 'en'): Promise<number | null> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 365);

      const startDateStr = startDate.toISOString().split('T')[0].replace(/-/g, '');
      const endDateStr = endDate.toISOString().split('T')[0].replace(/-/g, '');

      const response = await this.pageviewsClient.get(
        `/metrics/pageviews/per-article/${language}.wikipedia/all-access/user/${encodeURIComponent(articleTitle)}/daily/${startDateStr}/${endDateStr}`,
        {
          validateStatus: (status) => status < 500,
        }
      );

      if (response.status === 404 || !response.data?.items) {
        return null;
      }

      // Somme des pageviews sur la période
      const totalViews = response.data.items.reduce(
        (sum: number, item: any) => sum + (item.views || 0),
        0
      );

      return totalViews > 0 ? totalViews : null;
    } catch (error: any) {
      console.warn(`Wikipedia Pageviews: Erreur pour "${articleTitle}":`, error.message);
      return null;
    }
  }

  /**
   * Récupère les statistiques complètes pour un QID Wikidata
   * @param qid QID Wikidata (ex: Q12345)
   * @param wikipediaTitle Titre de l'article Wikipedia (optionnel)
   */
  async getStats(qid: string, wikipediaTitle?: string): Promise<WikidataStats> {
    const sitelinks = await this.getSitelinks(qid);
    let pageviews_365d: number | null = null;

    if (wikipediaTitle) {
      pageviews_365d = await this.getPageviews365d(wikipediaTitle);
    }

    return {
      sitelinks,
      pageviews_365d,
    };
  }
}
