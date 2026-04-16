/**
 * ETL Script — Roland-Gamos
 *
 * Importe les artistes et collaborations depuis Genius API
 * et les stocke en JSON local (migration Supabase a venir).
 *
 * Usage:
 *   npm run seed              # Seed initial (~40 artistes)
 *   npm run etl               # ETL complet (expansion automatique)
 *   npm run etl -- --artist "Hamza"  # Un artiste specifique
 */

import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { GeniusService, GeniusArtist, GeniusSong } from '../services/GeniusService';
import { MusicBrainzService } from '../services/MusicBrainzService';

// ============================================================
// Types
// ============================================================

interface ETLArtist {
  genius_id: number;
  name: string;
  aliases: string[];
  image_url?: string;
  mbid?: string;
  /** Nombre de collabs avec des artistes FR de la base */
  fr_collab_count: number;
  /** Inclus dans la seed list */
  is_seed: boolean;
  /** Statut d'inclusion */
  status: 'included' | 'excluded' | 'needs_review';
  songs_fetched: boolean;
}

interface ETLCollaboration {
  artist1_genius_id: number;
  artist1_name: string;
  artist2_genius_id: number;
  artist2_name: string;
  /** Titres en commun */
  songs: { genius_id: number; title: string }[];
  /** Score de confiance */
  confidence: number;
  /** Sources qui ont confirme */
  sources: ('genius' | 'musicbrainz')[];
}

interface ETLCheckpoint {
  phase: 'seed' | 'wave1' | 'wave2' | 'wave3' | 'done';
  processed_artist_ids: number[];
  queue: number[];
  timestamp: string;
}

// ============================================================
// Paths
// ============================================================

const DATA_DIR = path.join(__dirname, '..', 'data');
const ARTISTS_PATH = path.join(DATA_DIR, 'artists.json');
const COLLABS_PATH = path.join(DATA_DIR, 'collaborations.json');
const CHECKPOINT_PATH = path.join(DATA_DIR, 'etl_checkpoint.json');
const SEED_PATH = path.join(__dirname, 'seed_artists.json');

// ============================================================
// Data store (en memoire pendant l'ETL, sauvegarde en JSON)
// ============================================================

let artists: Map<number, ETLArtist> = new Map();
let collaborations: Map<string, ETLCollaboration> = new Map();

function collabKey(id1: number, id2: number): string {
  return id1 < id2 ? `${id1}|${id2}` : `${id2}|${id1}`;
}

function loadExistingData(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(ARTISTS_PATH)) {
    const data: ETLArtist[] = JSON.parse(fs.readFileSync(ARTISTS_PATH, 'utf-8'));
    for (const a of data) {
      artists.set(a.genius_id, a);
    }
    console.log(`  Loaded ${artists.size} existing artists`);
  }

  if (fs.existsSync(COLLABS_PATH)) {
    const data: ETLCollaboration[] = JSON.parse(fs.readFileSync(COLLABS_PATH, 'utf-8'));
    for (const c of data) {
      collaborations.set(collabKey(c.artist1_genius_id, c.artist2_genius_id), c);
    }
    console.log(`  Loaded ${collaborations.size} existing collaborations`);
  }
}

function saveData(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const artistsArr = Array.from(artists.values()).sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(ARTISTS_PATH, JSON.stringify(artistsArr, null, 2), 'utf-8');

  const collabsArr = Array.from(collaborations.values()).sort(
    (a, b) => a.artist1_name.localeCompare(b.artist1_name) || a.artist2_name.localeCompare(b.artist2_name)
  );
  fs.writeFileSync(COLLABS_PATH, JSON.stringify(collabsArr, null, 2), 'utf-8');

  console.log(`  Saved ${artistsArr.length} artists, ${collabsArr.length} collaborations`);
}

function loadCheckpoint(): ETLCheckpoint | null {
  if (fs.existsSync(CHECKPOINT_PATH)) {
    return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf-8'));
  }
  return null;
}

function saveCheckpoint(checkpoint: ETLCheckpoint): void {
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2), 'utf-8');
}

// ============================================================
// ETL Logic
// ============================================================

/**
 * Traite un artiste : recupere ses morceaux, extrait les featured artists,
 * cree les collaborations.
 */
