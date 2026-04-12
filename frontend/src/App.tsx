import { useState, useEffect } from 'react';
import MultiplayerHomeScreen from './screens/MultiplayerHomeScreen';
import MultiplayerGameScreen from './screens/MultiplayerGameScreen';
import SoloInfiniteScreen from './screens/SoloInfiniteScreen';
import SoloBotScreen from './screens/SoloBotScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import StatsScreen from './screens/StatsScreen';
import { Game, Player, GameStatus } from './shared/types';
import { socketService } from './services/socketService';

// Clés pour le localStorage
const STORAGE_KEYS = {
  GAME_CODE: 'roland-gamos-game-code',
  PLAYER_ID: 'roland-gamos-player-id',
  PLAYER_NAME: 'roland-gamos-player-name',
  GAME_ID: 'roland-gamos-game-id',
};

type Screen = 'home' | 'solo' | 'bot' | 'leaderboard' | 'stats' | 'multiplayer';

function App() {
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [gameCode, setGameCode] = useState<string | null>(null);
  const [soloPlayerName, setSoloPlayerName] = useState<string | null>(null);
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');

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
      let reconnectAttempted = false;
      let fallbackAttempted = false;
      let maxAttempts = 10;
      let attempts = 0;

      const cleanupStorage = () => {
        localStorage.removeItem(STORAGE_KEYS.GAME_CODE);
        localStorage.removeItem(STORAGE_KEYS.PLAYER_ID);
        localStorage.removeItem(STORAGE_KEYS.PLAYER_NAME);
        localStorage.removeItem(STORAGE_KEYS.GAME_ID);
      };

      const tryReconnect = () => {
        attempts++;

        if (socketService.isConnected() && !reconnectAttempted) {
          reconnectAttempted = true;

          const successHandler = () => {
            socketService.off('error', errorHandler);
            socketService.off('game-reconnected', successHandler);
            socketService.off('game-joined', successHandler);
          };

          const errorHandler = (data: { message: string }) => {
            const message = data.message || '';

            if (message.includes('reconnect') && !fallbackAttempted) {
              fallbackAttempted = true;

              const joinErrorHandler = (joinData: { message: string }) => {
                const joinMessage = joinData.message || '';
                if (joinMessage.includes('Code de partie invalide') ||
                    joinMessage.includes('partie introuvable') ||
                    joinMessage.includes('impossible')) {
                  cleanupStorage();
                  socketService.off('error', joinErrorHandler);
                }
              };

              socketService.on('error', joinErrorHandler);
              socketService.emit('join-game', {
                gameCode: storedGameCode,
                playerName: storedPlayerName,
              });

              setTimeout(() => {
                socketService.off('error', joinErrorHandler);
              }, 2000);
            } else if (message.includes('Code de partie invalide') ||
                       message.includes('partie introuvable') ||
                       message.includes('impossible')) {
              cleanupStorage();
              socketService.off('error', errorHandler);
              socketService.off('game-reconnected', successHandler);
              socketService.off('game-joined', successHandler);
              return;
            }
          };

          socketService.on('game-reconnected', successHandler);
          socketService.on('game-joined', successHandler);
          socketService.on('error', errorHandler);

          socketService.emit('reconnect-game', {
            gameCode: storedGameCode,
            playerId: storedPlayerId,
          });

          setTimeout(() => {
            socketService.off('error', errorHandler);
            socketService.off('game-reconnected', successHandler);
            socketService.off('game-joined', successHandler);
          }, 3000);
        } else if (!socketService.isConnected() && attempts < maxAttempts) {
          setTimeout(tryReconnect, 500);
        }
      };

      setTimeout(tryReconnect, 1500);
    }
  }, []);

  // Synchroniser l'état de la partie avec les mises à jour du serveur
  useEffect(() => {
    if (!currentGame || !currentPlayer) return;

    const handleGameUpdated = (data: { game: Game }) => {
      if (data.game.id === currentGame.id) {
        setCurrentGame(data.game);
        const updatedPlayer = data.game.players.find(p => p.id === currentPlayer.id);
        if (updatedPlayer) {
          setCurrentPlayer(updatedPlayer);
        }
      }
    };

    const handleGameStarted = (data: { game: Game }) => {
      if (data.game.id === currentGame.id) {
        setCurrentGame(data.game);
        const updatedPlayer = data.game.players.find(p => p.id === currentPlayer.id);
        if (updatedPlayer) {
          setCurrentPlayer(updatedPlayer);
        }
      }
    };

    const handleGameState = (data: { game: Game; gameCode?: string }) => {
      if (data.game.id === currentGame.id) {
        setCurrentGame(data.game);
        if (data.gameCode) {
          setGameCode(data.gameCode);
        }
        const updatedPlayer = data.game.players.find(p => p.id === currentPlayer.id);
        if (updatedPlayer) {
          setCurrentPlayer(updatedPlayer);
        }
      }
    };

    const handleGameReset = (data: { game: Game; gameCode: string }) => {
      if (data.game.id === currentGame.id) {
        setCurrentGame(data.game);
        if (data.gameCode) {
          setGameCode(data.gameCode);
        }
        const updatedPlayer = data.game.players.find(p => p.id === currentPlayer.id);
        if (updatedPlayer) {
          setCurrentPlayer(updatedPlayer);
        }
      }
    };

    const handleGameReconnected = (data: { player: Player; game: Game }) => {
      setCurrentGame(data.game);
      setCurrentPlayer(data.player);
      const storedCode = localStorage.getItem(STORAGE_KEYS.GAME_CODE);
      if (storedCode) {
        setGameCode(storedCode);
      }
      if (storedCode && data.player.id) {
        localStorage.setItem(STORAGE_KEYS.GAME_CODE, storedCode);
        localStorage.setItem(STORAGE_KEYS.PLAYER_ID, data.player.id);
        localStorage.setItem(STORAGE_KEYS.PLAYER_NAME, data.player.name);
        localStorage.setItem(STORAGE_KEYS.GAME_ID, data.game.id);
      }
    };

    const handleGameJoined = (data: { player: Player; game: Game }) => {
      const storedCode = localStorage.getItem(STORAGE_KEYS.GAME_CODE);
      if (storedCode && data.game.id) {
        setCurrentGame(data.game);
        setCurrentPlayer(data.player);
        setGameCode(storedCode);
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
    setCurrentScreen('multiplayer');
    if (code) {
      setGameCode(code);
      localStorage.setItem(STORAGE_KEYS.GAME_CODE, code);
      localStorage.setItem(STORAGE_KEYS.PLAYER_ID, player.id);
      localStorage.setItem(STORAGE_KEYS.PLAYER_NAME, player.name);
      localStorage.setItem(STORAGE_KEYS.GAME_ID, game.id);
    }
  };

  const handleBackToHome = () => {
    setCurrentGame(null);
    setCurrentPlayer(null);
    setSoloPlayerName(null);
    setCurrentScreen('home');
  };

  const handleStartSolo = (playerName: string) => {
    setSoloPlayerName(playerName);
    setCurrentScreen('solo');
  };

  const handleStartBot = (playerName: string) => {
    setSoloPlayerName(playerName);
    setCurrentScreen('bot');
  };

  // Écrans secondaires
  if (currentScreen === 'leaderboard') {
    return <LeaderboardScreen onBackToHome={handleBackToHome} />;
  }

  if (currentScreen === 'stats') {
    return <StatsScreen onBackToHome={handleBackToHome} />;
  }

  // Solo infini
  if (currentScreen === 'solo' && soloPlayerName) {
    return (
      <SoloInfiniteScreen
        playerName={soloPlayerName}
        onBackToHome={handleBackToHome}
      />
    );
  }

  // Solo vs Bot
  if (currentScreen === 'bot' && soloPlayerName) {
    return (
      <SoloBotScreen
        playerName={soloPlayerName}
        onBackToHome={handleBackToHome}
      />
    );
  }

  // Multijoueur - partie en cours
  if (currentGame && currentPlayer) {
    if (currentGame.status === GameStatus.WAITING) {
      return (
        <MultiplayerHomeScreen
          onGameJoined={handleGameJoined}
          onBackToHome={handleBackToHome}
          onStartSolo={handleStartSolo}
          onStartBot={handleStartBot}
          onShowLeaderboard={() => setCurrentScreen('leaderboard')}
          onShowStats={() => setCurrentScreen('stats')}
          initialGame={currentGame}
          initialPlayer={currentPlayer}
          initialGameCode={gameCode}
        />
      );
    }
    return (
      <MultiplayerGameScreen
        game={currentGame}
        currentPlayerId={currentPlayer.id}
        onBackToHome={handleBackToHome}
      />
    );
  }

  // Accueil
  return (
    <MultiplayerHomeScreen
      onGameJoined={handleGameJoined}
      onStartSolo={handleStartSolo}
      onStartBot={handleStartBot}
      onShowLeaderboard={() => setCurrentScreen('leaderboard')}
      onShowStats={() => setCurrentScreen('stats')}
      onBackToHome={handleBackToHome}
    />
  );
}

export default App;
