/**
 * Client pour l'API ListenBrainz
 * Utilisé UNIQUEMENT dans les jobs background
 */

import axios, { AxiosInstance } from 'axios';
import { API_URLS, API_USER_AGENT } from '../constants';

export interface ListenBrainzStats {
  listens_365d: number | null;
  error?: string;
}

/**
 * Client pour récupérer les statistiques ListenBrainz
 */
export class ListenBrainzClient {
  private client: AxiosInstance;
  private readonly baseURL: string;

  constructor(baseURL: string = API_URLS.LISTENBRAINZ) {
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL,
      headers: {
        'User-Agent': API_USER_AGENT,
      },
      timeout: 30000,
    });
  }

  /**
   * Récupère le nombre d'écoutes sur 365 jours pour un artiste
   * @param mbid MusicBrainz ID de l'artiste
   * @returns Nombre d'écoutes ou null si indisponible
   */
  async getListens365d(mbid: string): Promise<number | null> {
    try {
      // ListenBrainz API endpoint pour les stats d'artiste
      // Note: L'API ListenBrainz peut nécessiter un token pour certaines requêtes
      // Pour l'instant, on utilise l'endpoint public si disponible
      
      // Endpoint alternatif: utiliser les stats publiques si disponibles
      // Si l'API nécessite une authentification, cette méthode doit être adaptée
      
      const response = await this.client.get(`/artist/${mbid}/stats`, {
        params: {
          range: 'year',
        },
        validateStatus: (status) => status < 500, // Accepter 404 comme valide
      });

      if (response.status === 404 || !response.data) {
        return null;
      }

      // Adapter selon la structure de réponse de ListenBrainz
      // La structure exacte dépend de l'API ListenBrainz
      const stats = response.data;
      
      if (stats.listen_count) {
        return parseInt(stats.listen_count, 10);
      }

      return null;
    } catch (error: any) {
      // Log l'erreur mais ne pas faire échouer le job
      console.warn(`ListenBrainz: Erreur pour MBID ${mbid}:`, error.message);
      return null;
    }
  }

  /**
   * Récupère les statistiques complètes pour un artiste
   */
  async getStats(mbid: string): Promise<ListenBrainzStats> {
    const listens_365d = await this.getListens365d(mbid);
    return { listens_365d };
  }
}
