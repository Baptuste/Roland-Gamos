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
