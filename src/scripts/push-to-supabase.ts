/**
 * Push ETL data (JSON local) vers Supabase PostgreSQL
 *
 * Usage: npx ts-node src/scripts/push-to-supabase.ts
 *
 * Prerequis:
 * - Avoir lance le seed/etl (fichiers JSON dans src/data/)
 * - Tables creees dans Supabase (executer schema.sql dans le SQL Editor)
 */

import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const DATA_DIR = path.join(__dirname, '..', 'data');
const ARTISTS_PATH = path.join(DATA_DIR, 'artists.json');
const COLLABS_PATH = path.join(DATA_DIR, 'collaborations.json');

interface ETLArtist {
  genius_id: number;
  name: string;
  aliases: string[];
  image_url?: string;
  mbid?: string;
  fr_collab_count: number;
  is_seed: boolean;
  status: 'included' | 'excluded' | 'needs_review';
}

function assignCategory(artist: ETLArtist): { category: string; category_bonus: number } {
  const count = artist.fr_collab_count;
  if (artist.is_seed || count >= 20) return { category: 'ultra_mainstream', category_bonus: 80 };
  if (count >= 10) return { category: 'mainstream', category_bonus: 60 };
  if (count >= 5) return { category: 'intermediate', category_bonus: 40 };
  if (count >= 3) return { category: 'underground', category_bonus: 25 };
  return { category: 'niche', category_bonus: 10 };
}

interface ETLCollaboration {
  artist1_genius_id: number;
  artist1_name: string;
  artist2_genius_id: number;
  artist2_name: string;
  songs: { genius_id: number; title: string }[];
  confidence: number;
  sources: string[];
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
    console.error('  SUPABASE_URL:', url ? '✓' : '✗ MISSING');
    console.error('  SUPABASE_SERVICE_KEY:', key ? '✓' : '✗ MISSING (not SUPABASE_ANON_KEY!)');
    process.exit(1);
  }

  console.log('Connecting to Supabase:', url);
  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  // Charger les donnees JSON
  if (!fs.existsSync(ARTISTS_PATH) || !fs.existsSync(COLLABS_PATH)) {
    console.error('ERROR: Run the ETL seed first (npm run seed)');
    process.exit(1);
  }

  const artistsData: ETLArtist[] = JSON.parse(fs.readFileSync(ARTISTS_PATH, 'utf-8'));
  const collabsData: ETLCollaboration[] = JSON.parse(fs.readFileSync(COLLABS_PATH, 'utf-8'));

  console.log(`Loaded ${artistsData.length} artists, ${collabsData.length} collaborations`);

  // ---- UPSERT Artists ----
  console.log('\n=== Uploading artists ===');

  // Filtrer seulement les artistes inclus ou needs_review (pas les exclus)
  const relevantArtists = artistsData.filter(a => a.status !== 'excluded');
  console.log(`  ${relevantArtists.length} relevant artists (included + needs_review)`);

  const BATCH_SIZE = 100;
  let artistCount = 0;

  for (let i = 0; i < relevantArtists.length; i += BATCH_SIZE) {
    const batch = relevantArtists.slice(i, i + BATCH_SIZE).map(a => {
      const { category, category_bonus } = assignCategory(a);
      return {
        genius_id: a.genius_id,
        name: a.name,
        image_url: a.image_url || null,
        status: a.status,
        category,
        category_bonus,
      };
    });

    const { error } = await supabase
      .from('artists')
      .upsert(batch, { onConflict: 'genius_id' });

    if (error) {
      console.error(`  Error upserting artists batch ${i}:`, error.message, error.code, error.details);
    } else {
      artistCount += batch.length;
      process.stdout.write(`\r  ${artistCount}/${relevantArtists.length} artists...`);
    }
  }

  console.log(`  ${artistCount} artists uploaded`);

  // ---- UPSERT Aliases ----
  console.log('\n=== Uploading aliases ===');

  let aliasCount = 0;
  for (const artist of relevantArtists) {
    if (artist.aliases.length === 0) continue;

    // Trouver l'ID interne de l'artiste
    const { data: dbArtist } = await supabase
      .from('artists')
      .select('id')
      .eq('genius_id', artist.genius_id)
      .single();

    if (!dbArtist) continue;

    for (const alias of artist.aliases) {
      const { error } = await supabase
        .from('artist_aliases')
        .upsert(
          { artist_id: dbArtist.id, alias },
          { onConflict: 'artist_id,alias' }
        );

      if (!error) aliasCount++;
    }
  }

  console.log(`  ${aliasCount} aliases uploaded`);

  // ---- UPSERT Collaborations ----
  console.log('\n=== Uploading collaborations ===');

  // Construire un index genius_id -> db_id (avec pagination)
  const allDbArtists: { id: string; genius_id: number }[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from('artists').select('id, genius_id').range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    allDbArtists.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`  Fetched ${allDbArtists.length} artists from Supabase for mapping`);

  const geniusToDbId = new Map<number, string>(); // genius_id -> UUID
  for (const a of allDbArtists) {
    if (a.genius_id) geniusToDbId.set(Number(a.genius_id), String(a.id));
  }

  let collabCount = 0;

  // Préparer toutes les collabs valides
  const collabBatchData: Array<{
    artist1_id: string; artist2_id: string; song_count: number;
    pair_bonus: number; confidence: number; sources: string[];
    origSongs: { genius_id: number; title: string }[];
    artist1_name: string; artist2_name: string;
  }> = [];

  for (const collab of collabsData) {
    const a1Id = geniusToDbId.get(collab.artist1_genius_id);
    const a2Id = geniusToDbId.get(collab.artist2_genius_id);
    if (!a1Id || !a2Id) continue;

    const [minId, maxId] = a1Id < a2Id ? [a1Id, a2Id] : [a2Id, a1Id];
    collabBatchData.push({
      artist1_id: minId,
      artist2_id: maxId,
      song_count: collab.songs.length,
      pair_bonus: collab.songs.length >= 5 ? 30 : collab.songs.length >= 3 ? 20 : collab.songs.length >= 2 ? 10 : 0,
      confidence: collab.confidence,
      sources: collab.sources,
      origSongs: collab.songs,
      artist1_name: collab.artist1_name,
      artist2_name: collab.artist2_name,
    });
  }

  console.log(`  ${collabBatchData.length} collaborations to upload`);

  // Upsert en batch (sans songs pour la vitesse)
  const COLLAB_BATCH = 200;
  for (let i = 0; i < collabBatchData.length; i += COLLAB_BATCH) {
    const batch = collabBatchData.slice(i, i + COLLAB_BATCH).map(c => ({
      artist1_id: c.artist1_id,
      artist2_id: c.artist2_id,
      song_count: c.song_count,
      pair_bonus: c.pair_bonus,
      confidence: c.confidence,
      sources: c.sources,
    }));

    const { error } = await supabase
      .from('collaborations')
      .upsert(batch, { onConflict: 'artist1_id,artist2_id' });

    if (error) {
      console.error(`  Collab batch error at ${i}:`, error.message);
    } else {
      collabCount += batch.length;
    }
    process.stdout.write(`\r  ${Math.min(i + COLLAB_BATCH, collabBatchData.length)}/${collabBatchData.length} collabs...`);
  }

  console.log(`\n  ${collabCount} collaborations uploaded`);

  console.log('\n=== Done ===');
}

main().catch(err => {
  console.error('Push to Supabase failed:', err);
  process.exit(1);
});
