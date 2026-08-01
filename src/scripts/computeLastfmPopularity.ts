/**
 * Popularité des artistes via Last.fm — remplace l'ancien système de catégorisation
 * basé sur fr_collab_count (proxy faible : un artiste peu connecté dans ce dataset
 * local n'est pas forcément peu populaire dans la vraie vie, et inversement).
 *
 * Pourquoi Last.fm et pas Spotify : l'API Web Spotify a supprimé les champs
 * `popularity`/`followers` de ses endpoints Get Artist en "Development Mode" (migration
 * février 2026) ; Roland-Gamos n'a aucune app Spotify existante donc tomberait dans ce
 * mode restreint. Les auditeurs mensuels Spotify n'ont de toute façon jamais été exposés
 * par l'API officielle (uniquement visibles sur l'app/le site). Last.fm expose
 * légalement et gratuitement `stats.listeners`/`stats.playcount` via artist.getinfo.
 *
 * Deux phases :
 *   1. Ingestion : pour chaque artiste (par lots), interroge Last.fm par mbid (priorité,
 *      déjà résolu via MusicBrainz en amont — évite les faux positifs sur homonymes)
 *      ou par nom en secours, stocke lastfm_listeners/lastfm_playcount/lastfm_synced_at.
 *   2. Catégorisation : une fois l'ingestion terminée, calcule 7 paliers en quantiles
 *      relatifs sur lastfm_listeners (PAS de seuils absolus fixes — un artiste très
 *      niche mais avec peu d'historique data peut avoir un lastfm_listeners bas sans
 *      être moins "trouvable" en pratique ; les quantiles s'adaptent à la distribution
 *      réelle plutôt que de rater des cas comme un ancien seuil fixe échouerait à faire),
 *      assigne category/category_bonus.
 *
 * Usage: npm run popularity:lastfm
 * Prérequis :
 *   - LASTFM_API_KEY dans .env (créer une clé sur https://www.last.fm/api/account/create)
 *   - Migration 20260801000000_lastfm_popularity.sql déjà appliquée
 *   - SUPABASE_URL + SUPABASE_SERVICE_KEY dans .env
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/';
const PAGE_SIZE = 1000;
const REQUEST_DELAY_MS = 300; // ~3.3 req/s — conservateur (Last.fm tolère ~5 req/s)

/**
 * 7 paliers, du plus confidentiel (moins d'auditeurs) au plus mainstream (le plus
 * d'auditeurs). Doit rester synchronisé avec ArtistCategory (src/services/ScoringService.ts).
 */
export const CATEGORY_TIERS = [
  'confidentiel',
  'underground',
  'niche',
  'intermediate',
  'connu',
  'mainstream',
  'ultra_mainstream',
] as const;

/**
 * category_bonus numérique legacy — persisté pour cohérence avec le schéma existant,
 * mais non utilisé par la formule de score active (ScoringService.calculateCategoryMult
 * utilise directement le nom de catégorie, pas ce nombre). Échelle 10→80 conservée
 * pour rester dans l'esprit de l'ancienne échelle assignCategory().
 */
export const CATEGORY_BONUS: Record<(typeof CATEGORY_TIERS)[number], number> = {
  confidentiel: 10,
  underground: 20,
  niche: 33,
  intermediate: 45,
  connu: 55,
  mainstream: 65,
  ultra_mainstream: 80,
};

export interface ArtistListenerEntry {
  id: string;
  listeners: number;
}

export interface CategoryAssignment {
  id: string;
  category: (typeof CATEGORY_TIERS)[number];
  category_bonus: number;
}

/**
 * Répartit les artistes en 7 tranches de taille égale (quantiles relatifs) selon
 * lastfm_listeners croissant. Fonction pure, testable sans dépendance réseau/DB.
 */
export function categorizeByQuantile(entries: ArtistListenerEntry[]): CategoryAssignment[] {
  if (entries.length === 0) return [];

  const sorted = [...entries].sort((a, b) => a.listeners - b.listeners);
  const tierCount = CATEGORY_TIERS.length;
  const bucketSize = sorted.length / tierCount;

  return sorted.map((entry, index) => {
    const tierIndex = Math.min(tierCount - 1, Math.floor(index / bucketSize));
    const category = CATEGORY_TIERS[tierIndex];
    return { id: entry.id, category, category_bonus: CATEGORY_BONUS[category] };
  });
}

interface LastfmArtistInfo {
  listeners: number;
  playcount: number;
}