async function processArtist(
  genius: GeniusService,
  artistId: number,
  newArtistQueue: number[]
): Promise<void> {
  const artist = artists.get(artistId);
  if (!artist) return;
  if (artist.songs_fetched) {
    console.log(`  [skip] ${artist.name} — already processed`);
    return;
  }

  console.log(`  Processing ${artist.name} (genius:${artistId})...`);

  const songs = await genius.getArtistSongs(artistId, { maxPages: 5, perPage: 50 });
  console.log(`    Found ${songs.length} songs`);

  let newCollabs = 0;

  for (const song of songs) {
    // Recuperer tous les artistes impliques (primary + featured)
    const allArtists: GeniusArtist[] = [song.primary_artist, ...song.featured_artists];

    // Pour chaque paire artiste-featured
    for (const featArtist of allArtists) {
      if (featArtist.id === artistId) continue;

      // Ajouter l'artiste s'il n'existe pas encore
      if (!artists.has(featArtist.id)) {
        artists.set(featArtist.id, {
          genius_id: featArtist.id,
          name: featArtist.name,
          aliases: [],
          image_url: featArtist.image_url,
          fr_collab_count: 0,
          is_seed: false,
          status: 'excluded', // Sera re-evalue apres
          songs_fetched: false,
        });
      }

      // Creer/enrichir la collaboration
      const key = collabKey(artistId, featArtist.id);
      const existing = collaborations.get(key);

      if (existing) {
        // Ajouter le titre s'il n'est pas deja present
        if (!existing.songs.some(s => s.genius_id === song.id)) {
          existing.songs.push({ genius_id: song.id, title: song.title });
        }
      } else {
        const [a1id, a1name, a2id, a2name] =
          artistId < featArtist.id
            ? [artistId, artist.name, featArtist.id, featArtist.name]
            : [featArtist.id, featArtist.name, artistId, artist.name];

        collaborations.set(key, {
          artist1_genius_id: a1id,
          artist1_name: a1name,
          artist2_genius_id: a2id,
          artist2_name: a2name,
          songs: [{ genius_id: song.id, title: song.title }],
          confidence: 0.6, // Genius seul
          sources: ['genius'],
        });
        newCollabs++;
      }

      // Ajouter a la queue si nouvel artiste non-traite
      if (!artists.get(featArtist.id)!.songs_fetched && !newArtistQueue.includes(featArtist.id)) {
        newArtistQueue.push(featArtist.id);
      }
    }
  }

  artist.songs_fetched = true;
  console.log(`    ${newCollabs} new collaborations found`);
}

/**
 * Met a jour les compteurs fr_collab_count et le statut d'inclusion
 * Critere: 3+ collabs avec des artistes deja inclus (seed ou inclus)
 */
function updateEcosystemStatus(): void {
  const includedIds = new Set<number>();

  // Seeds sont toujours inclus
  for (const [id, artist] of artists) {
    if (artist.is_seed) {
      artist.status = 'included';
      includedIds.add(id);
    }
  }

  // Iterations pour propager l'inclusion
  let changed = true;
  while (changed) {
    changed = false;

    for (const [id, artist] of artists) {
      if (artist.status === 'included') continue;

      // Compter les collabs avec des artistes inclus
      let count = 0;
      for (const [, collab] of collaborations) {
        const partnerId =
          collab.artist1_genius_id === id ? collab.artist2_genius_id :
          collab.artist2_genius_id === id ? collab.artist1_genius_id :
          null;

        if (partnerId !== null && includedIds.has(partnerId)) {
          count++;
        }
      }

      artist.fr_collab_count = count;

      if (count >= 3) {
        artist.status = 'included';
        includedIds.add(id);
        changed = true;
      } else if (count === 2) {
        artist.status = 'needs_review';
      } else {
        artist.status = 'excluded';
      }
    }
  }
}

/**
 * Phase optionnelle: verification MusicBrainz pour les collabs Genius
 * Augmente la confiance de 0.6 a 1.0
 */
