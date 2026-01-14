import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { GameManager } from './GameManager';
import { setupSocketHandlers } from './socketHandlers';
import { soloManager } from './SoloManager';

const app = express();
const httpServer = createServer(app);
// Configuration CORS pour permettre les connexions depuis Railway, Vercel et localhost
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
      // - Domaines Railway (.up.railway.app)
      // - Domaines Vercel (.vercel.app)
      // - URL définie dans FRONTEND_URL
      const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
      const isRailway = origin?.endsWith('.up.railway.app') || origin?.endsWith('.railway.app');
      const isVercel = origin?.endsWith('.vercel.app');
      const isAllowedOrigin = process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL;
      
      if (isLocalhost || isRailway || isVercel || isAllowedOrigin) {
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

// Health check endpoint pour Railway
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

// Configuration des handlers WebSocket
setupSocketHandlers(io, gameManager);

// Servir le frontend en production (pour Railway)
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

httpServer.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log(`📡 WebSocket disponible sur ws://localhost:${PORT}`);
  console.log(`🌐 API REST disponible sur http://localhost:${PORT}/api`);
});

export { app, io, gameManager };
