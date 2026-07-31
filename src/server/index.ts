import * as dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { GameManager } from './GameManager';
import { setupSocketHandlers } from './socketHandlers';
import { soloManager } from './SoloManager';
import { botManager } from './BotManager';
import { gameDataStore } from '../services/GameDataStore';
import { addXP } from '../services/XPService';
import { checkUnlocks, triggerUnlock } from '../services/UnlockService';
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
      const isAllowedOrigin = process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL;

      if (isLocalhost || isRender || isVercel || isAllowedOrigin) {
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
      supabase.from('player_stats').select('*').eq('player_name', req.params.playerId).single(),
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
// API Stats (par player_name pour compatibilité existante)
// ============================================================

app.get('/api/stats/:playerName', async (req: express.Request, res: express.Response) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase non configuré' });

    const { data, error } = await supabase
      .from('player_stats')
      .select('*')
      .eq('player_name', req.params.playerName)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    res.json({ stats: data || null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stats/:playerName', async (req: express.Request, res: express.Response) => {
  const playerName = req.params.playerName;
  const update = req.body as {
    mode: string;
    score: number;
    turns: number;
    botWin?: boolean;
    multiWin?: boolean;
  };

  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase non configuré' });

    const { data: existing } = await supabase
      .from('player_stats').select('*').eq('player_name', playerName).single();

    const stats: Record<string, any> = existing || {
      player_name: playerName,
      total_games: 0, total_solo_games: 0, total_bot_games: 0, total_multiplayer_games: 0,
      best_solo_score: 0, best_solo_turns: 0, best_bot_score: 0,
      total_score: 0, bot_wins: 0, bot_losses: 0,
      xp: 0, multiplayer_wins: 0, multiplayer_losses: 0, best_multiplayer_score: 0,
    };

    stats.total_games = (stats.total_games || 0) + 1;
    stats.total_score = (stats.total_score || 0) + (Number(update.score) || 0);

    if (update.mode === 'solo') {
      stats.total_solo_games = (stats.total_solo_games || 0) + 1;
      if (Number(update.score) > (stats.best_solo_score || 0)) stats.best_solo_score = Number(update.score);
      if (Number(update.turns) > (stats.best_solo_turns || 0)) stats.best_solo_turns = Number(update.turns);
    } else if (update.mode === 'bot') {
      stats.total_bot_games = (stats.total_bot_games || 0) + 1;
      if (Number(update.score) > (stats.best_bot_score || 0)) stats.best_bot_score = Number(update.score);
      if (update.botWin) stats.bot_wins = (stats.bot_wins || 0) + 1;
      else stats.bot_losses = (stats.bot_losses || 0) + 1;
    } else if (update.mode === 'multiplayer') {
      stats.total_multiplayer_games = (stats.total_multiplayer_games || 0) + 1;
      if (Number(update.score) > (stats.best_multiplayer_score || 0)) stats.best_multiplayer_score = Number(update.score);
      if (update.multiWin) stats.multiplayer_wins = (stats.multiplayer_wins || 0) + 1;
      else stats.multiplayer_losses = (stats.multiplayer_losses || 0) + 1;
    }

    stats.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('player_stats')
      .upsert({ ...stats, player_name: playerName }, { onConflict: 'player_name' })
      .select().single();
    if (error) throw error;
    res.json({ stats: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Helpers fin de partie (XP + leaderboard + unlocks)
// ============================================================

async function handleGameFinish(params: {
  playerId: string;
  playerName: string;
  score: number;
  turns: number;
  mode: 'Solo Infini' | 'Solo Bot' | 'Multijoueur';
  botWin?: boolean;
  multiWin?: boolean;
  overflowCount?: number;
  overflowXpBonus?: number;
}): Promise<{
  leaderboard: { rank: number; score: number } | null;
  xp: { gained: number; total: number; level: number; leveledUp: boolean; prestige: string } | null;
  unlocks: any[];
}> {
  if (!supabase) return { leaderboard: null, xp: null, unlocks: [] };

  // 1. Leaderboard upsert
  let rank = 0;
  try {
    const { data: existing } = await supabase
      .from('leaderboard')
      .select('id, score')
      .eq('player_id', params.playerId)
      .eq('mode', params.mode)
      .single();

    if (!existing) {
      await supabase.from('leaderboard').insert({
        player_id: params.playerId,
        score: params.score,
        turns: params.turns,
        mode: params.mode,
      });
    } else if (params.score > existing.score) {
      await supabase.from('leaderboard')
        .update({ score: params.score, turns: params.turns, created_at: new Date().toISOString() })
        .eq('id', existing.id);
    }

    const { count } = await supabase
      .from('leaderboard')
      .select('*', { count: 'exact', head: true })
      .eq('mode', params.mode)
      .gt('score', params.score);
    rank = (count || 0) + 1;
  } catch { /* leaderboard non critique */ }

  // 2. Stats
  try {
    const { data: existing } = await supabase
      .from('player_stats').select('*').eq('player_name', params.playerName).single();

    const s: Record<string, any> = existing || {
      player_name: params.playerName,
      total_games: 0, total_solo_games: 0, total_bot_games: 0, total_multiplayer_games: 0,
      best_solo_score: 0, best_solo_turns: 0, best_bot_score: 0,
      total_score: 0, bot_wins: 0, bot_losses: 0,
      xp: 0, multiplayer_wins: 0, multiplayer_losses: 0, best_multiplayer_score: 0,
      overflow_count: 0,
    };

    s.total_games = (s.total_games || 0) + 1;
    s.total_score = (s.total_score || 0) + params.score;
    s.overflow_count = (s.overflow_count || 0) + (params.overflowCount || 0);

    if (params.mode === 'Solo Infini') {
      s.total_solo_games = (s.total_solo_games || 0) + 1;
      if (params.score > (s.best_solo_score || 0)) s.best_solo_score = params.score;
      if (params.turns > (s.best_solo_turns || 0)) s.best_solo_turns = params.turns;
    } else if (params.mode === 'Solo Bot') {
      s.total_bot_games = (s.total_bot_games || 0) + 1;
      if (params.score > (s.best_bot_score || 0)) s.best_bot_score = params.score;
      if (!params.botWin) s.bot_wins = (s.bot_wins || 0) + 1;
      else s.bot_losses = (s.bot_losses || 0) + 1;
    } else {
      s.total_multiplayer_games = (s.total_multiplayer_games || 0) + 1;
      if (params.score > (s.best_multiplayer_score || 0)) s.best_multiplayer_score = params.score;
      if (params.multiWin) s.multiplayer_wins = (s.multiplayer_wins || 0) + 1;
      else s.multiplayer_losses = (s.multiplayer_losses || 0) + 1;
    }

    s.updated_at = new Date().toISOString();
    await supabase.from('player_stats')
      .upsert({ ...s, player_name: params.playerName }, { onConflict: 'player_name' });
  } catch { /* stats non critique */ }

  // 3. XP (+ bonus XP non cappé si dépassement du plafond de score — CLAUDE_3.md §2.3)
  const xpResult = await addXP(params.playerId, params.score, params.overflowXpBonus || 0);

  // 4. Unlocks
  const { data: statsRow } = await supabase
    .from('player_stats')
    .select('multiplayer_wins, bot_wins, best_solo_score, overflow_count')
    .eq('player_name', params.playerName)
    .single();

  const newUnlocks = await checkUnlocks(params.playerId, xpResult.newLevel, statsRow || {});
  for (const item of newUnlocks) {
    await triggerUnlock(params.playerId, item.id);
  }

  // 5. Incrémenter total_score dans players
  const { data: pRow } = await supabase.from('players').select('total_score').eq('id', params.playerId).single();
  if (pRow) {
    try {
      await supabase.from('players')
        .update({ total_score: (pRow.total_score || 0) + params.score })
        .eq('id', params.playerId);
    } catch { /* non critique */ }
  }

  return {
    leaderboard: { rank, score: params.score },
    xp: {
      gained: xpResult.xpGained,
      total: xpResult.newXP,
      level: xpResult.newLevel,
      leveledUp: xpResult.leveledUp,
      prestige: xpResult.prestige,
    },
    unlocks: newUnlocks,
  };
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
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Configuration des handlers WebSocket
setupSocketHandlers(io, gameManager);

// Servir le frontend en production (Render)
if (process.env.NODE_ENV === 'production') {
  // Chemin relatif depuis le fichier compilé (dist/server/index.js)
  const frontendDistPath = path.join(process.cwd(), 'frontend/dist');
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
