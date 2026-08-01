/**
 * Marque les artistes francophones (artists.is_francophone) via Wikidata —
 * sert à restreindre le choix du premier artiste (seed) en Solo Infini /
 * Solo vs Bot aux débuts francophones (cf. CLAUDE.md). Le graphe de
 * collaborations peut ensuite dériver vers des artistes non francophones
 * via des featurings internationaux — seule l'ouverture est contrainte.
 *
 * Un artiste est classé francophone s'il parle français (Wikidata P1412 =
 * Q150), a la nationalité France/Belgique/Suisse (P27, pour une personne),
 * ou vient de France/Belgique/Suisse (P495 "pays d'origine", pour un groupe
 * — P27 "citoyenneté" ne s'applique qu'aux personnes, indispensable vu le
 * nombre de groupes dans le rap français : 113, IAM, NTM, Sniper...).
 *
 * Deux phases, pour rester rapide sur ~5000 artistes :
 *   1. Résolution nom -> QID via l'API de recherche Wikidata (wbsearchentities,
 *      optimisée pour ça, une requête par artiste mais très rapide ~200-500ms,
 *      en parallèle limité). Un scan par label en SPARQL direct est bien trop
 *      lent (testé : timeout à 30s même sur un lot de 30 noms).
 *   2. Requête SPARQL groupée par lots de QID (VALUES ?item { wd:Q1 wd:Q2 ... })
 *      pour récupérer P1412/P27 — rapide car recherche par URI indexée,
 *      contrairement à un scan de label.
 *
 * Usage:
 *   npm run francophone:compute -- --test   (échantillon de 30, pas d'écriture DB)
 *   npm run francophone:compute              (tous les candidats, écrit en DB)
 * Prérequis : SUPABASE_URL + SUPABASE_SERVICE_KEY dans .env
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY manquants dans .env');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'RolandGamos/1.0.0 (jeu francais rap, contact: beatsse.games@gmail.com)';
const SEARCH_CONCURRENCY = 3;
const SEARCH_CHUNK_DELAY_MS = 250; // courtoisie — évite le 429 observé en rafale
const SPARQL_BATCH_SIZE = 100;

// Catégories éligibles au tirage de seed (cf. src/config/soloArtistFilter.ts,
// SOLO_MIN_ARTIST_CATEGORY par défaut 'niche') — inutile de classifier les
// artistes confidentiel/underground, jamais choisis comme seed de toute façon.
const SEED_ELIGIBLE_CATEGORIES = ['niche', 'intermediate', 'connu', 'mainstream', 'ultra_mainstream'];

interface Artist {
  id: string;
  name: string;
}

// Mots-clés de description Wikidata indiquant un artiste musical — nécessaire
// pour désambiguïser les noms courts/génériques (ex: "113" résout d'abord
// vers le nombre entier 113 avant le groupe de rap du même nom, "1995" vers
// une année, etc.) : on préfère un candidat musical parmi plusieurs résultats
// plutôt que de prendre aveuglément le premier.
const MUSIC_DESCRIPTION_KEYWORDS = [
  'rap', 'rappeur', 'rappeuse', 'musi', 'chant', 'group', 'groupe',
  'hip-hop', 'hip hop', 'artist', 'dj ', 'producteur', 'MC ',
];

const errorStats = new Map<string, number>();
function trackError(err: any): void {
  const key = err?.response?.status ? `HTTP ${err.response.status}` : (err?.code || err?.message || 'inconnu');
  errorStats.set(key, (errorStats.get(key) || 0) + 1);
}

/** Résout un nom d'artiste en QID Wikidata via wbsearchentities (rapide, ~1 req/artiste).
 * Retry avec backoff sur 429 (rate-limit observé en rafale sans ça). */
async function searchQid(name: string, attempt: number = 1): Promise<string | null> {
  try {
    const response = await axios.get(WIKIDATA_API, {
      params: {
        action: 'wbsearchentities',
        search: name,
        language: 'fr',
        uselang: 'fr',
        type: 'item',
        limit: 8,
        format: 'json',
      },
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
    });
    const results: Array<{ id: string; description?: string }> = response.data?.search || [];
    if (results.length === 0) return null;

    const musical = results.find((r) =>
      MUSIC_DESCRIPTION_KEYWORDS.some((kw) => (r.description || '').toLowerCase().includes(kw))
    );
    return (musical || results[0]).id;
  } catch (err: any) {
    if (err?.response?.status === 429 && attempt <= 3) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      return searchQid(name, attempt + 1);
    }
    trackError(err);
    return null;
  }
}

