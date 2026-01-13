import { Server, Socket } from 'socket.io';
import { GameManager } from './GameManager';
import { Game, GameStatus } from '../types/Game';

/**
 * Gère les événements WebSocket
 */
export function setupSocketHandlers(io: Server, gameManager: GameManager) {
  io.on('connection', (socket: Socket) => {
    console.log(`Client connecté: ${socket.id}`);

    // Créer une partie
    socket.on('create-game', (data: { playerName: string }) => {
      try {
        const { gameId, gameCode, player, game } = gameManager.createGame(data.playerName, socket.id);
        socket.join(gameId);
        socket.emit('game-created', { gameId, gameCode, player, game });
        console.log(`Partie créée: ${gameId}, code: ${gameCode} par ${data.playerName}`);
      } catch (error) {
        socket.emit('error', { message: 'Erreur lors de la création de la partie' });
      }
    });

    // Rejoindre une partie
    socket.on('join-game', (data: { gameCode: string; playerName: string }) => {
      try {
        console.log(`Tentative de rejoindre la partie avec le code: ${data.gameCode}`);
        const result = gameManager.joinGame(data.gameCode, data.playerName, socket.id);
        
        if (!result) {
          console.log(`Impossible de rejoindre la partie avec le code: ${data.gameCode}`);
          socket.emit('error', { message: 'Code de partie invalide ou partie introuvable' });
          return;
        }

        socket.join(result.game.id);
        
        // Utiliser le flag isReconnection retourné par joinGame
        if (result.isReconnection && result.game.status === GameStatus.IN_PROGRESS) {
          // Reconnexion à une partie en cours
          const gameCode = gameManager.getGameCode(result.game.id);
          socket.emit('game-reconnected', { player: result.player, game: result.game });
          socket.emit('game-state', { game: result.game, gameCode });
          console.log(`${data.playerName} s'est reconnecté à la partie ${result.game.id} (en cours)`);
        } else {
          // Nouveau joueur ou partie en attente
          socket.emit('game-joined', { player: result.player, game: result.game });
          
          // Notifier TOUS les autres joueurs de la partie (y compris l'hôte) qu'un nouveau joueur a rejoint
          // Seulement si ce n'est PAS une reconnexion
          if (!result.isReconnection) {
            console.log(`Notification aux autres joueurs: ${data.playerName} a rejoint`);
            io.to(result.game.id).emit('player-joined', {
              player: result.player,
              game: result.game,
            });
          }
          console.log(`${data.playerName} a rejoint la partie ${result.game.id} avec le code ${data.gameCode}`);
        }
      } catch (error) {
        console.error('Erreur lors de la connexion à la partie:', error);
        socket.emit('error', { message: 'Erreur lors de la connexion à la partie' });
      }
    });

    // Reconnexion à une partie (avec playerId)
    socket.on('reconnect-game', (data: { gameCode: string; playerId: string }) => {
      try {
        console.log(`Tentative de reconnexion avec code: ${data.gameCode}, playerId: ${data.playerId}`);
        
        // Vérifier d'abord si le code existe
        const gameId = gameManager.getGameByCode(data.gameCode)?.id;
        if (!gameId) {
          console.log(`Code de partie invalide: ${data.gameCode}`);
          socket.emit('error', { message: 'Code de partie invalide ou partie introuvable' });
          return;
        }
        
        const result = gameManager.reconnectToGame(data.gameCode, data.playerId, socket.id);
        
        if (!result) {
          console.log(`Impossible de se reconnecter: joueur ${data.playerId} non trouvé dans la partie ${gameId}`);
          socket.emit('error', { message: 'Impossible de se reconnecter à la partie. Le joueur n\'existe pas dans cette partie.' });
          return;
        }

        socket.join(result.game.id);
        socket.emit('game-reconnected', { player: result.player, game: result.game });
        
        // Demander l'état actuel de la partie
        const gameCode = gameManager.getGameCode(result.game.id);
        socket.emit('game-state', { game: result.game, gameCode });

        console.log(`${result.player.name} s'est reconnecté à la partie ${result.game.id}`);
      } catch (error) {
        console.error('Erreur lors de la reconnexion:', error);
        socket.emit('error', { message: 'Erreur lors de la reconnexion' });
      }
    });

    // Démarrer une partie
    socket.on('start-game', (data: { gameId: string }) => {
      try {
        const playerInfo = gameManager.getPlayerBySocket(socket.id);
        if (!playerInfo) {
          socket.emit('error', { message: 'Joueur non trouvé' });
          return;
        }

        const game = gameManager.startGame(data.gameId, playerInfo.playerId);
        
        if (!game) {
          socket.emit('error', { message: 'Impossible de démarrer la partie' });
          return;
        }

        // Notifier tous les joueurs de la partie
        io.to(data.gameId).emit('game-started', { game });
        console.log(`Partie ${data.gameId} démarrée`);
      } catch (error) {
        socket.emit('error', { message: 'Erreur lors du démarrage de la partie' });
      }
    });

    // Proposer un artiste
    socket.on('propose-artist', async (data: { gameId: string; artistName: string }) => {
      try {
        const playerInfo = gameManager.getPlayerBySocket(socket.id);
        if (!playerInfo) {
          socket.emit('error', { message: 'Joueur non trouvé' });
          return;
        }

        const result = await gameManager.proposeArtist(
          data.gameId,
          playerInfo.playerId,
          data.artistName
        );

        if (!result) {
          socket.emit('error', { message: 'Erreur lors de la proposition' });
          return;
        }

        // Notifier tous les joueurs de la partie
        io.to(data.gameId).emit('game-updated', {
          game: result.game,
          turn: result.turn,
          message: result.message,
          isValid: result.isValid,
        });

        console.log(
          `Proposition dans ${data.gameId}: ${data.artistName} (${result.isValid ? 'valide' : 'invalide'})`
        );
      } catch (error: any) {
        console.error('Erreur lors de la validation de la proposition:', error);
        socket.emit('error', { 
          message: error?.message || 'Erreur lors de la validation de la proposition' 
        });
      }
    });

    // Obtenir l'état actuel de la partie
    socket.on('get-game-state', (data: { gameId: string }) => {
      try {
        const game = gameManager.getGame(data.gameId);
        if (game) {
          const gameCode = gameManager.getGameCode(data.gameId);
          socket.emit('game-state', { game, gameCode });
        } else {
          socket.emit('error', { message: 'Partie non trouvée' });
        }
      } catch (error) {
        socket.emit('error', { message: 'Erreur lors de la récupération de l\'état' });
      }
    });

    // Obtenir le code d'une partie
    socket.on('get-game-code', (data: { gameId: string }) => {
      try {
        const gameCode = gameManager.getGameCode(data.gameId);
        if (gameCode) {
          socket.emit('game-code', { gameId: data.gameId, gameCode });
        } else {
          socket.emit('error', { message: 'Code de partie non trouvé' });
        }
      } catch (error) {
        socket.emit('error', { message: 'Erreur lors de la récupération du code' });
      }
    });

    // Réinitialiser une partie terminée
    socket.on('reset-game', (data: { gameId: string }) => {
      try {
        const playerInfo = gameManager.getPlayerBySocket(socket.id);
        if (!playerInfo) {
          socket.emit('error', { message: 'Joueur non trouvé' });
          return;
        }

        const game = gameManager.resetGame(data.gameId, playerInfo.playerId);
        
        if (!game) {
          socket.emit('error', { message: 'Impossible de réinitialiser la partie' });
          return;
        }

        // Récupérer le code de la partie
        const gameCode = gameManager.getGameCode(data.gameId);

        // Notifier tous les joueurs de la partie avec le code
        io.to(data.gameId).emit('game-reset', { game, gameCode });
        console.log(`Partie ${data.gameId} réinitialisée, code: ${gameCode}`);
      } catch (error) {
        socket.emit('error', { message: 'Erreur lors de la réinitialisation de la partie' });
      }
    });

    // Déconnexion
    socket.on('disconnect', () => {
      console.log(`Client déconnecté: ${socket.id}`);
      gameManager.handleDisconnect(socket.id);
    });
  });

  // Nettoyer les anciennes parties toutes les heures
  setInterval(() => {
    gameManager.cleanupOldGames();
  }, 3600000);
}
