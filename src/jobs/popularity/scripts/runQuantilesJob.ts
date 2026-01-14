/**
 * Script pour exécuter le job de calcul des quantiles
 * Usage: npm run popularity:quantiles
 */

import { createPopularityRepository } from '../PopularityRepository';
import { PopularityQuantilesJob } from '../quantiles/PopularityQuantilesJob';

async function main() {
  const repository = createPopularityRepository();
  
  try {
    await repository.initialize();
    
    const job = new PopularityQuantilesJob(repository);
    
    console.log(JSON.stringify({
      level: 'info',
      job: 'popularity_quantiles',
      step: 'starting',
      timestamp: new Date().toISOString(),
    }));
    
    await job.computeQuantilesAndTiers();
    
    console.log(JSON.stringify({
      level: 'info',
      job: 'popularity_quantiles',
      step: 'completed',
      timestamp: new Date().toISOString(),
    }));
    
  } catch (error: any) {
    console.error(JSON.stringify({
      level: 'error',
      job: 'popularity_quantiles',
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
