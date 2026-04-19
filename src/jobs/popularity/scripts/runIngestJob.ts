/**
 * Job de popularité basé sur fr_collab_count (local JSON)
 * Calcule les scores, quantiles et met à jour Supabase.
 *
 * Usage: npm run popularity:ingest
 */

import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const ARTISTS_PATH = path.join(__dirname, '..', '..', '..', 'data', 'artists.json');

interface ETLArtist {
  genius_id: number;
  name: string;
  fr_collab_count: number;
  is_seed: boolean;
  status: 'included' | 'excluded' | 'needs_review';
}

type Category = 'ultra_mainstream' | 'mainstream' | 'intermediate' | 'niche' | 'underground';

const CATEGORY_BONUS: Record<Category, number> = {
  ultra_mainstream: 80,
  mainstream: 60,
  intermediate: 40,
  niche: 20,
  underground: 10,
};

function log(obj: Record<string, unknown>) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...obj }));
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('ERROR: SUPABASE_URL + SUPABASE_SERVICE_KEY requis dans .env');
    process.exit(1);
  }
  const supabase = createClient(url, key);

  // 1. Charger les artistes éligibles
  const allArtists: ETLArtist[] = JSON.parse(fs.readFileSync(ARTISTS_PATH, 'utf8'));
  const artists = allArtists.filter(a => a.status === 'included' || a.status === 'needs_review');
  log({ job: 'popularity_ingest', step: 'loaded', artists_count: artists.length });

  // 2. Calculer les scores bruts (log1p pour réduire l'écart entre gros et petits)
  const scored = artists.map(a => ({
    genius_id: a.genius_id,
    name: a.name,
    raw: a.fr_collab_count,
    score: Math.log1p(a.fr_collab_count), // log(1 + n)
  }));

  // 3. Normaliser min-max → [0, 1]
  const scores = scored.map(s => s.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const range = maxScore - minScore || 1;

  const normalized = scored.map(s => ({
    ...s,
    norm: (s.score - minScore) / range,
  }));

  // 4. Assigner les tiers par rang (évite les ex-aequo)
  const sortedByScore = [...normalized].sort((a, b) => a.norm - b.norm);
  const n = sortedByScore.length;

  // Assigner le tier selon la position dans le classement
  const tierMap = new Map<number, Category>();
  sortedByScore.forEach((a, rank) => {
    const pct = rank / n;
    let category: Category;
    if (pct >= 0.80) category = 'ultra_mainstream';
    else if (pct >= 0.60) category = 'mainstream';
    else if (pct >= 0.40) category = 'intermediate';
    else if (pct >= 0.20) category = 'niche';
    else category = 'underground';
    tierMap.set(a.genius_id, category);
  });

  const withTier = normalized.map(a => {
    const category = tierMap.get(a.genius_id)!;
    return { genius_id: a.genius_id, category, category_bonus: CATEGORY_BONUS[category] };
  });

  // Debug distribution
  const dist: Record<string, number> = {};
  for (const a of withTier) dist[a.category] = (dist[a.category] || 0) + 1;
  log({ job: 'popularity_ingest', step: 'distribution', total: n, ...dist });

  // 6. Mettre à jour Supabase : UPDATE individuel par genius_id (artistes déjà en base)
  let updated = 0;
  let errors = 0;
  const PARALLEL = 10;
  for (let i = 0; i < withTier.length; i += PARALLEL) {
    const batch = withTier.slice(i, i + PARALLEL);
    await Promise.all(batch.map(async a => {
      const { error } = await supabase
        .from('artists')
        .update({ category: a.category, category_bonus: a.category_bonus })
        .eq('genius_id', a.genius_id);
      if (error) { errors++; }
      else { updated++; }
    }));
    if ((i + PARALLEL) % 100 === 0) {
      process.stdout.write(`  ${i + PARALLEL}/${withTier.length} artistes...\r`);
    }
  }
  console.log('');

  log({ job: 'popularity_ingest', step: 'completed', updated, errors });
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
