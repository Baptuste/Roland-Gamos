import { useState, useEffect } from 'react';
import { Game, GameStatus, getTeamIds, JokerType } from '../shared/types';
import { socketService } from '../services/socketService';
import { GameService } from '../shared/services/GameService';
import { useArtistAutocomplete } from '../hooks/useArtistAutocomplete';
import '../styles/GameScreen.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const TEAM_LABELS = ['Équipe A', 'Équipe B', 'Équipe C', 'Équipe D'];
const TEAM_COLORS = ['var(--primary)', 'var(--secondary)', 'var(--accent)', 'var(--error)'];
const JOKER_TYPES: JokerType[] = ['timer', 'skip', 'combo', 'bouclier', 'archives', 'resurrection'];
const JOKER_LABELS: Record<JokerType, string> = {
  timer: 'Timer',
  skip: 'Skip',
  combo: 'Combo',
  bouclier: 'Bouclier',
  archives: 'Archives',
  resurrection: 'Résurrection',
};
const JOKER_SHORT: Record<JokerType, string> = {
  timer: '⏱',
  skip: '⏭',
  combo: '2×',
  bouclier: '🛡',
  archives: '📜',
  resurrection: '✝',
};

/**
 * Aplatit le stock (compteur par type) en une liste d'instances, pour
 * afficher des "slots" individuels (voir CLAUDE_1.md — 3 slots jokers).
 */
function flattenJokerStock(stock: Partial<Record<JokerType, number>> | undefined): JokerType[] {
  if (!stock) return [];
  const result: JokerType[] = [];
  for (const type of JOKER_TYPES) {
    const count = stock[type] || 0;
    for (let i = 0; i < count; i++) result.push(type);
  }
  return result;
}

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
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { suggestions, clear: clearSuggestions } = useArtistAutocomplete(artistName);
  const [hints, setHints] = useState<string[]>([]);
  const [showHints, setShowHints] = useState(false);
  const [showResurrectionPicker, setShowResurrectionPicker] = useState(false);

  const gameService = new GameService();
  const currentPlayer = gameService.getCurrentPlayer(game);
  const activePlayers = gameService.getActivePlayers(game);
  const isMyTurn = currentPlayer?.id === currentPlayerId;
  const me = game.players.find((p) => p.id === currentPlayerId);
  const archivesRevealedForMe = game.turnJokerState?.archivesRevealedPlayerId === currentPlayerId;
  const historyVisible = game.settings.hintsEnabled || archivesRevealedForMe;

  const resurrectionTargets = game.players.filter((p) => {
    if (!p.isEliminated) return false;
    if (game.settings.teamsEnabled) return p.teamId && p.teamId === me?.teamId;
    return true;
  });

  const handleUseJoker = (jokerType: JokerType) => {
    if (jokerType === 'resurrection') {
      setShowResurrectionPicker((prev) => !prev);
      return;
    }
    socketService.emit('use-joker', { gameId: game.id, jokerType });
  };

  const handleUseResurrection = (targetPlayerId: string) => {
    socketService.emit('use-joker-on-target', { gameId: game.id, jokerType: 'resurrection', targetPlayerId });
    setShowResurrectionPicker(false);
  };
  
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

  // Réinitialiser les hints quand l'artiste précédent change
  useEffect(() => {
    setHints([]);
    setShowHints(false);
  }, [game.lastArtistName]);

  const loadHints = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/multiplayer/hint/${game.id}`);
      const data = await res.json();
      setHints(data.hints || []);
      setShowHints(true);
    } catch {
      setHints([]);
    }
  };

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

    clearSuggestions();
    setShowSuggestions(false);
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
            {game.settings.teamsEnabled ? (
              activePlayers.length > 0 ? (
                (() => {
                  const winningTeamId = activePlayers[0].teamId;
                  const teamIds = getTeamIds(game.settings.teamCount);
                  const teamIdx = winningTeamId ? teamIds.indexOf(winningTeamId) : -1;
                  const teamMembers = game.players.filter((p) => p.teamId === winningTeamId);
                  return (
                    <div className="winner-section">
                      <p className="winner-text" style={{ color: teamIdx >= 0 ? TEAM_COLORS[teamIdx] : undefined }}>
                        <strong>{teamIdx >= 0 ? TEAM_LABELS[teamIdx] : 'Une équipe'}</strong> a gagné !
                      </p>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {teamMembers.map((m) => m.name).join(', ')}
                      </p>
                    </div>
                  );
                })()
              ) : (
                <p className="winner-text">Toutes les équipes ont été éliminées</p>
              )
            ) : activePlayers.length > 0 ? (
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
                {game.lastArtistName && historyVisible && (
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
                )}

                {game.settings.jokersEnabled && me?.jokerStock && (
                  <div className="joker-action-bar">
                    {JOKER_TYPES.map((type) => {
                      const stock = me.jokerStock?.[type] || 0;
                      if (stock <= 0) return null;
                      const disabled = type === 'resurrection' && resurrectionTargets.length === 0;
                      return (
                        <button
                          key={type}
                          type="button"
                          className={`joker-action-btn ${showResurrectionPicker && type === 'resurrection' ? 'active' : ''}`}
                          onClick={() => handleUseJoker(type)}
                          disabled={disabled}
                          title={JOKER_LABELS[type]}
                        >
                          {JOKER_SHORT[type]} {JOKER_LABELS[type]} ({stock})
                        </button>
                      );
                    })}
                    {showResurrectionPicker && (
                      <div className="joker-target-picker">
                        <p className="joker-target-label">Ressusciter :</p>
                        {resurrectionTargets.length === 0 ? (
                          <p className="joker-target-label">Aucune cible disponible</p>
                        ) : (
                          resurrectionTargets.map((target) => (
                            <button
                              key={target.id}
                              type="button"
                              className="joker-target-btn"
                              onClick={() => handleUseResurrection(target.id)}
                            >
                              {target.name}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
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
          {(() => {
            const renderPlayerItem = (player: typeof game.players[number]) => {
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
                  {game.settings.jokersEnabled && (
                    <div className="joker-slots">
                      {flattenJokerStock(player.jokerStock).map((type, i) => (
                        <span key={i} className="joker-slot" title={JOKER_LABELS[type]}>
                          {JOKER_SHORT[type]}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            };

            if (!game.settings.teamsEnabled) {
              return <div className="players-grid">{game.players.map(renderPlayerItem)}</div>;
            }

            const teamIds = getTeamIds(game.settings.teamCount);
            return (
              <div className="team-groups">
                {teamIds.map((teamId, idx) => {
                  const members = game.players.filter((p) => p.teamId === teamId);
                  if (members.length === 0) return null;
                  const teamActive = members.some((p) => !p.isEliminated);
                  const errorsRemaining = game.teamErrorsRemaining?.[teamId];
                  return (
                    <div key={teamId} className="team-group mt-3">
                      <div className="team-group-header" style={{ color: TEAM_COLORS[idx] }}>
                        {TEAM_LABELS[idx]}
                        {!teamActive && <span className="status-badge status-eliminated" style={{ marginLeft: '0.5rem' }}>Éliminée</span>}
                        {game.settings.eliminationMode === 'erreurs' && errorsRemaining !== undefined && (
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            Erreurs restantes : {errorsRemaining}
                          </span>
                        )}
                      </div>
                      <div className="players-grid">{members.map(renderPlayerItem)}</div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Historique des tours — masqué si settings.hintsEnabled=false, sauf
            réactivation ponctuelle via le joker Archives (pour l'activateur
            uniquement, pendant son tour) */}
        {game.turns.length > 0 && historyVisible && (
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