async function verifyWithMusicBrainz(mb: MusicBrainzService): Promise<void> {
  console.log('\n=== Phase 3: Verification MusicBrainz ===');

  const collabsToVerify = Array.from(collaborations.values()).filter(
    c => !c.sources.includes('musicbrainz') && c.confidence < 1.0
  );

  console.log(`  ${collabsToVerify.length} collaborations to verify`);

  let verified = 0;
  let failed = 0;

  for (let i = 0; i < collabsToVerify.length; i++) {
    const collab = collabsToVerify[i];

    if (i > 0 && i % 10 === 0) {
      console.log(`  Progress: ${i}/${collabsToVerify.length} (${verified} verified, ${failed} failed)`);
      saveData(); // Sauvegarde intermediaire
    }

    try {
      const hasCollab = await mb.hasCollaboration(collab.artist1_name, collab.artist2_name);

      if (hasCollab) {
        collab.sources.push('musicbrainz');
        collab.confidence = 1.0;
        verified++;
      } else {
        failed++;
      }
    } catch {
      // Erreur reseau, on garde le score Genius seul
      failed++;
    }

    // Rate limit MusicBrainz: 1 req/sec
    await new Promise(resolve => setTimeout(resolve, 1100));
  }

  console.log(`  Verification done: ${verified} confirmed, ${failed} unconfirmed`);
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isSeedOnly = args.includes('--seed');
  const specificArtist = args.find((_, i) => args[i - 1] === '--artist');
  const skipMB = args.includes('--skip-mb');

  const token = process.env.GENIUS_ACCESS_TOKEN;
  if (!token) {
    console.error('ERROR: GENIUS_ACCESS_TOKEN is not set');
    console.error('Set it in .env or pass via environment variable');
    process.exit(1);
  }

  const genius = new GeniusService(token);
  const mb = new MusicBrainzService();

  console.log('=== Roland-Gamos ETL ===\n');

  // Charger les donnees existantes
  console.log('Loading existing data...');
  loadExistingData();

  // Charger le checkpoint
  const checkpoint = loadCheckpoint();
  if (checkpoint) {
    console.log(`  Resuming from checkpoint: phase=${checkpoint.phase}, queue=${checkpoint.queue.length}`);
  }

  // ---- Mode artiste specifique ----
  if (specificArtist) {
    console.log(`\nProcessing single artist: "${specificArtist}"`);
    const found = await genius.searchArtist(specificArtist);
    if (!found) {
      console.error(`Artist "${specificArtist}" not found on Genius`);
      process.exit(1);
    }

    if (!artists.has(found.id)) {
      artists.set(found.id, {
        genius_id: found.id,
        name: found.name,
        aliases: [],
        image_url: found.image_url,
        fr_collab_count: 0,
        is_seed: false,
        status: 'needs_review',
        songs_fetched: false,
      });
    }

    const queue: number[] = [];
    await processArtist(genius, found.id, queue);
    updateEcosystemStatus();
    saveData();
    printReport();
    return;
  }

  // ---- Phase SEED ----
  console.log('\n=== Phase SEED ===');
  const seedData = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8'));
  const seedEntries: (string | { name: string; genius_id: number })[] = seedData.artists;
  const seedQueue: number[] = [];

  // Resoudre les seed artists sur Genius
  for (const entry of seedEntries) {
    const name = typeof entry === 'string' ? entry : entry.name;
    const directId = typeof entry === 'object' ? entry.genius_id : null;

    // Verifier si deja present
    const existing = Array.from(artists.values()).find(
      a => a.name.toLowerCase() === name.toLowerCase() && a.is_seed
    );
    if (existing) {
      if (!existing.songs_fetched) seedQueue.push(existing.genius_id);
      continue;
    }

    console.log(`  Resolving seed artist: ${name}${directId ? ` (id:${directId})` : ''}`);

    let found: { id: number; name: string; image_url?: string } | null = null;

    if (directId) {
      // ID direct fourni — recuperer les details
      const detail = await genius.getArtist(directId);
      if (detail) found = detail;
    } else {
      found = await genius.searchArtist(name);
    }

    if (found) {
      if (!artists.has(found.id)) {
        artists.set(found.id, {
          genius_id: found.id,
          name: found.name,
          aliases: found.name.toLowerCase() !== name.toLowerCase() ? [name] : [],
          image_url: found.image_url,
          fr_collab_count: 0,
          is_seed: true,
          status: 'included',
          songs_fetched: false,
        });
      } else {
        const a = artists.get(found.id)!;
        a.is_seed = true;
        a.status = 'included';
      }
      seedQueue.push(found.id);
    } else {
      console.warn(`  WARNING: Seed artist "${name}" not found on Genius`);
    }

    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log(`  ${seedQueue.length} seed artists resolved`);

  // Traiter les seed artists
  const processedIds: Set<number> = new Set(
    checkpoint?.processed_artist_ids || []
  );

  for (const id of seedQueue) {
    if (processedIds.has(id)) continue;

    const dummyQueue: number[] = [];
    await processArtist(genius, id, dummyQueue);
    processedIds.add(id);

    // Sauvegarde periodique
    if (processedIds.size % 5 === 0) {
      saveData();
      saveCheckpoint({
        phase: 'seed',
        processed_artist_ids: Array.from(processedIds),
        queue: [],
        timestamp: new Date().toISOString(),
      });
    }
  }

  updateEcosystemStatus();
  saveData();
  console.log(`  Seed phase done`);

  if (isSeedOnly) {
    printReport();
    return;
  }

  // ---- Phase VAGUE 1: Ultra mainstream (feats directs des seeds) ----
  console.log('\n=== Phase VAGUE 1: Ultra mainstream ===');

  const wave1Queue = Array.from(artists.values())
    .filter(a => !a.songs_fetched && a.fr_collab_count >= 2)
    .map(a => a.genius_id);

  console.log(`  ${wave1Queue.length} artists in wave 1 queue`);

  for (const id of wave1Queue) {
    if (processedIds.has(id)) continue;

    const dummyQueue: number[] = [];
    await processArtist(genius, id, dummyQueue);
    processedIds.add(id);

    if (processedIds.size % 10 === 0) {
      updateEcosystemStatus();
      saveData();
      saveCheckpoint({
        phase: 'wave1',
        processed_artist_ids: Array.from(processedIds),
        queue: wave1Queue.filter(qid => !processedIds.has(qid)),
        timestamp: new Date().toISOString(),
      });
    }
  }

  updateEcosystemStatus();
  saveData();
  console.log(`  Wave 1 done`);

  // ---- Phase VAGUE 2: Mainstream (feats des feats) ----
  console.log('\n=== Phase VAGUE 2: Mainstream ===');

  const wave2Queue = Array.from(artists.values())
    .filter(a => !a.songs_fetched && a.status === 'included')
    .map(a => a.genius_id);

  console.log(`  ${wave2Queue.length} artists in wave 2 queue`);

  for (const id of wave2Queue) {
    if (processedIds.has(id)) continue;

    const dummyQueue: number[] = [];
    await processArtist(genius, id, dummyQueue);
    processedIds.add(id);

    if (processedIds.size % 10 === 0) {
      updateEcosystemStatus();
      saveData();
      saveCheckpoint({
        phase: 'wave2',
        processed_artist_ids: Array.from(processedIds),
        queue: wave2Queue.filter(qid => !processedIds.has(qid)),
        timestamp: new Date().toISOString(),
      });
    }
  }

  updateEcosystemStatus();
  saveData();
  console.log(`  Wave 2 done`);

  // ---- Phase VAGUE 3: Verification MusicBrainz ----
  if (!skipMB) {
    await verifyWithMusicBrainz(mb);
    saveData();
  }

  // Nettoyage checkpoint
  saveCheckpoint({
    phase: 'done',
    processed_artist_ids: Array.from(processedIds),
    queue: [],
    timestamp: new Date().toISOString(),
  });

  printReport();
}

function printReport(): void {
  console.log('\n=== ETL Report ===');

  const allArtists = Array.from(artists.values());
  const included = allArtists.filter(a => a.status === 'included');
  const needsReview = allArtists.filter(a => a.status === 'needs_review');
  const excluded = allArtists.filter(a => a.status === 'excluded');
  const seeds = allArtists.filter(a => a.is_seed);

  console.log(`  Total artists discovered: ${allArtists.length}`);
  console.log(`  Seed artists: ${seeds.length}`);
  console.log(`  Included (3+ FR collabs): ${included.length}`);
  console.log(`  Needs review (2 collabs): ${needsReview.length}`);
  console.log(`  Excluded (<2 collabs): ${excluded.length}`);
  console.log(`  Total collaborations: ${collaborations.size}`);

  const highConf = Array.from(collaborations.values()).filter(c => c.confidence >= 1.0);
  const medConf = Array.from(collaborations.values()).filter(c => c.confidence >= 0.6 && c.confidence < 1.0);
  console.log(`  High confidence (Genius+MB): ${highConf.length}`);
  console.log(`  Medium confidence (Genius only): ${medConf.length}`);

  if (needsReview.length > 0 && needsReview.length <= 20) {
    console.log('\n  Needs review:');
    for (const a of needsReview) {
      console.log(`    - ${a.name} (${a.fr_collab_count} FR collabs)`);
    }
  }
}

// ============================================================
// Run
// ============================================================

main().catch(err => {
  console.error('ETL failed:', err);
  // Sauvegarder quand meme les donnees partielles
  try {
    saveData();
    console.log('  Partial data saved.');
  } catch {
    console.error('  Failed to save partial data.');
  }
  process.exit(1);
});
