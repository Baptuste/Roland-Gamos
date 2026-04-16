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
    process.exit(1);
  }

  const supabase = createClient(url, key);

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
    const batch = relevantArtists.slice(i, i + BATCH_SIZE).map(a => ({
      genius_id: a.genius_id,
      name: a.name,
      image_url: a.image_url || null,
      mbid: a.mbid || null,
      fr_collab_count: a.fr_collab_count,
      is_seed: a.is_seed,
      status: a.status,
    }));

    const { error } = await supabase
      .from('artists')
      .upsert(batch, { onConflict: 'genius_id' });

    if (error) {
      console.error(`  Error upserting artists batch ${i}:`, error.message);
    } else {
      artistCount += batch.length;
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

  // Construire un index genius_id -> db_id
  const { data: allDbArtists } = await supabase
    .from('artists')
    .select('id, genius_id');

  if (!allDbArtists) {
    console.error('  Error fetching artists for collaboration mapping');
    return;
  }

  const geniusToDbId = new Map<number, number>();
  for (const a of allDbArtists) {
    geniusToDbId.set(a.genius_id, a.id);
  }

  let collabCount = 0;
  let songCount = 0;

  for (const collab of collabsData) {
    const a1Id = geniusToDbId.get(collab.artist1_genius_id);
    const a2Id = geniusToDbId.get(collab.artist2_genius_id);

    // Seulement les collabs entre artistes inclus/needs_review
    if (!a1Id || !a2Id) continue;

    // S'assurer que artist1_id < artist2_id (contrainte CHECK)
    const [minId, maxId] = a1Id < a2Id ? [a1Id, a2Id] : [a2Id, a1Id];

    const { data: collabRow, error: collabError } = await supabase
      .from('collaborations')
      .upsert(
        {
          artist1_id: minId,
          artist2_id: maxId,
          song_count: collab.songs.length,
          confidence: collab.confidence,
          sources: collab.sources,
        },
        { onConflict: 'artist1_id,artist2_id' }
      )
      .select('id')
      .single();

    if (collabError) {
      // Ignorer les doublons silencieusement
      continue;
    }

    collabCount++;

    // Upload les titres
    if (collabRow && collab.songs.length > 0) {
      const songBatch = collab.songs.map(s => ({
        collaboration_id: collabRow.id,
        genius_song_id: s.genius_id,
        title: s.title,
      }));

      const { error: songError } = await supabase
        .from('collaboration_songs')
        .upsert(songBatch, { onConflict: 'collaboration_id,genius_song_id' });

      if (!songError) songCount += songBatch.length;
    }
  }

  console.log(`  ${collabCount} collaborations uploaded`);
  console.log(`  ${songCount} collaboration songs uploaded`);

  console.log('\n=== Done ===');
}

main().catch(err => {
  console.error('Push to Supabase failed:', err);
  process.exit(1);
});