/**
 * Normalise les guillemets/apostrophes typographiques (venus de Genius) vers
 * leurs équivalents ASCII droits. Bug trouvé le 2026-08-01 : Last.fm indexe
 * "Rim'K" (apostrophe droite) et "Rim’K" (typographique) comme deux artistes
 * différents — le second est une page quasi vide (66 auditeurs vs 76 045 pour
 * la bonne page). Sans cette normalisation, tout artiste dont le nom contient
 * une apostrophe/un guillemet typographique matche silencieusement la mauvaise
 * page Last.fm (197 artistes concernés sur la base actuelle).
 */
export function normalizeArtistNameForLastfm(name: string): string {
  return name
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
}

/**
 * Interroge Last.fm artist.getinfo. Retourne null si non trouvé / erreur / clé absente
 * (log mais ne fait jamais planter le pipeline pour un seul artiste manquant).
 */
export async function fetchLastfmArtistInfo(
  apiKey: string,
  params: { mbid?: string | null; name?: string | null }
): Promise<LastfmArtistInfo | null> {
  const url = new URL(LASTFM_API_URL);
  url.searchParams.set('method', 'artist.getinfo');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('format', 'json');
  if (params.mbid) {
    url.searchParams.set('mbid', params.mbid);
  } else if (params.name) {
    url.searchParams.set('artist', normalizeArtistNameForLastfm(params.name));
  } else {
    return null;
  }

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data: any = await res.json();
    if (data.error || !data.artist?.stats) return null;
    return {
      listeners: Number(data.artist.stats.listeners) || 0,
      playcount: Number(data.artist.stats.playcount) || 0,
    };
  } catch (err) {
    console.error(`  Last.fm fetch failed for ${params.mbid || params.name}:`, (err as Error).message);
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    console.error('ERROR: LASTFM_API_KEY manquante dans .env — crée une clé sur https://www.last.fm/api/account/create');
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  // ---- Phase 1 : ingestion ----
  console.log('=== Phase 1: ingestion Last.fm ===');
  let from = 0;
  let ingested = 0;
  let notFound = 0;

  while (true) {
    const { data, error } = await supabase
      .from('artists')
      .select('id, name')
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error('Fetch artists error:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    for (const artist of data) {
      // Pas de colonne mbid en base (jamais peuplée par l'ETL — vérifié : 0/21141
      // artistes locaux ont un mbid malgré le champ optionnel sur ETLArtist),
      // donc matching par nom uniquement pour l'instant.
      const info = await fetchLastfmArtistInfo(apiKey, { name: artist.name });
      if (info) {
        const { error: updateError } = await supabase
          .from('artists')
          .update({
            lastfm_listeners: info.listeners,
            lastfm_playcount: info.playcount,
            lastfm_synced_at: new Date().toISOString(),
          })
          .eq('id', artist.id);
        if (updateError) {
          console.error(`\nUpdate error for artist ${artist.id} (${artist.name}):`, updateError.message);
          process.exit(1);
        }
        ingested++;
      } else {
        notFound++;
      }
      process.stdout.write(`\r  ingérés: ${ingested}, introuvables: ${notFound}...`);
      await sleep(REQUEST_DELAY_MS);
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  console.log(`\nIngestion terminée : ${ingested} artistes synchronisés, ${notFound} introuvables sur Last.fm.`);

  // ---- Phase 2 : catégorisation par quantiles ----
  console.log('\n=== Phase 2: catégorisation (7 paliers, quantiles) ===');
  const allEntries: ArtistListenerEntry[] = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('artists')
      .select('id, lastfm_listeners')
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error('Fetch listeners error:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    for (const a of data) {
      allEntries.push({ id: String(a.id), listeners: Number(a.lastfm_listeners) || 0 });
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const assignments = categorizeByQuantile(allEntries);
  console.log(`Catégorisation calculée pour ${assignments.length} artistes.`);

  const BATCH = 50;
  let updated = 0;
  for (let i = 0; i < assignments.length; i += BATCH) {
    const batch = assignments.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (a) => {
        const { error } = await supabase
          .from('artists')
          .update({ category: a.category, category_bonus: a.category_bonus })
          .eq('id', a.id);
        if (!error) updated++;
      })
    );
    process.stdout.write(`\r  category: ${Math.min(i + BATCH, assignments.length)}/${assignments.length}...`);
  }
  console.log(`\n${updated} artistes recatégorisés.`);

  console.log('\n=== Done ===');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('computeLastfmPopularity failed:', err);
    process.exit(1);
  });
}
