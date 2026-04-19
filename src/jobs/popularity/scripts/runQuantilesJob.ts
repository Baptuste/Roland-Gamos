/**
 * Quantiles job — géré directement par runIngestJob.ts
 * Ce script est un no-op intentionnel.
 */
console.log(JSON.stringify({
  level: 'info',
  job: 'popularity_quantiles',
  step: 'skipped',
  reason: 'Quantiles calculés dans runIngestJob (fr_collab_count log-normalisé)',
  timestamp: new Date().toISOString(),
}));
