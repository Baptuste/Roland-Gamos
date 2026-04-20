import { useState, useEffect, useRef, FormEvent } from 'react';
import { botService, BotGameRun, BotGameMoveResult } from '../shared/services/BotService';
import { useArtistAutocomplete } from '../hooks/useArtistAutocomplete';
import GameOverScreen from './GameOverScreen';
import '../styles/GameScreen.css';

interface SoloBotScreenProps {
  playerName: string;
  playerId: string;
  onBackToHome: () => void;
  onReplay: () => void;
}

export default function SoloBotScreen({ playerName, playerId, onBackToHome, onReplay }: SoloBotScreenProps) {
  const [run, setRun] = useState<BotGameRun | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [artistName, setArtistName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastMessage, setLastMessage] = useState<{ message: string; isValid: boolean } | null>(null);
  const [botMessage, setBotMessage] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const timeoutCheckDoneRef = useRef<boolean>(false);
  const { suggestions, clear: clearSuggestions } = useArtistAutocomplete(artistName);

  // Pas de sauvegarde ici — c'est GameOverScreen qui appelle /api/solo/bot/finish

  // Démarrer la partie au montage
  useEffect(() => {
    if (!run && !isLoading) {
      setIsLoading(true);
      botService.startGame(playerName)
        .then(newRun => {
          setRun(newRun);
          timeoutCheckDoneRef.current = false;
        })
        .catch(err => {
          setLastMessage({ message: err.message || 'Erreur lors du démarrage', isValid: false });
        })
        .finally(() => setIsLoading(false));
    }
  }, []);

  // Timer
  useEffect(() => {
    if (!run || run.status !== 'in_progress' || !run.currentTurnEndsAt) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((run.currentTurnEndsAt! - Date.now()) / 1000));
      setTimeRemaining(remaining);

      if (remaining === 0 && !timeoutCheckDoneRef.current && run.status === 'in_progress') {
        timeoutCheckDoneRef.current = true;
        setTimeout(() => {
          if (run && run.id) {
            botService.getRun(run.id).then(setRun).catch(() => {});
          }
        }, 500);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);
    return () => clearInterval(interval);
  }, [run?.currentTurnEndsAt, run?.status, run?.id]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!run || run.status !== 'in_progress' || isSubmitting || !artistName.trim() || !run.isPlayerTurn) {
      return;
    }

    clearSuggestions();
    setShowSuggestions(false);
    setIsSubmitting(true);
    setLastMessage(null);
    setBotMessage(null);

    try {
      const result: BotGameMoveResult = await botService.makeMove(run.id, artistName.trim());

      setLastMessage({
        message: result.playerMove.message,
        isValid: result.playerMove.isValid,
      });

      if (result.playerMove.isValid && result.botMove) {
        // Afficher la réponse du bot après un délai
        setTimeout(() => {
          setBotMessage(result.botMove!.message);
          if (!result.botMove!.isValid) {
            // Le bot a échoué
            setTimeout(() => setBotMessage(null), 5000);
          } else {
            setTimeout(() => setBotMessage(null), 3000);
          }
        }, 800);
      }

      setRun(result.run);
      timeoutCheckDoneRef.current = false;

      if (result.playerMove.isValid) {
        setArtistName('');
        setTimeout(() => setLastMessage(null), 3000);
      } else {
        setTimeout(() => setLastMessage(null), 5000);
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

  const isGameFinished = run.status === 'finished';
  const canPlay = run.status === 'in_progress' && !isSubmitting && run.isPlayerTurn;
  const currentArtist = run.currentArtist || run.seedArtist;

  // Écran de fin de partie
  if (isGameFinished) {
    return (
      <GameOverScreen
        data={{
          score: run.playerScore,
          turns: run.playerMoves.length,
          mode: 'Solo Bot',
          playerName,
          winner: run.winner,
          endReason: run.winner === 'bot' ? (run.endReason || 'INVALID_FEAT') : undefined,
        }}
        runId={run.id}
        playerId={playerId}
        onReplay={onReplay}
        onBackToHome={onBackToHome}
      />
    );
  }

  return (
    <div className="game-screen">
      <div className="container">
        {/* Header */}
        <div className="game-header">
          <button className="btn btn-secondary btn-back" onClick={onBackToHome}>
            ← Retour
          </button>
          <h1 className="game-title">Roland Gamos - vs Bot</h1>
          <div className="connection-status connected">🟢</div>
        </div>

        <>

            {/* Scores */}
            <div className="card players-card fade-in" style={{ marginBottom: '1rem' }}>
              <div className="players-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className={`player-item ${run.isPlayerTurn ? 'player-current' : ''}`}>
                  <div className="player-item-name">{playerName}</div>
                  <div className="player-item-status">
                    <span className="status-badge status-current" style={{ fontSize: '1.1rem', padding: '0.4rem 0.8rem' }}>
                      {run.playerScore} pts
                    </span>
                  </div>
                </div>
                <div className={`player-item ${!run.isPlayerTurn ? 'player-current' : ''}`}>
                  <div className="player-item-name">Bot</div>
                  <div className="player-item-status">
                    <span className="status-badge status-waiting" style={{ fontSize: '1.1rem', padding: '0.4rem 0.8rem' }}>
                      {run.botScore} pts
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Joueur actuel */}
            <div className="card current-player-card fade-in">
              <div className="current-player-header">
                <span className="player-badge">
                  {run.isPlayerTurn ? 'Votre tour' : 'Tour du Bot...'}
                </span>
                <h2 className="current-player-name">
                  {run.isPlayerTurn ? playerName : 'Bot'}
                </h2>
                {run.isPlayerTurn && <span className="your-turn-badge">Proposez un artiste !</span>}
              </div>

              {/* Timer */}
              {timeRemaining !== null && run.isPlayerTurn && (
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

            {/* Formulaire */}
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
              </div>
            )}

            {!canPlay && run.status === 'in_progress' && (
              <div className="card proposal-card fade-in">
                <p className="waiting-turn-message">
                  ⏳ Le bot réfléchit...
                </p>
              </div>
            )}

            {/* Messages */}
            {lastMessage && (
              <div className={`card result-card fade-in ${lastMessage.isValid ? 'result-valid' : 'result-invalid'}`}>
                <div className="result-icon">{lastMessage.isValid ? '✓' : '✗'}</div>
                <p className="result-message">{lastMessage.message}</p>
              </div>
            )}

            {botMessage && (
              <div className="card result-card fade-in result-valid" style={{ borderColor: 'var(--secondary)' }}>
                <div className="result-icon">🤖</div>
                <p className="result-message">{botMessage}</p>
              </div>
            )}
        </>

        {/* Historique */}
        {(run.playerMoves.length > 0 || run.botMoves.length > 0) && (
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
                {[...run.playerMoves, ...run.botMoves]
                  .sort((a, b) => a.turn - b.turn || (a.timestamp - b.timestamp))
                  .map((move, index) => {
                    const isPlayerMove = run.playerMoves.includes(move);
                    return (
                      <div
                        key={index}
                        className={`history-item ${move.isValid ? 'history-valid' : 'history-invalid'}`}
                      >
                        <div className="history-item-header">
                          <span className="history-player">
                            {isPlayerMove ? playerName : 'Bot'} - Tour {move.turn}
                          </span>
                          <span className="history-icon">{move.isValid ? '✓' : '✗'}</span>
                        </div>
                        <div className="history-artist">
                          {move.artist?.name || 'N/A'}
                          {move.isValid && move.scoring && (
                            <span style={{ marginLeft: '0.5rem', color: 'var(--success)', fontWeight: '600' }}>
                              (+{move.scoring.finalScore} pts)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
