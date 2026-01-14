import { useState, useEffect, FormEvent } from 'react';
import { SoloRunStatus } from '../shared/types';
import { useSoloInfiniteGame } from '../hooks/useSoloInfiniteGame';
import '../styles/GameScreen.css';

interface SoloInfiniteScreenProps {
  playerName: string;
  onBackToHome: () => void;
}

export default function SoloInfiniteScreen({ playerName, onBackToHome }: SoloInfiniteScreenProps) {
  const { run, isLoading, timeRemaining, startRun, makeMove } = useSoloInfiniteGame();
  const [artistName, setArtistName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastMessage, setLastMessage] = useState<{
    message: string;
    isValid: boolean;
  } | null>(null);

  // Démarrer la run au montage
  useEffect(() => {
    if (!run && !isLoading) {
      startRun(playerName);
    }
  }, [run, isLoading, playerName, startRun]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!run || run.status !== SoloRunStatus.IN_PROGRESS || isSubmitting || !artistName.trim()) {
      return;
    }

    setIsSubmitting(true);
    setLastMessage(null);

    try {
      const result = await makeMove(artistName.trim());
      
      setLastMessage({
        message: result.message,
        isValid: result.isValid,
      });

      if (!result.isValid) {
        // Run terminée - le message sera affiché
        setTimeout(() => setLastMessage(null), 5000);
      } else {
        // Coup valide, continuer
        setArtistName('');
        // Effacer le message après 3 secondes
        setTimeout(() => setLastMessage(null), 3000);
      }
    } catch (err: any) {
      setLastMessage({
        message: err.message || 'Erreur lors du traitement du coup',
        isValid: false,
      });
      setTimeout(() => setLastMessage(null), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!run) {
    return (
      <div className="game-screen">
        <div className="container">
          <div className="card fade-in">
            <p className="waiting-turn-message">Chargement...</p>
          </div>
        </div>
      </div>
    );
  }

  const isGameFinished = run.status === SoloRunStatus.FINISHED;
  const canPlay = run.status === SoloRunStatus.IN_PROGRESS && !isSubmitting && !isGameFinished;
  const currentArtist = run.currentArtist || run.seedArtist;

  return (
    <div className="game-screen">
      <div className="container">
        {/* Header - même style que multijoueur */}
        <div className="game-header">
          <button className="btn btn-secondary btn-back" onClick={onBackToHome}>
            ← Retour
          </button>
          <h1 className="game-title">Roland Gamos - Solo</h1>
          <div className="connection-status connected">
            🟢
          </div>
        </div>

        {/* Statut de la partie - même style que multijoueur */}
        {isGameFinished ? (
          <div className="card game-finished-card fade-in">
            <h2 className="finished-title">🎉 Game Over !</h2>
            <div className="winner-section">
              <p className="winner-text">
                Score final: <strong>{run.totalScore}</strong>
              </p>
              <p className="winner-text" style={{ fontSize: '1.2rem', marginTop: '0.5rem' }}>
                Tour atteint: {run.currentTurn - 1}
              </p>
              {run.endReason && (
                <p className="winner-text" style={{ fontSize: '1rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
                  Raison: {
                    run.endReason === 'TIMEOUT' ? '⏱️ Temps écoulé' :
                    run.endReason === 'REPEAT' ? '🔄 Artiste déjà utilisé' :
                    run.endReason === 'INVALID_FEAT' ? '❌ Aucune collaboration trouvée' :
                    '❌ Erreur'
                  }
                </p>
              )}
            </div>
            <div className="finished-actions mt-3">
              <button className="btn btn-primary w-full" onClick={onBackToHome}>
                Retour à l'accueil
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Joueur actuel - même style que multijoueur */}
            <div className="card current-player-card fade-in">
              <div className="current-player-header">
                <span className="player-badge">Mode Solo</span>
                <h2 className="current-player-name">{playerName}</h2>
                <span className="your-turn-badge">C'est votre tour !</span>
              </div>
              
              {/* Timer - même style que multijoueur */}
              {timeRemaining !== null && run.status === SoloRunStatus.IN_PROGRESS && (
                <div className="timer-section">
                  <div className={`timer-display ${timeRemaining <= 10 ? 'timer-warning' : ''} ${timeRemaining <= 5 ? 'timer-danger' : ''}`}>
                    <span className="timer-icon">⏱️</span>
                    <span className="timer-value">{timeRemaining}s</span>
                  </div>
                </div>
              )}

              {currentArtist && (
                <div className="last-artist">
                  <span className="last-artist-label">Artiste actuel :</span>
                  <span className="last-artist-name">{currentArtist.name}</span>
                </div>
              )}
            </div>

            {/* Formulaire de proposition - même style que multijoueur */}
            {canPlay && (
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

            {!canPlay && run.status === SoloRunStatus.IN_PROGRESS && (
              <div className="card proposal-card fade-in">
                <p className="waiting-turn-message">
                  ⏳ Chargement...
                </p>
              </div>
            )}

            {/* Message de résultat - même style que multijoueur */}
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

            {/* Affichage du score - style personnalisé pour solo */}
            <div className="card players-card fade-in">
              <h3 className="players-card-title">Statistiques</h3>
              <div className="players-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <div className="player-item player-current">
                  <div className="player-item-name">Score total</div>
                  <div className="player-item-status">
                    <span className="status-badge status-current" style={{ fontSize: '1.2rem', padding: '0.5rem 1rem' }}>
                      {run.totalScore}
                    </span>
                  </div>
                </div>
                <div className="player-item">
                  <div className="player-item-name">Tour actuel</div>
                  <div className="player-item-status">
                    <span className="status-badge status-waiting" style={{ fontSize: '1.2rem', padding: '0.5rem 1rem' }}>
                      {run.currentTurn}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Historique - même style que multijoueur */}
        {run.moves.length > 0 && (
          <div className="card history-card fade-in">
            <h3 className="history-title">Historique</h3>
            <div className="history-list">
              {run.moves.map((move: any, index: number) => (
                <div
                  key={index}
                  className={`history-item ${
                    move.isValid ? 'history-valid' : 'history-invalid'
                  }`}
                >
                  <div className="history-item-header">
                    <span className="history-player">Tour {move.turn}</span>
                    <span className="history-icon">
                      {move.isValid ? '✓' : '✗'}
                    </span>
                  </div>
                  <div className="history-artist">
                    {move.artist?.name || move.proposedArtistName || 'N/A'}
                    {move.isValid && move.scoring && (
                      <span style={{ marginLeft: '0.5rem', color: 'var(--success)', fontWeight: '600' }}>
                        (+{move.scoring.finalScore} pts)
                      </span>
                    )}
                    {!move.isValid && (
                      <span style={{ marginLeft: '0.5rem', color: 'var(--error)', fontSize: '0.85rem' }}>
                        ({move.invalidReason === 'TIMEOUT' ? 'Timeout' :
                          move.invalidReason === 'REPEAT' ? 'Répétition' :
                          move.invalidReason === 'INVALID_FEAT' ? 'Pas de collaboration' :
                          move.invalidReason === 'NOT_FOUND' ? 'Artiste introuvable' :
                          'Erreur'})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
