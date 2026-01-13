import { useState } from 'react';
import { Game, GameStatus } from '../shared/types';
import { GameService, ProposalResult } from '../shared/services/GameService';
import '../styles/GameScreen.css';

interface GameScreenProps {
  game: Game;
  gameService: GameService;
  onGameUpdate: (game: Game) => void;
  onBackToHome: () => void;
}

export default function GameScreen({
  game,
  gameService,
  onGameUpdate,
  onBackToHome,
}: GameScreenProps) {
  const [artistName, setArtistName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<ProposalResult | null>(null);

  const currentPlayer = gameService.getCurrentPlayer(game);
  const activePlayers = gameService.getActivePlayers(game);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!artistName.trim() || !currentPlayer || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setLastResult(null);

    try {
      const result = await gameService.proposeArtist(
        game,
        currentPlayer.id,
        artistName.trim()
      );

      setLastResult(result);
      onGameUpdate(result.game);
      setArtistName('');

      // Effacer le message après 3 secondes
      setTimeout(() => setLastResult(null), 3000);
    } catch (error) {
      console.error('Erreur lors de la proposition:', error);
    } finally {
      setIsSubmitting(false);
    }
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
            <button
              className="btn btn-primary mt-3"
              onClick={onBackToHome}
            >
              Nouvelle partie
            </button>
          </div>
        ) : (
          <>
            {/* Joueur actuel */}
            {currentPlayer && (
              <div className="card current-player-card fade-in">
                <div className="current-player-header">
                  <span className="player-badge">Tour actuel</span>
                  <h2 className="current-player-name">{currentPlayer.name}</h2>
                </div>
                {game.lastArtistName && (
                  <div className="last-artist">
                    <span className="last-artist-label">Artiste précédent :</span>
                    <span className="last-artist-name">{game.lastArtistName}</span>
                  </div>
                )}
                {!game.lastArtistName && (
                  <p className="first-turn-hint">
                    💡 Vous pouvez proposer n'importe quel artiste
                  </p>
                )}
              </div>
            )}

            {/* Formulaire de proposition */}
            {currentPlayer && (
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

            {/* Message de résultat */}
            {lastResult && (
              <div
                className={`card result-card fade-in ${
                  lastResult.isValid ? 'result-valid' : 'result-invalid'
                }`}
              >
                <div className="result-icon">
                  {lastResult.isValid ? '✓' : '✗'}
                </div>
                <p className="result-message">{lastResult.message}</p>
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
              return (
                <div
                  key={player.id}
                  className={`player-item ${
                    isCurrent ? 'player-current' : ''
                  } ${!isActive ? 'player-eliminated' : ''}`}
                >
                  <div className="player-item-name">{player.name}</div>
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
