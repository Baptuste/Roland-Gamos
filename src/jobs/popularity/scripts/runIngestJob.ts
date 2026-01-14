/**
 * Script pour exécuter le job d'ingestion
 * Usage: npm run popularity:ingest
 */

import { createPopularityRepository } from '../PopularityRepository';
import { PopularityIngestJob } from '../ingest/PopularityIngestJob';

async function main() {
  const repository = createPopularityRepository();
  
  try {
    await repository.initialize();
    
    const job = new PopularityIngestJob(repository);
    
    // TODO: Récupérer la liste des artistes depuis la base de données
    // Pour l'instant, exemple avec des artistes hardcodés
    const artists = [
      { artist_id: 'artist-1', mbid: '65f4f0c5-ef9e-490c-aee3-909e7ae6b2ab', wikidata_qid: 'Q12345' },
      // Ajouter plus d'artistes ici
    ];
    
    console.log(JSON.stringify({
      level: 'info',
      job: 'popularity_ingest',
      step: 'starting',
      artists_count: artists.length,
      timestamp: new Date().toISOString(),
    }));
    
    const results = await job.ingestBatch(artists);
    
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.filter(r => !r.success).length;
    
    console.log(JSON.stringify({
      level: 'info',
      job: 'popularity_ingest',
      step: 'completed',
      success_count: successCount,
      error_count: errorCount,
      timestamp: new Date().toISOString(),
    }));
    
  } catch (error: any) {
    console.error(JSON.stringify({
      level: 'error',
      job: 'popularity_ingest',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    }));
    process.exit(1);
  } finally {
    await repository.close();
  }
}

main();
