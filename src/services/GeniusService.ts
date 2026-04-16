import axios, { AxiosInstance } from 'axios';

/**
 * Resultat de recherche d'un artiste Genius
 */
export interface GeniusArtist {
  id: number;
  name: string;
  image_url?: string;
}

/**
 * Resultat d'un morceau Genius avec featured artists
 */
export interface GeniusSong {
  id: number;
  title: string;
  title_with_featured: string;
  primary_artist: GeniusArtist;
  featured_artists: GeniusArtist[];
  release_date_components?: { year: number; month: number; day: number } | null;
}

/**
 * Service pour interagir avec l'API Genius
 * Source principale pour l'ETL (artistes + collaborations rap FR)
 */
export class GeniusService {
  private client: AxiosInstance;

  constructor(accessToken: string) {
    this.client = axios.create({
      baseURL: 'https://api.genius.com',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 15000,
    });
  }

  /**
   * Recherche un artiste par nom (match exact uniquement, pas de fallback)
   */
  async searchArtist(name: string): Promise<GeniusArtist | null> {
    const nameLower = name.toLowerCase().trim();

    try {
      // Strategie 1: recherche via /search (songs) — match exact sur primary/featured
      const response = await this.client.get('/search', {
        params: { q: name },
      });

      const hits = response.data.response.hits;
      if (hits && hits.length > 0) {
        // Chercher une correspondance exacte dans primary_artist
        for (const hit of hits) {
          if (hit.type !== 'song') continue;
          const artist = hit.result.primary_artist;
          if (artist.name.toLowerCase() === nameLower) {
            return { id: artist.id, name: artist.name, image_url: artist.image_url };
          }
        }

        // Chercher dans les featured artists
        for (const hit of hits) {
          if (hit.type !== 'song') continue;
          const featured = hit.result.featured_artists || [];
          for (const fa of featured) {
            if (fa.name.toLowerCase() === nameLower) {
              return { id: fa.id, name: fa.name, image_url: fa.image_url };
            }
          }
        }
      }

      // Strategie 2: recherche plus specifique avec le nom entre guillemets
      const response2 = await this.client.get('/search', {
        params: { q: `"${name}" rapper` },
      });

      const hits2 = response2.data.response.hits;
      if (hits2 && hits2.length > 0) {
        for (const hit of hits2) {
          if (hit.type !== 'song') continue;
          const artist = hit.result.primary_artist;
          if (artist.name.toLowerCase() === nameLower) {
            return { id: artist.id, name: artist.name, image_url: artist.image_url };
          }
          const featured = hit.result.featured_artists || [];
          for (const fa of featured) {
            if (fa.name.toLowerCase() === nameLower) {
              return { id: fa.id, name: fa.name, image_url: fa.image_url };
            }
          }
        }
      }

      // Pas de match exact — ne PAS prendre un fallback incorrect
      return null;
    } catch (error: any) {
      console.error(`Genius search error for "${name}":`, error.message);
      return null;
    }
  }

  /**
   * Recupere les morceaux d'un artiste (pagine)
   * Retourne les songs avec leurs featured_artists
   */
  async getArtistSongs(
    artistId: number,
    options: { maxPages?: number; perPage?: number } = {}
  ): Promise<GeniusSong[]> {
    const { maxPages = 5, perPage = 50 } = options;
    const allSongs: GeniusSong[] = [];
    let page = 1;

    while (page <= maxPages) {
      try {
        const response = await this.client.get(`/artists/${artistId}/songs`, {
          params: { page, per_page: perPage, sort: 'popularity' },
        });

        const songs = response.data.response.songs;
        if (!songs || songs.length === 0) break;

        for (const song of songs) {
          allSongs.push({
            id: song.id,
            title: song.title,
            title_with_featured: song.title_with_featured || song.title,
            primary_artist: {
              id: song.primary_artist.id,
              name: song.primary_artist.name,
              image_url: song.primary_artist.image_url,
            },
            featured_artists: (song.featured_artists || []).map((fa: any) => ({
              id: fa.id,
              name: fa.name,
              image_url: fa.image_url,
            })),
            release_date_components: song.release_date_components || null,
          });
        }

        if (songs.length < perPage) break;
        page++;

        // Rate limiting Genius: ~5 req/sec max
        await new Promise(resolve => setTimeout(resolve, 250));
      } catch (error: any) {
        console.error(`Genius songs error for artist ${artistId} page ${page}:`, error.message);
        break;
      }
    }

    return allSongs;
  }

  /**
   * Recupere les details d'un artiste par ID
   */
  async getArtist(artistId: number): Promise<GeniusArtist | null> {
    try {
      const response = await this.client.get(`/artists/${artistId}`);
      const artist = response.data.response.artist;
      if (!artist) return null;
      return { id: artist.id, name: artist.name, image_url: artist.image_url };
    } catch (error: any) {
      console.error(`Genius artist detail error for ${artistId}:`, error.message);
      return null;
    }
  }
}
