/**
 * Job d'ingestion des données de popularité depuis les sources externes
 * Exécuté UNIQUEMENT en background, jamais pendant une partie
 */

import { IPopularityRepository } from '../PopularityRepository';
import { ListenBrainzClient } from './ListenBrainzClient';
import { WikidataClient } from './WikidataClient';
import { MusicBrainzClient } from './MusicBrainzClient';
import { ArtistPopularityRaw, IngestResult, IngestJobConfig } from '../types';
import { DEFAULT_JOB_CONFIG } from '../constants';

/**
 * Job pour ingérer les données de popularité depuis les sources externes
 */
export class PopularityIngestJob {
  private repository: IPopularityRepository;
  private listenBrainzClient: ListenBrainzClient;
  private wikidataClient: WikidataClient;
  private musicBrainzClient: MusicBrainzClient;
  private config: Required<IngestJobConfig>;

  constructor(
    repository: IPopularityRepository,
    config: IngestJobConfig = {}
  ) {
    this.repository = repository;
    this.config = {
      batchSize: config.batchSize ?? DEFAULT_JOB_CONFIG.batchSize,
      retryAttempts: config.retryAttempts ?? DEFAULT_JOB_CONFIG.retryAttempts,
      retryDelay: config.retryDelay ?? DEFAULT_JOB_CONFIG.retryDelay,
      timeout: config.timeout ?? DEFAULT_JOB_CONFIG.timeout,
    };
    this.listenBrainzClient = new ListenBrainzClient();
    this.wikidataClient = new WikidataClient();
    this.musicBrainzClient = new MusicBrainzClient();
  }

  /**
   * Ingère les données pour un artiste unique
   */
  async ingestArtist(
    artistId: string,
    mbid: string | null,
    wikidataQid?: string,
    wikipediaTitle?: string
  ): Promise<IngestResult> {
    try {
      // Récupérer les données depuis toutes les sources en parallèle
      const [listenBrainzStats, wikidataStats, musicBrainzStats] = await Promise.allSettled([
        mbid ? this.listenBrainzClient.getStats(mbid) : Promise.resolve({ listens_365d: null }),
        wikidataQid ? this.wikidataClient.getStats(wikidataQid, wikipediaTitle) : Promise.resolve({ sitelinks: null, pageviews_365d: null }),
        mbid ? this.musicBrainzClient.getStats(mbid) : Promise.resolve({ recordings_count: null, release_count: null, relations_count: null }),
      ]);

      // Extraire les résultats (gérer les erreurs gracieusement)
      const listenBrainz = listenBrainzStats.status === 'fulfilled' 
        ? listenBrainzStats.value 
        : { listens_365d: null };
      
      const wikidata = wikidataStats.status === 'fulfilled'
        ? wikidataStats.value
        : { sitelinks: null, pageviews_365d: null };
      
      const musicBrainz = musicBrainzStats.status === 'fulfilled'
        ? musicBrainzStats.value
        : { recordings_count: null, release_count: null, relations_count: null };

      // Construire l'objet de données brutes
      const rawData: ArtistPopularityRaw = {
        artist_id: artistId,
        mbid: mbid || null,
        listenbrainz_listens_365d: listenBrainz.listens_365d,
        wikidata_sitelinks: wikidata.sitelinks,
        wikipedia_pageviews_365d: wikidata.pageviews_365d,
        musicbrainz_recordings_count: musicBrainz.recordings_count,
        musicbrainz_release_count: musicBrainz.release_count,
        musicbrainz_relations_count: musicBrainz.relations_count,
        sources_json: {
          listenbrainz: listenBrainzStats.status === 'fulfilled' ? 'success' : 'error',
          wikidata: wikidataStats.status === 'fulfilled' ? 'success' : 'error',
          musicbrainz: musicBrainzStats.status === 'fulfilled' ? 'success' : 'error',
        },
        fetched_at: new Date(),
      };

      // Sauvegarder dans la base de données
      await this.repository.saveRawData(rawData);

      // Log structuré (JSON pour Railway)
      console.log(JSON.stringify({
        level: 'info',
        job: 'popularity_ingest',
        artist_id: artistId,
        mbid,
        success: true,
        timestamp: new Date().toISOString(),
      }));

      return {
        artist_id: artistId,
        success: true,
        data: rawData,
      };
    } catch (error: any) {
      // Log l'erreur mais ne pas faire échouer le job
      console.error(JSON.stringify({
        level: 'error',
        job: 'popularity_ingest',
        artist_id: artistId,
        mbid,
        error: error.message,
        timestamp: new Date().toISOString(),
      }));

      return {
        artist_id: artistId,
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Ingère les données pour plusieurs artistes en batch
   * @param artists Liste d'artistes avec leurs identifiants
   */
  async ingestBatch(
    artists: Array<{
      artist_id: string;
      mbid?: string | null;
      wikidata_qid?: string;
      wikipedia_title?: string;
    }>
  ): Promise<IngestResult[]> {
    const results: IngestResult[] = [];
    
    // Traiter par batch pour éviter de surcharger les APIs
    for (let i = 0; i < artists.length; i += this.config.batchSize) {
      const batch = artists.slice(i, i + this.config.batchSize);
      
      // Traiter le batch en parallèle avec un délai entre les requêtes
      const batchResults = await Promise.all(
        batch.map((artist, index) => 
          this.delayedIngest(
            artist.artist_id,
            artist.mbid || null,
            artist.wikidata_qid,
            artist.wikipedia_title,
            index * 100 // Délai progressif pour éviter le rate limiting
          )
        )
      );

      results.push(...batchResults);

      // Log du progrès
      console.log(JSON.stringify({
        level: 'info',
        job: 'popularity_ingest',
        progress: `${i + batch.length}/${artists.length}`,
        timestamp: new Date().toISOString(),
      }));

      // Délai entre les batches
      if (i + this.config.batchSize < artists.length) {
        await this.sleep(1000);
      }
    }

    return results;
  }

  /**
   * Ingère avec un délai pour éviter le rate limiting
   */
  private async delayedIngest(
    artistId: string,
    mbid: string | null,
    wikidataQid?: string,
    wikipediaTitle?: string,
    delayMs: number = 0
  ): Promise<IngestResult> {
    if (delayMs > 0) {
      await this.sleep(delayMs);
    }
    return this.ingestArtist(artistId, mbid, wikidataQid, wikipediaTitle);
  }

  /**
   * Utilitaire pour attendre
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
