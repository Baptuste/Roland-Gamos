import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { GameManager } from './GameManager';
import { setupSocketHandlers } from './socketHandlers';

const app = express();
const httpServer = createServer(app);
// Configuration CORS pour permettre les connexions depuis Vercel et localhost
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:3000',
  // Ajouter votre URL Vercel ici après déploiement
  // 'https://roland-gamos.vercel.app',
];

// En production, accepter aussi tous les sous-domaines Vercel
if (process.env.NODE_ENV === 'production') {
  // Pattern pour accepter tous les .vercel.app
}

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // En développement, accepter toutes les origines
      if (process.env.NODE_ENV === 'development' || !origin) {
        return callback(null, true);
      }
      // En production, vérifier l'origine
      if (allowedOrigins.includes(origin) || origin?.endsWith('.vercel.app')) {
        callback(null, true);
      } else {
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
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return;
    }
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
