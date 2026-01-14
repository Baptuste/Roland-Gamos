/**
 * Script pour exécuter le job de calcul de score
 * Usage: npm run popularity:score
 */

import { createPopularityRepository } from '../PopularityRepository';
import { PopularityScoreJob } from '../scoring/PopularityScoreJob';

async function main() {
  const repository = createPopularityRepository();
  
  try {
    await repository.initialize();
    
    const job = new PopularityScoreJob(repository);
    
    console.log(JSON.stringify({
      level: 'info',
      job: 'popularity_score',
      step: 'starting',
      timestamp: new Date().toISOString(),
    }));
    
    await job.computeAllScores();
    
    console.log(JSON.stringify({
      level: 'info',
      job: 'popularity_score',
      step: 'completed',
      timestamp: new Date().toISOString(),
    }));
    
  } catch (error: any) {
    console.error(JSON.stringify({
      level: 'error',
      job: 'popularity_score',
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
