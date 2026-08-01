import * as dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { GameManager } from './GameManager';
import { setupSocketHandlers } from './socketHandlers';
import { soloManager } from './SoloManager';
import { botManager } from './BotManager';
import { gameDataStore } from '../services/GameDataStore';
import { handleGameFinish } from '../services/GameFinishService';
import { SoloRunStatus } from '../types/SoloRun';

const app = express();
const httpServer = createServer(app);
// Configuration CORS pour permettre les connexions depuis Render, Vercel et localhost
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // En développement, accepter toutes les origines
      if (process.env.NODE_ENV === 'development' || !origin) {
        return callback(null, true);
      }

      // En production, vérifier l'origine
      const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
      const isRender = origin?.endsWith('.onrender.com');
      const isVercel = origin?.endsWith('.vercel.app');
      const isRailway = origin?.endsWith('.up.railway.app');
      const isAllowedOrigin = process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL;

      if (isLocalhost || isRender || isVercel || isRailway || isAllowedOrigin) {
        callback(null, true);
      } else {
        console.warn(`CORS: Origine rejetée: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(cors());
app.use(express.json());

const gameManager = new GameManager();
gameManager.setSocketIO(io);

// API REST pour obtenir des informations sur une partie
app.get('/api/game/:gameId', (req: express.Request, res: express.Response) => {
  const game = gameManager.getGame(req.params.gameId);
  if (game) {
    res.json({ game });
  } else {
    res.status(404).json({ error: 'Partie non trouvée' });
  }
});

// Health check endpoint (Render)
app.get('/health', (req: express.Request, res: express.Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API REST pour le mode Solo Infini
app.post('/api/solo/infinite/start', async (req: express.Request, res: express.Response) => {
  try {
    const { playerName } = req.body;
    
    if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
      return res.status(400).json({ error: 'Le nom du joueur est requis' });
    }

    const run = await soloManager.startRun(playerName.trim());
    res.json({ run });
  } catch (error: any) {
    console.error('Erreur lors de la création de la run solo:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la run solo' });
  }
});

app.post('/api/solo/infinite/move', async (req: express.Request, res: express.Response) => {
  try {
    const { runId, artistName } = req.body;
    
    if (!runId || typeof runId !== 'string') {
      return res.status(400).json({ error: 'L\'ID de la run est requis' });
    }
    
    if (!artistName || typeof artistName !== 'string' || artistName.trim().length === 0) {
      return res.status(400).json({ error: 'Le nom de l\'artiste est requis' });
    }

    const result = await soloManager.makeMove(runId, artistName.trim());
    res.json(result);
  } catch (error: any) {
    console.error('Erreur lors du traitement du coup:', error);
    if (error.message && error.message.includes('introuvable')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors du traitement du coup' });
  }
});

app.get('/api/solo/infinite/run/:id', (req: express.Request, res: express.Response) => {
  try {
    const run = soloManager.getRun(req.params.id);
    
    if (!run) {
      return res.status(404).json({ error: 'Run introuvable' });
    }
    
    res.json({ run });
  } catch (error: any) {
    console.error('Erreur lors de la récupération de la run:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la run' });
  }
});

// Hint : retourne quelques artistes valides depuis l'artiste actuel
app.get('/api/solo/infinite/hint/:runId', (req: express.Request, res: express.Response) => {
  try {
    const run = soloManager.getRun(req.params.runId);
    if (!run) return res.status(404).json({ error: 'Run introuvable' });

    const currentArtist = run.currentArtist || run.seedArtist;
    const gameId = currentArtist.gameId ?? gameDataStore.resolveArtist(currentArtist.name)?.id;

    if (!gameId) return res.json({ hints: [] });

    const collaboratorIds = gameDataStore.getCollaborators(gameId);
    const usedSet = new Set(run.usedArtists);
    const hints = collaboratorIds
      .filter(id => !usedSet.has(String(id)))
      .slice(0, 5)
      .map(id => {
        const a = gameDataStore.getArtistById(id);
        return a ? a.name : null;
      })
      .filter(Boolean);

    res.json({ hints });
  } catch (error: any) {
    res.status(500).json({ error: 'Erreur' });
  }
});

// Hint Multijoueur : retourne quelques artistes valides depuis l'artiste précédent de la partie
app.get('/api/multiplayer/hint/:gameId', (req: express.Request, res: express.Response) => {
  try {
    const game = gameManager.getGame(req.params.gameId);
    if (!game) return res.status(404).json({ error: 'Partie introuvable' });

    const previousArtist = game.lastArtist || (game.lastArtistName ? { name: game.lastArtistName } : null);
    if (!previousArtist) return res.json({ hints: [] });

    const gameId = previousArtist.gameId ?? gameDataStore.resolveArtist(previousArtist.name)?.id;
    if (!gameId) return res.json({ hints: [] });

    const collaboratorIds = gameDataStore.getCollaborators(gameId);
    const usedSet = new Set(game.usedArtists);
    const hints = collaboratorIds
      .filter(id => !usedSet.has(String(id)))
      .slice(0, 5)
      .map(id => {
        const a = gameDataStore.getArtistById(id);
        return a ? a.name : null;
      })
      .filter(Boolean);

    res.json({ hints });
  } catch (error: any) {
    res.status(500).json({ error: 'Erreur' });
  }
});

// Autocomplete d'artistes
app.get('/api/artists/search', (req: express.Request, res: express.Response) => {
  const query = (req.query.q as string || '').trim();
  if (!query || query.length < 2) return res.json({ artists: [] });
  const artists = gameDataStore.searchArtistsByPrefix(query, 10);
  res.json({ artists });
});

// API REST pour le mode Solo vs Bot
app.post('/api/solo/bot/start', async (req: express.Request, res: express.Response) => {
  try {
    const { playerName } = req.body;

    if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
      return res.status(400).json({ error: 'Le nom du joueur est requis' });
    }

    const run = await botManager.startGame(playerName.trim());
    res.json({ run });
  } catch (error: any) {
    console.error('Erreur lors de la création de la partie bot:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la partie' });
  }
});

app.post('/api/solo/bot/move', async (req: express.Request, res: express.Response) => {
  try {
    const { runId, artistName } = req.body;

    if (!runId || typeof runId !== 'string') {
      return res.status(400).json({ error: "L'ID de la partie est requis" });
    }

    if (!artistName || typeof artistName !== 'string' || artistName.trim().length === 0) {
      return res.status(400).json({ error: "Le nom de l'artiste est requis" });
    }

    const result = await botManager.playerMove(runId, artistName.trim());
    res.json(result);
  } catch (error: any) {
    console.error('Erreur lors du traitement du coup bot:', error);
    if (error.message && error.message.includes('introuvable')) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Erreur lors du traitement du coup' });
  }
});

app.get('/api/solo/bot/run/:id', (req: express.Request, res: express.Response) => {
  try {
    const run = botManager.getRun(req.params.id);

    if (!run) {
      return res.status(404).json({ error: 'Partie introuvable' });
    }

    res.json({ run });
  } catch (error: any) {
    console.error('Erreur lors de la récupération de la partie bot:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la partie' });
  }
});

// ============================================================
// API Players (identification UUID)
// ============================================================
import { supabase } from '../services/supabaseClient';
import { grantDefaultCosmetics } from '../services/UnlockService';

// Créer ou retrouver un joueur via son UUID local
app.post('/api/players/identify', async (req: express.Request, res: express.Response) => {
  const { playerId, pseudo } = req.body;
  if (!playerId || !pseudo) {
    return res.status(400).json({ error: 'playerId et pseudo requis' });
  }
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase non configuré' });

    // Upsert player
    const { data: player, error } = await supabase
      .from('players')
      .upsert(
        { id: playerId, pseudo: String(pseudo).trim(), last_seen_at: new Date().toISOString() },
        { onConflict: 'id' }
      )
      .select()
      .single();
    if (error) throw error;

    // Donner les cosmétiques par défaut si premier passage
    await grantDefaultCosmetics(playerId);

    res.json({ player });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mettre à jour le pseudo
app.patch('/api/players/:playerId/pseudo', async (req: express.Request, res: express.Response) => {
  const { pseudo } = req.body;
  if (!pseudo) return res.status(400).json({ error: 'pseudo requis' });
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase non configuré' });
    const { data, error } = await supabase
      .from('players')
      .update({ pseudo: String(pseudo).trim() })
      .eq('id', req.params.playerId)
      .select()
      .single();
    if (error) throw error;
    res.json({ player: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Profil complet (player + stats + cosmétiques équipés)
app.get('/api/players/:playerId/profile', async (req: express.Request, res: express.Response) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase non configuré' });

    const [playerRes, statsRes, unlockedRes] = await Promise.all([
      supabase.from('players').select('*').eq('id', req.params.playerId).single(),
      supabase.from('player_stats').select('*').eq('player_id', req.params.playerId).single(),
      supabase
        .from('cosmetics_unlocked')
        .select('cosmetic_id, cosmetics_catalog(*)')
        .eq('player_id', req.params.playerId),
    ]);

    if (playerRes.error && playerRes.error.code !== 'PGRST116') throw playerRes.error;
    res.json({
      player: playerRes.data || null,
      stats: statsRes.data || null,
      unlocked: (unlockedRes.data || []).map((r: any) => r.cosmetics_catalog),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Codex — artistes découverts par un joueur (galaxie/pokédex)
app.get('/api/players/:playerId/discoveries', async (req: express.Request, res: express.Response) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase non configuré' });
    const { data, error } = await supabase
      .from('artist_discoveries')
      .select('artist_id')
      .eq('player_id', req.params.playerId);
    if (error) throw error;
    res.json({ discoveredIds: (data || []).map((r) => r.artist_id) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Supprimer le compte
app.delete('/api/players/:playerId', async (req: express.Request, res: express.Response) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase non configuré' });
    const { error } = await supabase.from('players').delete().eq('id', req.params.playerId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// API Leaderboard
// ============================================================

app.get('/api/leaderboard', async (req: express.Request, res: express.Response) => {
  try {
    const mode = req.query.mode as string | undefined;
    const period = req.query.period as string | undefined; // 'week' | 'all'
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    if (!supabase) return res.status(503).json({ error: 'Supabase non configuré' });

    let query = supabase
      .from('leaderboard')
      .select('id, score, turns, mode, created_at, players(id, pseudo, level, xp)')
      .order('score', { ascending: false })
      .limit(limit);

    if (mode && mode !== 'all') query = query.eq('mode', mode);
    if (period === 'week') {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', weekAgo);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ entries: data || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Carte des connexions ("galaxie") — payload compact pour la visualisation
// Canvas côté frontend. Coûteux à calculer (pagination sur ~7000 artistes +
// tri des collaborations), donc mis en cache en mémoire : les données ne
// bougent qu'après une resynchro Last.fm/un nettoyage manuel, pas besoin de
// recalculer à chaque requête.
let galaxyCache: { data: unknown; computedAt: number } | null = null;
const GALAXY_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

app.get('/api/artists/galaxy', async (req: express.Request, res: express.Response) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase non configuré' });

    if (galaxyCache && Date.now() - galaxyCache.computedAt < GALAXY_CACHE_TTL_MS) {
      return res.json(galaxyCache.data);
    }

    const PAGE_SIZE = 1000;
    const artists: { id: string; name: string; lastfm_listeners: number | null; category: string; collab_degree: number }[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('artists')
        .select('id, name, lastfm_listeners, category, collab_degree')
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      artists.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    const idToIndex = new Map<string, number>();
    artists.forEach((a, i) => idToIndex.set(a.id, i));

    // Top ~4000 collaborations par nombre de titres partagés — assez pour
    // représenter les grosses connexions sans traîner les 65k liens (illisible
    // et inutilement lourd à transférer/dessiner).
    const edges: [number, number, number][] = [];
    for (let offset = 0; offset < 4000; offset += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('collaborations')
        .select('artist1_id, artist2_id, song_count')
        .order('song_count', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const c of data) {
        const i = idToIndex.get(c.artist1_id);
        const j = idToIndex.get(c.artist2_id);
        if (i === undefined || j === undefined) continue;
        edges.push([i, j, Number(c.song_count) || 1]);
      }
      if (data.length < PAGE_SIZE) break;
    }

    const payload = {
      artists: artists.map((a) => [a.id, a.name, a.lastfm_listeners, a.category || 'confidentiel', a.collab_degree]),
      edges,
    };
    galaxyCache = { data: payload, computedAt: Date.now() };
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Upsert leaderboard — garde uniquement le meilleur score par joueur par mode
app.post('/api/leaderboard', async (req: express.Request, res: express.Response) => {
  const { playerId, score, turns, mode } = req.body;
  if (!playerId || score === undefined || !mode) {
    return res.status(400).json({ error: 'playerId, score, mode requis' });
  }
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase non configuré' });

    // Récupérer l'entrée existante
    const { data: existing } = await supabase
      .from('leaderboard')
      .select('id, score, turns')
      .eq('player_id', playerId)
      .eq('mode', mode)
      .single();

    let entry;
    if (!existing) {
      const { data, error } = await supabase
        .from('leaderboard')
        .insert({ player_id: playerId, score: Number(score), turns: Number(turns) || 0, mode })
        .select()
        .single();
      if (error) throw error;
      entry = data;
    } else if (Number(score) > existing.score) {
      const { data, error } = await supabase
        .from('leaderboard')
        .update({ score: Number(score), turns: Number(turns) || 0, created_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      entry = data;
    } else {
      entry = existing;
    }

    // Calculer le rang
    const { count } = await supabase
      .from('leaderboard')
      .select('*', { count: 'exact', head: true })
      .eq('mode', mode)
      .gt('score', Number(score));

    res.json({ entry, rank: (count || 0) + 1 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Fin de partie (XP + leaderboard + unlocks) — handleGameFinish vit dans
// ../services/GameFinishService.ts (partagé avec GameManager pour le
// Multijoueur, qui l'appelle directement côté serveur sans round-trip HTTP).
// ============================================================

// Rassemble les genius_id de tous les artistes apparus dans une run (seed +
// coups valides) pour alimenter le codex/carte galaxie — voir handleGameFinish.
function collectEncounteredGeniusIds(
  seedArtist: { gameId?: number },
  ...movesLists: Array<Array<{ isValid: boolean; artist: { gameId?: number } }>>
): number[] {
  const ids = new Set<number>();
  if (seedArtist.gameId) ids.add(seedArtist.gameId);
  for (const moves of movesLists) {
    for (const m of moves) {
      if (m.isValid && m.artist.gameId) ids.add(m.artist.gameId);
    }
  }
  return Array.from(ids);
}

// Fin de partie — Solo Infini
app.post('/api/solo/infinite/finish', async (req: express.Request, res: express.Response) => {
  const { runId, playerId, playerName } = req.body;
  if (!runId || !playerId || !playerName) {
    return res.status(400).json({ error: 'runId, playerId, playerName requis' });
  }
  try {
    const run = soloManager.getRun(runId);
    if (!run) return res.status(404).json({ error: 'Run introuvable' });
    if (run.status !== SoloRunStatus.FINISHED) return res.status(400).json({ error: 'Run pas encore terminée' });

    const result = await handleGameFinish({
      playerId,
      playerName,
      score: run.totalScore,
      turns: run.currentTurn - 1,
      mode: 'Solo Infini',
      overflowCount: run.overflowCount,
      overflowXpBonus: run.overflowXpBonus,
      encounteredGeniusIds: collectEncounteredGeniusIds(run.seedArtist, run.moves),
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fin de partie — Solo Bot
app.post('/api/solo/bot/finish', async (req: express.Request, res: express.Response) => {
  const { runId, playerId, playerName } = req.body;
  if (!runId || !playerId || !playerName) {
    return res.status(400).json({ error: 'runId, playerId, playerName requis' });
  }
  try {
    const run = botManager.getRun(runId);
    if (!run) return res.status(404).json({ error: 'Partie introuvable' });
    if (run.status !== SoloRunStatus.FINISHED) return res.status(400).json({ error: 'Partie pas encore terminée' });

    const playerWon = run.winner === 'player';
    const result = await handleGameFinish({
      playerId,
      playerName,
      score: run.playerScore,
      turns: run.playerMoves.length,
      mode: 'Solo Bot',
      botWin: !playerWon,
      overflowCount: run.overflowCount,
      overflowXpBonus: run.overflowXpBonus,
      encounteredGeniusIds: collectEncounteredGeniusIds(run.seedArtist, run.playerMoves, run.botMoves),
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Configuration des handlers WebSocket
setupSocketHandlers(io, gameManager);

// Servir le frontend (Railway : un seul service pour l'API + le statique).
// Condition sur la présence réelle du build plutôt que sur NODE_ENV, pour ne
// pas dépendre d'une variable d'env à ne pas oublier de configurer côté host.
const frontendDistPath = path.join(process.cwd(), 'frontend/dist');
if (fs.existsSync(path.join(frontendDistPath, 'index.html'))) {
  app.use(express.static(frontendDistPath));
  
  // Toutes les routes non-API servent le frontend (SPA)
  app.get('*', (req: express.Request, res: express.Response) => {
    // Ne pas servir le frontend pour les routes API et WebSocket
    // Ces routes doivent être gérées par leurs handlers respectifs
    if (req.path.startsWith('/api')) {
      // Si la route API n'existe pas, retourner 404
      return res.status(404).json({ error: 'Route API non trouvée' });
    }
    
    if (req.path.startsWith('/socket.io')) {
      // Si une requête HTTP atteint le catch-all pour /socket.io,
      // c'est probablement une requête invalide (Socket.io devrait l'intercepter)
      // Retourner 400 Bad Request pour indiquer que ce n'est pas une route HTTP valide
      return res.status(400).json({ 
        error: 'Requête invalide. Utilisez WebSocket pour /socket.io' 
      });
    }
    
    // Servir le frontend pour toutes les autres routes
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;

// Initialiser le GameDataStore avant de démarrer (données locales, pas de réseau)
gameDataStore.initialize().then(() => {
  console.log(`📦 GameDataStore: ${gameDataStore.getArtistCount()} artistes, ${gameDataStore.getCollaborationCount()} collabs`);
}).catch((err) => {
  console.warn('⚠️  GameDataStore init error (fallback JSON):', err.message);
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📡 WebSocket disponible sur ws://localhost:${PORT}`);
  console.log(`🌐 API REST disponible sur http://localhost:${PORT}/api`);
});

export { app, io, gameManager };
