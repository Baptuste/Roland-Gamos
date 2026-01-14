/**
 * Client MusicBrainz pour les jobs background
 * Utilisé UNIQUEMENT dans les jobs background
 * Différent du MusicBrainzService utilisé en runtime
 */

import axios, { AxiosInstance } from 'axios';
import { API_URLS, API_USER_AGENT } from '../constants';

export interface MusicBrainzStats {
  recordings_count: number | null;
  release_count: number | null;
  relations_count: number | null;
  error?: string;
}

/**
 * Client pour récupérer les statistiques MusicBrainz
 */
export class MusicBrainzClient {
  private client: AxiosInstance;
  private readonly baseURL: string;

  constructor(baseURL: string = API_URLS.MUSICBRAINZ) {
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
   * Récupère le nombre d'enregistrements pour un artiste
   */
  async getRecordingsCount(mbid: string): Promise<number | null> {
    try {
      const response = await this.client.get(`/recording`, {
        params: {
          artist: mbid,
          limit: 1,
          fmt: 'json',
        },
        validateStatus: (status) => status < 500,
      });

      if (response.status === 404 || !response.data) {
        return null;
      }

      // MusicBrainz retourne parfois le count dans les métadonnées
      if (response.data['recording-count']) {
        return parseInt(response.data['recording-count'], 10);
      }

      // Sinon, compter les résultats (approximation)
      if (response.data.recordings && Array.isArray(response.data.recordings)) {
        return response.data.recordings.length;
      }

      return null;
    } catch (error: any) {
      console.warn(`MusicBrainz: Erreur pour recordings MBID ${mbid}:`, error.message);
      return null;
    }
  }

  /**
   * Récupère le nombre de releases pour un artiste
   */
  async getReleaseCount(mbid: string): Promise<number | null> {
    try {
      const response = await this.client.get(`/release`, {
        params: {
          artist: mbid,
          limit: 1,
          fmt: 'json',
        },
        validateStatus: (status) => status < 500,
      });

      if (response.status === 404 || !response.data) {
        return null;
      }

      if (response.data['release-count']) {
        return parseInt(response.data['release-count'], 10);
      }

      if (response.data.releases && Array.isArray(response.data.releases)) {
        return response.data.releases.length;
      }

      return null;
    } catch (error: any) {
      console.warn(`MusicBrainz: Erreur pour releases MBID ${mbid}:`, error.message);
      return null;
    }
  }

  /**
   * Récupère le nombre de relations pour un artiste
   */
  async getRelationsCount(mbid: string): Promise<number | null> {
    try {
      const response = await this.client.get(`/artist/${mbid}`, {
        params: {
          inc: 'url-rels',
          fmt: 'json',
        },
        validateStatus: (status) => status < 500,
      });

      if (response.status === 404 || !response.data) {
        return null;
      }

      // Compter les relations
      let count = 0;
      if (response.data.relations && Array.isArray(response.data.relations)) {
        count = response.data.relations.length;
      }

      return count > 0 ? count : null;
    } catch (error: any) {
      console.warn(`MusicBrainz: Erreur pour relations MBID ${mbid}:`, error.message);
      return null;
    }
  }

  /**
   * Récupère toutes les statistiques pour un artiste
   */
  async getStats(mbid: string): Promise<MusicBrainzStats> {
    const [recordings_count, release_count, relations_count] = await Promise.all([
      this.getRecordingsCount(mbid),
      this.getReleaseCount(mbid),
      this.getRelationsCount(mbid),
    ]);

    return {
      recordings_count,
      release_count,
      relations_count,
    };
  }
}
