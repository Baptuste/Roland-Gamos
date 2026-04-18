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

const app = express();
const httpServer = createServer(app);
// Configuration CORS pour permettre les connexions depuis Render, Railway, Vercel et localhost
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // En développement, accepter toutes les origines
      if (process.env.NODE_ENV === 'development' || !origin) {
        return callback(null, true);
      }
      
      // En production, vérifier l'origine
      // Accepter :
      // - localhost (développement)
      // - Domaines Render (.onrender.com)
      // - Domaines Railway (.up.railway.app)
      // - Domaines Vercel (.vercel.app)
      // - URL définie dans FRONTEND_URL
      const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
      const isRailway = origin?.endsWith('.up.railway.app') || origin?.endsWith('.railway.app');
      const isRender = origin?.endsWith('.onrender.com');
      const isVercel = origin?.endsWith('.vercel.app');
      const isAllowedOrigin = process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL;

      if (isLocalhost || isRailway || isRender || isVercel || isAllowedOrigin) {
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

// API REST pour obtenir des informations sur une partie
app.get('/api/game/:gameId', (req: express.Request, res: express.Response) => {
  const game = gameManager.getGame(req.params.gameId);
  if (game) {
    res.json({ game });
  } else {
    res.status(404).json({ error: 'Partie non trouvée' });
  }
});

// Health check endpoint (Render / Railway)
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
// API Leaderboard
// ============================================================
import { supabase } from '../services/supabaseClient';

app.get('/api/leaderboard', async (req: express.Request, res: express.Response) => {
  try {
    const mode = req.query.mode as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    if (!supabase) return res.status(503).json({ error: 'Supabase non configuré' });

    let query = supabase.from('leaderboard').select('*').order('score', { ascending: false }).limit(limit);
    if (mode && mode !== 'all') query = query.eq('mode', mode);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ entries: data || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/leaderboard', async (req: express.Request, res: express.Response) => {
  const { playerName, score, turns, mode } = req.body;
  if (!playerName || score === undefined || !mode) {
    return res.status(400).json({ error: 'playerName, score, mode requis' });
  }
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase non configuré' });

    const { data, error } = await supabase.from('leaderboard').insert({
      player_name: String(playerName),
      score: Number(score),
      turns: Number(turns) || 0,
      mode: String(mode),
    }).select().single();
    if (error) throw error;
    res.json({ entry: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// API Stats
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
  const update = req.body as { mode: string; score: number; turns: number; botWin?: boolean };

  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase non configuré' });

    const { data: existing } = await supabase
      .from('player_stats').select('*').eq('player_name', playerName).single();

    const stats: Record<string, any> = existing || {
      player_name: playerName,
      total_games: 0, total_solo_games: 0, total_bot_games: 0, total_multiplayer_games: 0,
      best_solo_score: 0, best_solo_turns: 0, best_bot_score: 0,
      total_score: 0, bot_wins: 0, bot_losses: 0,
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
    } else {
      stats.total_multiplayer_games = (stats.total_multiplayer_games || 0) + 1;
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

// Configuration des handlers WebSocket
setupSocketHandlers(io, gameManager);

// Servir le frontend en production (Render / Railway)
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
