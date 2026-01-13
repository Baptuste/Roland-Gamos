import { useState, useEffect } from 'react';
import MultiplayerHomeScreen from './screens/MultiplayerHomeScreen';
import MultiplayerGameScreen from './screens/MultiplayerGameScreen';
import { Game, Player, GameStatus } from './shared/types';
import { socketService } from './services/socketService';

// Clés pour le localStorage
const STORAGE_KEYS = {
  GAME_CODE: 'roland-gamos-game-code',
  PLAYER_ID: 'roland-gamos-player-id',
  PLAYER_NAME: 'roland-gamos-player-name',
  GAME_ID: 'roland-gamos-game-id',
};

function App() {
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [gameCode, setGameCode] = useState<string | null>(null);

  useEffect(() => {
    // Se connecter au serveur au démarrage
    if (!socketService.isConnected()) {
      socketService.connect();
    }

    // Tentative de reconnexion automatique si des données sont stockées
    const storedGameCode = localStorage.getItem(STORAGE_KEYS.GAME_CODE);
    const storedPlayerId = localStorage.getItem(STORAGE_KEYS.PLAYER_ID);
    const storedPlayerName = localStorage.getItem(STORAGE_KEYS.PLAYER_NAME);

    if (storedGameCode && storedPlayerId && storedPlayerName) {
      // Attendre que la connexion soit établie
      let reconnectAttempted = false;
      let fallbackAttempted = false;

      const tryReconnect = () => {
        if (socketService.isConnected() && !reconnectAttempted) {
          reconnectAttempted = true;
          console.log('Tentative de reconnexion automatique...', { storedGameCode, storedPlayerId });
          
          // Écouter l'erreur de reconnexion pour essayer avec join-game
          const errorHandler = (data: { message: string }) => {
            if (data.message.includes('reconnect') && !fallbackAttempted) {
              fallbackAttempted = true;
              console.log('Reconnexion directe échouée, tentative avec join-game...');
              // Essayer avec join-game en utilisant le nom stocké
              socketService.emit('join-game', {
                gameCode: storedGameCode,
                playerName: storedPlayerName,
              });
              // Nettoyer le handler après utilisation
              setTimeout(() => {
                socketService.off('error', errorHandler);
              }, 1000);
            } else if (data.message.includes('Code de partie invalide') || data.message.includes('partie introuvable')) {
              // La partie n'existe plus, nettoyer le localStorage
              console.log('Partie introuvable, nettoyage du localStorage');
              localStorage.removeItem(STORAGE_KEYS.GAME_CODE);
              localStorage.removeItem(STORAGE_KEYS.PLAYER_ID);
              localStorage.removeItem(STORAGE_KEYS.PLAYER_NAME);
              localStorage.removeItem(STORAGE_KEYS.GAME_ID);
              socketService.off('error', errorHandler);
            }
          };

          socketService.on('error', errorHandler);
          
          socketService.emit('reconnect-game', {
            gameCode: storedGameCode,
            playerId: storedPlayerId,
          });
        } else if (!socketService.isConnected()) {
          // Réessayer après un court délai
          setTimeout(tryReconnect, 500);
        }
      };

      // Attendre un peu que la connexion soit établie
      setTimeout(tryReconnect, 1000);
    }
  }, []);

  // Synchroniser l'état de la partie avec les mises à jour du serveur
  useEffect(() => {
    if (!currentGame || !currentPlayer) return;

    const handleGameUpdated = (data: { game: Game }) => {
      // Mettre à jour l'état de la partie si c'est la même partie
      if (data.game.id === currentGame.id) {
        setCurrentGame(data.game);
        // S'assurer que currentPlayer existe toujours dans la partie mise à jour
        const updatedPlayer = data.game.players.find(p => p.id === currentPlayer.id);
        if (updatedPlayer) {
          setCurrentPlayer(updatedPlayer);
        }
      }
    };

    const handleGameStarted = (data: { game: Game }) => {
      // Mettre à jour l'état de la partie si c'est la même partie
      if (data.game.id === currentGame.id) {
        setCurrentGame(data.game);
        // S'assurer que currentPlayer existe toujours dans la partie mise à jour
        const updatedPlayer = data.game.players.find(p => p.id === currentPlayer.id);
        if (updatedPlayer) {
          setCurrentPlayer(updatedPlayer);
        }
      }
    };

    const handleGameState = (data: { game: Game; gameCode?: string }) => {
      // Mettre à jour l'état de la partie si c'est la même partie
      if (data.game.id === currentGame.id) {
        setCurrentGame(data.game);
        // Stocker le code si présent
        if (data.gameCode) {
          setGameCode(data.gameCode);
        }
        // S'assurer que currentPlayer existe toujours dans la partie mise à jour
        const updatedPlayer = data.game.players.find(p => p.id === currentPlayer.id);
        if (updatedPlayer) {
          setCurrentPlayer(updatedPlayer);
        }
      }
    };

    const handleGameReset = (data: { game: Game; gameCode: string }) => {
      // Mettre à jour l'état de la partie si c'est la même partie
      if (data.game.id === currentGame.id) {
        setCurrentGame(data.game);
        // Stocker le code de la partie
        if (data.gameCode) {
          setGameCode(data.gameCode);
        }
        // S'assurer que currentPlayer existe toujours dans la partie mise à jour
        const updatedPlayer = data.game.players.find(p => p.id === currentPlayer.id);
        if (updatedPlayer) {
          setCurrentPlayer(updatedPlayer);
        }
      }
    };

    const handleGameReconnected = (data: { player: Player; game: Game }) => {
      console.log('Reconnexion réussie:', data);
      setCurrentGame(data.game);
      setCurrentPlayer(data.player);
      // Stocker les informations pour la prochaine reconnexion
      const gameCode = localStorage.getItem(STORAGE_KEYS.GAME_CODE);
      if (gameCode) {
        setGameCode(gameCode);
      }
      // S'assurer que les données sont bien stockées
      if (gameCode && data.player.id) {
        localStorage.setItem(STORAGE_KEYS.GAME_CODE, gameCode);
        localStorage.setItem(STORAGE_KEYS.PLAYER_ID, data.player.id);
        localStorage.setItem(STORAGE_KEYS.PLAYER_NAME, data.player.name);
        localStorage.setItem(STORAGE_KEYS.GAME_ID, data.game.id);
      }
    };

    const handleGameJoined = (data: { player: Player; game: Game }) => {
      // Si c'est une reconnexion via join-game, mettre à jour les données
      const storedCode = localStorage.getItem(STORAGE_KEYS.GAME_CODE);
      if (storedCode && data.game.id) {
        // C'est probablement une reconnexion réussie via join-game
        setCurrentGame(data.game);
        setCurrentPlayer(data.player);
        setGameCode(storedCode);
        // Mettre à jour le localStorage avec les nouvelles données
        localStorage.setItem(STORAGE_KEYS.GAME_CODE, storedCode);
        localStorage.setItem(STORAGE_KEYS.PLAYER_ID, data.player.id);
        localStorage.setItem(STORAGE_KEYS.PLAYER_NAME, data.player.name);
        localStorage.setItem(STORAGE_KEYS.GAME_ID, data.game.id);
      }
    };

    socketService.on('game-updated', handleGameUpdated);
    socketService.on('game-started', handleGameStarted);
    socketService.on('game-reset', handleGameReset);
    socketService.on('game-state', handleGameState);
    socketService.on('game-reconnected', handleGameReconnected);
    socketService.on('game-joined', handleGameJoined);

    return () => {
      socketService.off('game-updated', handleGameUpdated);
      socketService.off('game-started', handleGameStarted);
      socketService.off('game-reset', handleGameReset);
      socketService.off('game-state', handleGameState);
      socketService.off('game-reconnected', handleGameReconnected);
      socketService.off('game-joined', handleGameJoined);
    };
  }, [currentGame?.id, currentPlayer?.id]);

  const handleGameJoined = (game: Game, player: Player, code?: string) => {
    setCurrentGame(game);
    setCurrentPlayer(player);
    if (code) {
      setGameCode(code);
      // Stocker les informations pour la reconnexion
      localStorage.setItem(STORAGE_KEYS.GAME_CODE, code);
      localStorage.setItem(STORAGE_KEYS.PLAYER_ID, player.id);
      localStorage.setItem(STORAGE_KEYS.PLAYER_NAME, player.name);
      localStorage.setItem(STORAGE_KEYS.GAME_ID, game.id);
    }
  };

  const handleBackToHome = () => {
    setCurrentGame(null);
    setCurrentPlayer(null);
    // Ne pas effacer le localStorage - permettre la reconnexion
    // localStorage.removeItem(STORAGE_KEYS.GAME_CODE);
    // localStorage.removeItem(STORAGE_KEYS.PLAYER_ID);
    // localStorage.removeItem(STORAGE_KEYS.PLAYER_NAME);
    // localStorage.removeItem(STORAGE_KEYS.GAME_ID);
  };

  // Si on a une partie et un joueur, afficher l'écran approprié
  if (currentGame && currentPlayer) {
    // Si la partie est en attente, afficher le salon d'attente
    if (currentGame.status === GameStatus.WAITING) {
      return (
        <MultiplayerHomeScreen
          onGameJoined={handleGameJoined}
          initialGame={currentGame}
          initialPlayer={currentPlayer}
          initialGameCode={gameCode}
        />
      );
    }
    // Sinon, afficher l'écran de jeu
    return (
      <MultiplayerGameScreen
        game={currentGame}
        currentPlayerId={currentPlayer.id}
        onBackToHome={handleBackToHome}
      />
    );
  }

  return <MultiplayerHomeScreen onGameJoined={handleGameJoined} />;
}

export default App;