/** Résout un lot de noms en parallèle limité, retourne Map<artistId, qid>. */
async function resolveQids(artists: Artist[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (let i = 0; i < artists.length; i += SEARCH_CONCURRENCY) {
    const chunk = artists.slice(i, i + SEARCH_CONCURRENCY);
    const qids = await Promise.all(chunk.map((a) => searchQid(a.name)));
    chunk.forEach((a, idx) => {
      if (qids[idx]) result.set(a.id, qids[idx]!);
    });
    if ((i / SEARCH_CONCURRENCY) % 20 === 0) {
      console.log(`  ...${Math.min(i + SEARCH_CONCURRENCY, artists.length)}/${artists.length} noms traités`);
    }
    if (i + SEARCH_CONCURRENCY < artists.length) {
      await new Promise((resolve) => setTimeout(resolve, SEARCH_CHUNK_DELAY_MS));
    }
  }
  return result;
}

/** Requête SPARQL groupée : parmi ces QID, lesquels sont francophones ? */
async function queryFrancophoneQids(qids: string[]): Promise<Set<string>> {
  const values = qids.map((q) => `wd:${q}`).join(' ');
  const query = `
    SELECT DISTINCT ?item WHERE {
      VALUES ?item { ${values} }
      {
        ?item wdt:P1412 wd:Q150.
      } UNION {
        ?item wdt:P27 ?country.
        VALUES ?country { wd:Q142 wd:Q31 wd:Q39 }
      } UNION {
        ?item wdt:P495 ?origin.
        VALUES ?origin { wd:Q142 wd:Q31 wd:Q39 }
      }
    }
  `.trim();

  const response = await axios.get(SPARQL_ENDPOINT, {
    params: { query, format: 'json' },
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
    timeout: 30000,
  });

  const matched = new Set<string>();
  for (const binding of response.data?.results?.bindings || []) {
    const qid = binding.item.value.split('/').pop();
    if (qid) matched.add(qid);
  }
  return matched;
}

async function main() {
  const testMode = process.argv.includes('--test');

  // PostgREST plafonne à 1000 lignes par défaut — pagination indispensable
  // vu les ~5000 candidats (cf. même pattern dans GameDataStore.ts).
  const artists: Artist[] = [];
  {
    const PAGE_SIZE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('artists')
        .select('id, name')
        .in('category', SEED_ELIGIBLE_CATEGORIES)
        .order('name')
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error('Erreur chargement artistes:', error.message);
        process.exit(1);
      }
      if (!data || data.length === 0) break;
      artists.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  // Échantillon test pris au milieu du tableau (trié alphabétiquement) plutôt
  // qu'au début — le début est saturé de noms numériques/symboles ambigus
  // (ex: "113", "$NOT"), pas représentatif du reste du jeu de données.
  const candidates: Artist[] = testMode ? artists.slice(2500, 2700) : artists;
  console.log(`${candidates.length} artiste(s) à classifier${testMode ? ' (mode test, pas d\'écriture DB)' : ''}...`);

  console.log('Phase 1/2 : résolution nom -> QID...');
  const qidByArtistId = await resolveQids(candidates);
  console.log(`  ${qidByArtistId.size}/${candidates.length} résolus sur Wikidata.`);

  console.log('Phase 2/2 : classification francophone par lots...');
  const allQids = Array.from(qidByArtistId.values());
  const francophoneQids = new Set<string>();

  for (let i = 0; i < allQids.length; i += SPARQL_BATCH_SIZE) {
    const batch = allQids.slice(i, i + SPARQL_BATCH_SIZE);
    try {
      const matched = await queryFrancophoneQids(batch);
      matched.forEach((q) => francophoneQids.add(q));
    } catch (err: any) {
      console.error(`  Erreur lot QID ${i}-${i + batch.length}:`, err.message);
    }
    console.log(`  Progression: ${Math.min(i + SPARQL_BATCH_SIZE, allQids.length)}/${allQids.length}`);
  }

  let francophoneCount = 0;
  let errorCount = 0;

  for (const artist of candidates) {
    const qid = qidByArtistId.get(artist.id);
    const isFrancophone = qid ? francophoneQids.has(qid) : false;
    if (isFrancophone) francophoneCount++;

    if (testMode) {
      console.log(`  ${isFrancophone ? '✓ francophone' : '✗ non classé'} — ${artist.name}${qid ? ` (${qid})` : ' (non résolu)'}`);
    } else {
      const { error: updateError } = await supabase
        .from('artists')
        .update({ is_francophone: isFrancophone })
        .eq('id', artist.id);
      if (updateError) {
        console.error(`  Erreur update ${artist.name}:`, updateError.message);
        errorCount++;
      }
    }
  }

  console.log(`\nTerminé. ${francophoneCount}/${candidates.length} francophones détectés. ${errorCount} erreur(s) d'écriture.`);
  if (errorStats.size > 0) {
    console.log('Erreurs de résolution (nom -> QID) par type:');
    for (const [key, n] of errorStats) console.log(`  ${key}: ${n}`);
  }
}

main().catch((err) => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});
