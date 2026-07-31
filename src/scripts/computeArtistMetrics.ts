/**
 * Calcule et persiste les métriques utilisées par la formule de score unifiée
 * (CLAUDE_3.md §2.4) :
 *   - artists.collab_degree        : nombre de collaborateurs distincts
 *   - collaborations.pair_family_count : nombre de familles de titres distinctes pour la paire
 *
 * Source de données : les mêmes fichiers JSON locaux que push-to-supabase.ts
 * (src/data/artists.json, src/data/collaborations.json) — collaboration_songs
 * n'est jamais peuplée par l'ETL actuel, donc on recalcule depuis les titres
 * bruts déjà présents dans le JSON plutôt que depuis cette table vide.
 *
 * Usage: npm run metrics:compute
 * Prérequis: .env avec SUPABASE_URL + SUPABASE_SERVICE_KEY, et la migration
 * 20260731000000_scoring_metrics_cosmetics.sql déjà appliquée.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { normalizeTitleToFamily } from '../services/titleFamilyNormalizer';

const DATA_DIR = path.join(__dirname, '..', 'data');
const ARTISTS_PATH = path.join(DATA_DIR, 'artists.json');
const COLLABS_PATH = path.join(DATA_DIR, 'collaborations.json');

interface ETLCollaboration {
  artist1_genius_id: number;
  artist2_genius_id: number;
  songs: { genius_id: number; title: string }[];
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
    process.exit(1);
  }

  if (!fs.existsSync(ARTISTS_PATH) || !fs.existsSync(COLLABS_PATH)) {
    console.error('ERROR: src/data/artists.json et collaborations.json requis (npm run seed / etl)');
    process.exit(1);
  }

  console.log('Connecting to Supabase:', url);
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const collabsData: ETLCollaboration[] = JSON.parse(fs.readFileSync(COLLABS_PATH, 'utf-8'));
  console.log(`Loaded ${collabsData.length} collaborations from JSON`);

  // Map genius_id -> UUID Supabase (même pattern que push-to-supabase.ts)
  const allDbArtists: any[] = [];
  const PAGE_SIZE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('artists').select('id, genius_id').range(from, from + PAGE_SIZE - 1);
    if (error) { console.error('Fetch artists error:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    allDbArtists.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  console.log(`Fetched ${allDbArtists.length} artists from Supabase for mapping`);

  const geniusToDbId = new Map<number, string>();
  for (const a of allDbArtists) {
    if (a.genius_id) geniusToDbId.set(Number(a.genius_id), String(a.id));
  }

  // ---- pair_family_count par collaboration + collab_degree par artiste ----
  const collabDegree = new Map<string, Set<string>>(); // uuid -> Set<uuid partenaires>
  const pairUpdates: { artist1_id: string; artist2_id: string; pair_family_count: number }[] = [];

  for (const collab of collabsData) {
    const a1 = geniusToDbId.get(collab.artist1_genius_id);
    const a2 = geniusToDbId.get(collab.artist2_genius_id);
    if (!a1 || !a2) continue;

    const families = new Set<string>();
    for (const song of collab.songs) {
      const family = normalizeTitleToFamily(song.title);
      if (family) families.add(family);
    }

    const [minId, maxId] = a1 < a2 ? [a1, a2] : [a2, a1];
    pairUpdates.push({ artist1_id: minId, artist2_id: maxId, pair_family_count: families.size });

    if (!collabDegree.has(a1)) collabDegree.set(a1, new Set());
    if (!collabDegree.has(a2)) collabDegree.set(a2, new Set());
    collabDegree.get(a1)!.add(a2);
    collabDegree.get(a2)!.add(a1);
  }

  console.log(`Computed pair_family_count for ${pairUpdates.length} collaborations`);
  console.log(`Computed collab_degree for ${collabDegree.size} artists`);

  // ---- Persist pair_family_count (upsert, même clé de conflit que push-to-supabase.ts) ----
  const COLLAB_BATCH = 200;
  let collabUpdated = 0;
  for (let i = 0; i < pairUpdates.length; i += COLLAB_BATCH) {
    const batch = pairUpdates.slice(i, i + COLLAB_BATCH);
    const { error } = await supabase
      .from('collaborations')
      .upsert(batch, { onConflict: 'artist1_id,artist2_id' });
    if (error) {
      console.error(`  Collab batch error at ${i}:`, error.message);
    } else {
      collabUpdated += batch.length;
    }
    process.stdout.write(`\r  pair_family_count: ${Math.min(i + COLLAB_BATCH, pairUpdates.length)}/${pairUpdates.length}...`);
  }
  console.log(`\n  ${collabUpdated} collaborations updated`);

  // ---- Persist collab_degree (update individuel par artiste) ----
  const artistEntries = Array.from(collabDegree.entries());
  let artistUpdated = 0;
  const ARTIST_BATCH = 50;
  for (let i = 0; i < artistEntries.length; i += ARTIST_BATCH) {
    const batch = artistEntries.slice(i, i + ARTIST_BATCH);
    await Promise.all(batch.map(async ([id, partners]) => {
      const { error } = await supabase.from('artists').update({ collab_degree: partners.size }).eq('id', id);
      if (!error) artistUpdated++;
    }));
    process.stdout.write(`\r  collab_degree: ${Math.min(i + ARTIST_BATCH, artistEntries.length)}/${artistEntries.length}...`);
  }
  console.log(`\n  ${artistUpdated} artists updated`);

  console.log('\n=== Done ===');
}

main().catch(err => {
  console.error('computeArtistMetrics failed:', err);
  process.exit(1);
});
