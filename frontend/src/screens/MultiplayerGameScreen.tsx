import { useState, useEffect } from 'react';
import { Game, GameStatus } from '../shared/types';
import { socketService } from '../services/socketService';
import { GameService } from '../shared/services/GameService';
import '../styles/GameScreen.css';

interface MultiplayerGameScreenProps {
  game: Game;
  currentPlayerId: string;
  onBackToHome: () => void;
}

export default function MultiplayerGameScreen({
  game: initialGame,
  currentPlayerId,
  onBackToHome,
}: MultiplayerGameScreenProps) {
  const [game, setGame] = useState<Game>(initialGame);
  const [artistName, setArtistName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastMessage, setLastMessage] = useState<{
    message: string;
    isValid: boolean;
  } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('connected');
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  const gameService = new GameService();
  const currentPlayer = gameService.getCurrentPlayer(game);
  const activePlayers = gameService.getActivePlayers(game);
  const isMyTurn = currentPlayer?.id === currentPlayerId;
  
  // Timer: calculer et mettre à jour le temps restant
  useEffect(() => {
    if (!game.currentTurnEndsAt || game.status !== GameStatus.IN_PROGRESS) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, game.currentTurnEndsAt! - now);
      setTimeRemaining(Math.ceil(remaining / 1000)); // Convertir en secondes
    };

    // Mettre à jour immédiatement
    updateTimer();

    // Mettre à jour toutes les secondes
    const interval = setInterval(updateTimer, 100);

    return () => clearInterval(interval);
  }, [game.currentTurnEndsAt, game.status]);

  useEffect(() => {
    // Écouter les mises à jour de la partie
    const handleGameUpdated = (data: {
      game: Game;
      message: string;
      isValid: boolean;
    }) => {
      setGame(data.game);
      setLastMessage({
        message: data.message,
        isValid: data.isValid,
      });
      setIsSubmitting(false);
      setArtistName('');

      // Effacer le message après 3 secondes
      setTimeout(() => setLastMessage(null), 3000);
    };

    const handleGameStarted = (data: { game: Game }) => {
      setGame(data.game);
      // Réinitialiser les états pour le nouveau tour
      setArtistName('');
      setIsSubmitting(false);
      setLastMessage(null);
    };

    const handleGameReset = (data: { game: Game; gameCode: string }) => {
      setGame(data.game);
      setArtistName('');
      setIsSubmitting(false);
      setLastMessage(null);
    };

    const handleError = (data: { message: string }) => {
      setLastMessage({
        message: data.message,
        isValid: false,
      });
      setIsSubmitting(false);
    };

    const handleConnect = () => {
      setConnectionStatus('connected');
      // Demander l'état actuel de la partie
      socketService.emit('get-game-state', { gameId: game.id });
    };

    socketService.on('game-updated', handleGameUpdated);
    socketService.on('game-started', handleGameStarted);
    socketService.on('game-reset', handleGameReset);
    socketService.on('error', handleError);
    socketService.on('game-state', (data) => {
      setGame(data.game);
    });

    socketService.on('game-reconnected', (data) => {
      setGame(data.game);
    });

    // Écouter les événements de connexion/déconnexion
    if (socketService.isConnected()) {
      handleConnect();
    } else {
      setConnectionStatus('disconnected');
    }

    return () => {
      socketService.off('game-updated', handleGameUpdated);
      socketService.off('game-started', handleGameStarted);
      socketService.off('game-reset', handleGameReset);
      socketService.off('game-reconnected', () => {});
      socketService.off('error', handleError);
    };
  }, [game.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!artistName.trim() || !isMyTurn || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setLastMessage(null);

    socketService.emit('propose-artist', {
      gameId: game.id,
      artistName: artistName.trim(),
    });
  };

  const isGameFinished = game.status === GameStatus.FINISHED;

  return (
    <div className="game-screen">
      <div className="container">
        {/* Header */}
        <div className="game-header">
          <button className="btn btn-secondary btn-back" onClick={onBackToHome}>
            ← Retour
          </button>
          <h1 className="game-title">Roland Gamos</h1>
          <div className={`connection-status ${connectionStatus}`}>
            {connectionStatus === 'connected' ? '🟢' : '🔴'}
          </div>
        </div>

        {/* Statut de la partie */}
        {isGameFinished ? (
          <div className="card game-finished-card fade-in">
            <h2 className="finished-title">🎉 Partie terminée !</h2>
            {activePlayers.length > 0 ? (
              <div className="winner-section">
                <p className="winner-text">
                  <strong>{activePlayers[0].name}</strong> a gagné !
                </p>
              </div>
            ) : (
              <p className="winner-text">Tous les joueurs ont été éliminés</p>
            )}
            <div className="finished-actions mt-3">
              {game.players[0].id === currentPlayerId && (
                <button
                  className="btn btn-primary w-full"
                  onClick={() => {
                    socketService.emit('reset-game', { gameId: game.id });
                  }}
                >
                  🔄 Recommencer avec les mêmes joueurs
                </button>
              )}
              <button className="btn btn-secondary w-full mt-2" onClick={onBackToHome}>
                Retour à l'accueil
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Joueur actuel */}
            {currentPlayer ? (
              <div className="card current-player-card fade-in">
                <div className="current-player-header">
                  <span className="player-badge">Tour actuel</span>
                  <h2 className="current-player-name">{currentPlayer.name}</h2>
                  {isMyTurn && (
                    <span className="your-turn-badge">C'est votre tour !</span>
                  )}
                </div>
                
                {/* Timer */}
                {timeRemaining !== null && game.status === GameStatus.IN_PROGRESS && (
                  <div className="timer-section">
                    <div className={`timer-display ${timeRemaining <= 10 ? 'timer-warning' : ''} ${timeRemaining <= 5 ? 'timer-danger' : ''}`}>
                      <span className="timer-icon">⏱️</span>
                      <span className="timer-value">{timeRemaining}s</span>
                    </div>
                    {isMyTurn && game.attemptsUsed !== undefined && (
                      <div className="attempts-display">
                        Tentatives: {game.attemptsUsed}/2
                      </div>
                    )}
                  </div>
                )}

                {game.lastArtistName && (
                  <div className="last-artist">
                    <span className="last-artist-label">Artiste précédent :</span>
                    <span className="last-artist-name">{game.lastArtistName}</span>
                  </div>
                )}
                {!game.lastArtistName && (
                  <p className="first-turn-hint">
                    💡 Le premier joueur peut proposer n'importe quel artiste
                  </p>
                )}
              </div>
            ) : (
              <div className="card current-player-card fade-in">
                <div className="current-player-header">
                  <span className="player-badge">Tour actuel</span>
                  <h2 className="current-player-name">Chargement...</h2>
                </div>
              </div>
            )}

            {/* Formulaire de proposition */}
            {currentPlayer && isMyTurn && game.status === GameStatus.IN_PROGRESS && (
              <div className="card proposal-card fade-in">
                <form onSubmit={handleSubmit} className="proposal-form">
                  <label htmlFor="artist-input" className="proposal-label">
                    Proposer un artiste
                  </label>
                  <input
                    id="artist-input"
                    type="text"
                    className="input artist-input"
                    placeholder="Ex: Booba, Kaaris, Damso..."
                    value={artistName}
                    onChange={(e) => setArtistName(e.target.value)}
                    disabled={isSubmitting}
                    autoFocus
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    className="btn btn-primary w-full mt-2"
                    disabled={!artistName.trim() || isSubmitting}
                  >
                    {isSubmitting ? 'Validation...' : 'Proposer'}
                  </button>
                </form>
              </div>
            )}

            {currentPlayer && !isMyTurn && game.status === GameStatus.IN_PROGRESS && (
              <div className="card proposal-card fade-in">
                <p className="waiting-turn-message">
                  ⏳ En attente du tour de <strong>{currentPlayer.name}</strong>
                </p>
              </div>
            )}

            {!currentPlayer && game.status === GameStatus.IN_PROGRESS && (
              <div className="card proposal-card fade-in">
                <p className="waiting-turn-message">
                  ⏳ Chargement...
                </p>
              </div>
            )}

            {/* Message de résultat */}
            {lastMessage && (
              <div
                className={`card result-card fade-in ${
                  lastMessage.isValid ? 'result-valid' : 'result-invalid'
                }`}
              >
                <div className="result-icon">
                  {lastMessage.isValid ? '✓' : '✗'}
                </div>
                <p className="result-message">{lastMessage.message}</p>
              </div>
            )}
          </>
        )}

        {/* Liste des joueurs */}
        <div className="card players-card fade-in">
          <h3 className="players-card-title">Joueurs</h3>
          <div className="players-grid">
            {game.players.map((player) => {
              const isCurrent = currentPlayer?.id === player.id;
              const isActive = !player.isEliminated;
              const isMe = player.id === currentPlayerId;
              return (
                <div
                  key={player.id}
                  className={`player-item ${
                    isCurrent ? 'player-current' : ''
                  } ${!isActive ? 'player-eliminated' : ''} ${isMe ? 'player-me' : ''}`}
                >
                  <div className="player-item-name">
                    {player.name}
                    {isMe && ' (Vous)'}
                  </div>
                  <div className="player-item-status">
                    {isCurrent && !isGameFinished && (
                      <span className="status-badge status-current">Tour</span>
                    )}
                    {!isActive && (
                      <span className="status-badge status-eliminated">
                        Éliminé
                      </span>
                    )}
                    {isActive && !isCurrent && (
                      <span className="status-badge status-waiting">
                        En attente
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Historique des tours */}
        {game.turns.length > 0 && (
          <div className="card history-card fade-in">
            <h3 className="history-title">Historique</h3>
            <div className="history-list">
              {game.turns.map((turn, index) => {
                const player = game.players.find((p) => p.id === turn.playerId);
                return (
                  <div
                    key={index}
                    className={`history-item ${
                      turn.isValid ? 'history-valid' : 'history-invalid'
                    }`}
                  >
                    <div className="history-item-header">
                      <span className="history-player">{player?.name}</span>
                      <span className="history-icon">
                        {turn.isValid ? '✓' : '✗'}
                      </span>
                    </div>
                    <div className="history-artist">{turn.artistName}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
