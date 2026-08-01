import { useState, useEffect, useRef, FormEvent } from 'react';
import { SoloRunStatus } from '../shared/types';
import { useSoloInfiniteGame } from '../hooks/useSoloInfiniteGame';
import { useArtistAutocomplete } from '../hooks/useArtistAutocomplete';
import GameOverScreen from './GameOverScreen';
import '../styles/GameScreen.css';
import '../styles/Backgrounds.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
// NOTE provisoire : fond animé PixelLab pas encore généré pour cet écran (quota
// de génération du compte PixelLab épuisé — 40/40 trial, 0$ crédit). En
// attendant, on garde le croquis statique + décor CSS (cf. Backgrounds.css).
// TODO: régénérer via src/scripts/assets/generateAnimatedBackgrounds.ts solo-infini
// une fois le compte rechargé, puis appliquer le même pattern que l'Accueil.

interface SoloInfiniteScreenProps {
  playerName: string;
  playerId: string;
  onBackToHome: () => void;
  onReplay: () => void;
}

export default function SoloInfiniteScreen({ playerName, playerId, onBackToHome, onReplay }: SoloInfiniteScreenProps) {
  const { run, isLoading, timeRemaining, startRun, makeMove } = useSoloInfiniteGame();
  const [artistName, setArtistName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastMessage, setLastMessage] = useState<{
    message: string;
    isValid: boolean;
  } | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [showHints, setShowHints] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { suggestions, clear: clearSuggestions } = useArtistAutocomplete(artistName);

  // Démarrer la run au montage
  useEffect(() => {
    if (!run && !isLoading) {
      startRun(playerName);
    }
  }, [run, isLoading, playerName, startRun]);

  // Charger les hints quand l'artiste change
  useEffect(() => {
    setHints([]);
    setShowHints(false);
  }, [run?.currentArtist?.name]);

  const loadHints = async () => {
    if (!run) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/solo/infinite/hint/${run.id}`);
      const data = await res.json();
      setHints(data.hints || []);
      setShowHints(true);
    } catch {
      setHints([]);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!run || run.status !== SoloRunStatus.IN_PROGRESS || isSubmitting || !artistName.trim()) {
      return;
    }

    setIsSubmitting(true);
    setLastMessage(null);

    clearSuggestions();
    setShowSuggestions(false);

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

  // Afficher l'écran de fin de partie
  if (isGameFinished) {
    return (
      <GameOverScreen
        data={{
          score: run.totalScore,
          turns: run.currentTurn - 1,
          mode: 'Solo Infini',
          playerName,
          endReason: run.endReason,
        }}
        runId={run.id}
        playerId={playerId}
        onReplay={onReplay}
        onBackToHome={onBackToHome}
      />
    );
  }

  return (
    <div className="game-screen game-screen--solo-infini">
      <div className="deco-layer">
        <span className="deco-rec-dot" style={{ top: '11%', left: '90%' }} />
        <div className="deco-wave-glow" style={{ top: '45%', left: '30%', width: '40%', height: '15%' }} />
      </div>
      <div className="container">
        {/* Header */}
        <div className="game-header">
          <button className="btn btn-secondary btn-back" onClick={onBackToHome}>
            ← Retour
          </button>
          <h1 className="game-title">Roland Gamos - Solo</h1>
          <div className="connection-status connected">
            🟢
          </div>
        </div>

        {/* Joueur actuel */}
        <>
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
                  <div style={{ position: 'relative' }}>
                    <input
                      id="artist-input"
                      type="text"
                      className="input artist-input"
                      placeholder="Ex: Booba, Kaaris, Damso..."
                      value={artistName}
                      onChange={(e) => { setArtistName(e.target.value); setShowSuggestions(true); }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                      disabled={isSubmitting}
                      autoFocus
                      autoComplete="off"
                    />
                    {showSuggestions && suggestions.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                        background: 'var(--bg-surface)', border: '1px solid var(--border)',
                        borderRadius: '0 0 8px 8px', maxHeight: '200px', overflowY: 'auto',
                      }}>
                        {suggestions.map((s) => (
                          <div
                            key={s}
                            style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.9rem' }}
                            onMouseDown={() => { setArtistName(s); setShowSuggestions(false); }}
                          >
                            {s}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary w-full mt-2"
                    disabled={!artistName.trim() || isSubmitting}
                  >
                    {isSubmitting ? 'Validation...' : 'Proposer'}
                  </button>
                </form>
                <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
                  {!showHints ? (
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0.3rem 0.8rem' }}
                      onClick={loadHints}
                      type="button"
                    >
                      💡 Aide (collabs connues)
                    </button>
                  ) : hints.length > 0 ? (
                    <div style={{ marginTop: '0.5rem' }}>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Collabs connues :</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'center' }}>
                        {hints.map((h) => (
                          <button
                            key={h}
                            className="btn btn-secondary"
                            style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem' }}
                            onClick={() => setArtistName(h as string)}
                            type="button"
                          >
                            {h}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Aucune collab connue dans la base</p>
                  )}
                </div>
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

        {/* Historique */}
        {run.moves.length > 0 && (
          <div className="card history-card fade-in">
            <h3
              className="history-title"
              style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setShowHistory(h => !h)}
            >
              Historique {showHistory ? '▲' : '▼'}
            </h3>
            {showHistory && (
              <div className="history-list">
                {run.moves.map((move: any, index: number) => (
                  <div
                    key={index}
                    className={`history-item ${move.isValid ? 'history-valid' : 'history-invalid'}`}
                  >
                    <div className="history-item-header">
                      <span className="history-player">Tour {move.turn}</span>
                      <span className="history-icon">{move.isValid ? '✓' : '✗'}</span>
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
                            move.invalidReason === 'NOT_FOUND' ? 'Artiste introuvable' : 'Erreur'})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
