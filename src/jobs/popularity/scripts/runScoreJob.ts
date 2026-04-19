/**
 * Score job — géré directement par runIngestJob.ts (fr_collab_count)
 * Ce script est un no-op intentionnel.
 */
console.log(JSON.stringify({
  level: 'info',
  job: 'popularity_score',
  step: 'skipped',
  reason: 'Scores calculés dans runIngestJob (fr_collab_count log-normalisé)',
  timestamp: new Date().toISOString(),
}));
