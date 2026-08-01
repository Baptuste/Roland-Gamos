import { useState, useEffect } from 'react';
import MultiplayerHomeScreen from './screens/MultiplayerHomeScreen';
import MultiplayerGameScreen from './screens/MultiplayerGameScreen';
import SoloInfiniteScreen from './screens/SoloInfiniteScreen';
import SoloBotScreen from './screens/SoloBotScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';
import CasierScreen from './screens/CasierScreen';
import GalaxyScreen from './screens/GalaxyScreen';
import ProfileScreen from './screens/ProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import { Game, Player, GameStatus } from './shared/types';
import { socketService } from './services/socketService';
import { BACKEND_URL } from './services/backendUrl';

// Clés pour le localStorage
const STORAGE_KEYS = {
  GAME_CODE: 'roland-gamos-game-code',
  PLAYER_ID: 'roland-gamos-player-id',
  PLAYER_NAME: 'roland-gamos-player-name',
  GAME_ID: 'roland-gamos-game-id',
  SOLO_PLAYER_UUID: 'roland-gamos-solo-uuid', // UUID persistant pour les modes solo
};

/** Génère ou retrouve l'UUID solo du joueur */
function getSoloPlayerId(): string {
  let uuid = localStorage.getItem(STORAGE_KEYS.SOLO_PLAYER_UUID);
  if (!uuid) {
    uuid = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEYS.SOLO_PLAYER_UUID, uuid);
  }
  return uuid;
}

type Screen = 'home' | 'solo' | 'bot' | 'leaderboard' | 'casier' | 'galaxy' | 'multiplayer' | 'profile' | 'settings';

function App() {
  const [currentGame, setCurrentGame] = useState<Game | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [gameCode, setGameCode] = useState<string | null>(null);
  const [soloPlayerName, setSoloPlayerName] = useState<string | null>(null);
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const soloPlayerId = getSoloPlayerId();

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

  // Renvoyer l'identité du joueur au serveur si le socket se reconnecte tout
  // seul (coupure réseau) pendant qu'une partie est active — sans ça,
  // GameManager garde l'ancien socket id mort et peut supprimer la partie
  // (et son code) au bout de LOBBY_DISCONNECT_GRACE_MS si personne d'autre
  // n'est présent. La logique de montage dans le useEffect plus haut ne
  // couvre que le rechargement de page, pas ce cas.
  useEffect(() => {
    if (!currentGame || !currentPlayer) return;

    const resendIdentity = () => {
      socketService.emit('reconnect-game', {
        gameCode: gameCode || localStorage.getItem(STORAGE_KEYS.GAME_CODE) || '',
        playerId: currentPlayer.id,
      });
    };

    socketService.onSocketReconnect(resendIdentity);
    return () => socketService.offSocketReconnect(resendIdentity);
  }, [currentGame?.id, currentPlayer?.id, gameCode]);

  const handleGameJoined = (game: Game, player: Player, code?: string) => {
    setCurrentGame(game);
    setCurrentPlayer(player);
    setCurrentScreen('multiplayer');
    // Sans ça, Statistiques/Classement restent vides pour un joueur qui n'a
    // jamais lancé de partie Solo (soloPlayerName reste null autrement).
    setSoloPlayerName(player.name);
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
    // soloPlayerName n'est plus réinitialisé ici : c'est aussi l'identité
    // utilisée par Statistiques/Classement, qui doivent rester consultables
    // après une partie Multijoueur sans repasser par le Solo.
    setCurrentScreen('home');
  };

  const handleShowCasier = (playerName: string) => {
    setSoloPlayerName(playerName);
    fetch(`${BACKEND_URL}/api/players/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: soloPlayerId, pseudo: playerName }),
    }).catch(() => {});
    setCurrentScreen('casier');
  };

  const handleShowProfile = (playerName: string) => {
    setSoloPlayerName(playerName);
    // Identifier le joueur en base (fire and forget) — même pattern que handleStartSolo,
    // pour qu'un joueur venu du Multijoueur ait aussi un profil consultable.
    fetch(`${BACKEND_URL}/api/players/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: soloPlayerId, pseudo: playerName }),
    }).catch(() => {});
    setCurrentScreen('profile');
  };

  const handleStartSolo = (playerName: string) => {
    setSoloPlayerName(playerName);
    // Identifier le joueur en base (fire and forget)
    fetch(`${BACKEND_URL}/api/players/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: soloPlayerId, pseudo: playerName }),
    }).catch(() => {});
    setCurrentScreen('solo');
  };

  const handleStartBot = (playerName: string) => {
    setSoloPlayerName(playerName);
    fetch(`${BACKEND_URL}/api/players/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: soloPlayerId, pseudo: playerName }),
    }).catch(() => {});
    setCurrentScreen('bot');
  };

  const handleReplaySolo = () => {
    // Relancer le même mode avec le même nom
    setCurrentScreen('home'); // reset pour forcer remontage du screen
    setTimeout(() => setCurrentScreen('solo'), 50);
  };

  const handleReplayBot = () => {
    setCurrentScreen('home');
    setTimeout(() => setCurrentScreen('bot'), 50);
  };

  // Écrans secondaires
  if (currentScreen === 'leaderboard') {
    return <LeaderboardScreen onBackToHome={handleBackToHome} />;
  }

  if (currentScreen === 'casier') {
    return (
      <CasierScreen
        playerId={soloPlayerId}
        playerName={soloPlayerName || ''}
        onBackToHome={handleBackToHome}
      />
    );
  }

  if (currentScreen === 'galaxy') {
    return <GalaxyScreen playerId={soloPlayerId} onBackToHome={handleBackToHome} />;
  }

  if (currentScreen === 'profile') {
    return (
      <ProfileScreen
        playerId={soloPlayerId}
        playerName={soloPlayerName || ''}
        onBackToHome={handleBackToHome}
        onEditSettings={() => setCurrentScreen('settings')}
      />
    );
  }

  if (currentScreen === 'settings') {
    return (
      <SettingsScreen
        playerId={soloPlayerId}
        currentPseudo={soloPlayerName || ''}
        onBackToHome={handleBackToHome}
        onPseudoChange={(newPseudo) => setSoloPlayerName(newPseudo)}
      />
    );
  }

  // Solo infini
  if (currentScreen === 'solo' && soloPlayerName) {
    return (
      <SoloInfiniteScreen
        playerName={soloPlayerName}
        playerId={soloPlayerId}
        onBackToHome={handleBackToHome}
        onReplay={handleReplaySolo}
      />
    );
  }

  // Solo vs Bot
  if (currentScreen === 'bot' && soloPlayerName) {
    return (
      <SoloBotScreen
        playerName={soloPlayerName}
        playerId={soloPlayerId}
        onBackToHome={handleBackToHome}
        onReplay={handleReplayBot}
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
          onShowGalaxy={() => setCurrentScreen('galaxy')}
          onShowCasier={handleShowCasier}
          onShowProfile={handleShowProfile}
          initialGame={currentGame}
          initialPlayer={currentPlayer}
          initialGameCode={gameCode}
          persistentPlayerId={soloPlayerId}
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
      onShowGalaxy={() => setCurrentScreen('galaxy')}
      onShowCasier={handleShowCasier}
      onShowProfile={handleShowProfile}
      onBackToHome={handleBackToHome}
      persistentPlayerId={soloPlayerId}
    />
  );
}

export default App;
