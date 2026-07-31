import { useState, useEffect } from 'react';
import { socketService } from '../services/socketService';
import { Game, Player, GameSettings, getTeamIds } from '../shared/types';
import '../styles/HomeScreen.css';

const TEAM_LABELS = ['Équipe A', 'Équipe B', 'Équipe C', 'Équipe D'];
const TEAM_COLORS = ['var(--primary)', 'var(--secondary)', 'var(--accent)', 'var(--error)'];

interface MultiplayerHomeScreenProps {
  onGameJoined: (game: Game, player: Player, code?: string) => void;
  onStartSolo?: (playerName: string) => void;
  onStartBot?: (playerName: string) => void;
  onShowLeaderboard?: () => void;
  onShowStats?: () => void;
  onBackToHome?: () => void;
  initialGame?: Game | null;
  initialPlayer?: Player | null;
  initialGameCode?: string | null;
}

export default function MultiplayerHomeScreen({
  onGameJoined,
  onStartSolo,
  onStartBot,
  onShowLeaderboard,
  onShowStats,
  onBackToHome,
  initialGame = null,
  initialPlayer = null,
  initialGameCode = null,
}: MultiplayerHomeScreenProps) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [playerName, setPlayerName] = useState('');
  const [gameCode, setGameCode] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentGame, setCurrentGame] = useState<Game | null>(initialGame);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(initialPlayer);
  const [createdGameCode, setCreatedGameCode] = useState<string | null>(initialGameCode);

  // Auto-remplissage du dernier nom utilisé depuis localStorage
  useEffect(() => {
    const lastPlayerName = localStorage.getItem('lastPlayerName');
    if (lastPlayerName && !playerName) {
      setPlayerName(lastPlayerName);
    }
  }, []);

  // Sauvegarder le nom dans localStorage quand il change
  useEffect(() => {
    if (playerName.trim()) {
      localStorage.setItem('lastPlayerName', playerName.trim());
    }
  }, [playerName]);

  // Mettre à jour l'état local si les props changent
  useEffect(() => {
    if (initialGame) {
      setCurrentGame(initialGame);
    }
    if (initialPlayer) {
      setCurrentPlayer(initialPlayer);
    }
    if (initialGameCode) {
      setCreatedGameCode(initialGameCode);
    }
  }, [initialGame, initialPlayer, initialGameCode]);

  // Demander le code si on a une partie mais pas de code
  useEffect(() => {
    if (currentGame && !createdGameCode) {
      socketService.emit('get-game-code', { gameId: currentGame.id });
    }
  }, [currentGame?.id, createdGameCode]);

  useEffect(() => {
    // Se connecter au serveur
    socketService.connect();

    // Écouter les événements (handlers nommés partout, pour un cleanup .off() qui fonctionne réellement)
    const handleGameCreated = (data: { gameId: string; gameCode: string; player: Player; game: Game }) => {
      setCurrentPlayer(data.player);
      setCurrentGame(data.game);
      setCreatedGameCode(data.gameCode);
      setIsConnecting(false);
      setError(null);
      // Appeler onGameJoined pour que App.tsx ait l'état initial
      // App.tsx affichera MultiplayerGameScreen mais on reste dans le salon d'attente
      // car on vérifie le statut 'waiting' dans le rendu
      onGameJoined(data.game, data.player, data.gameCode);
    };

    const handleGameReconnected = (data: { player: Player; game: Game }) => {
      setCurrentPlayer(data.player);
      setCurrentGame(data.game);
      setIsConnecting(false);
      setError(null);
      // Récupérer le code depuis localStorage
      const storedCode = localStorage.getItem('roland-gamos-game-code');
      if (storedCode) {
        setCreatedGameCode(storedCode);
      }
      onGameJoined(data.game, data.player, storedCode || undefined);
    };

    const handleGameReset = (data: { game: Game; gameCode: string }) => {
      // Logs réduits pour éviter la pollution de la console
      setCurrentGame(data.game);
      if (data.gameCode) {
        setCreatedGameCode(data.gameCode);
      } else {
        console.warn('gameCode manquant dans game-reset');
      }
      // Mettre à jour le joueur actuel dans la partie réinitialisée
      setCurrentPlayer((prevPlayer) => {
        if (prevPlayer) {
          const updatedPlayer = data.game.players.find(p => p.id === prevPlayer.id);
          if (updatedPlayer) {
            onGameJoined(data.game, updatedPlayer, data.gameCode);
            return updatedPlayer;
          }
        }
        // Si le joueur n'est pas trouvé, utiliser le premier joueur
        if (data.game.players.length > 0) {
          onGameJoined(data.game, data.game.players[0], data.gameCode);
          return data.game.players[0];
        }
        return prevPlayer;
      });
    };

    const handleGameCode = (data: { gameId: string; gameCode: string }) => {
      setCurrentGame((prevGame) => {
        if (prevGame && data.gameId === prevGame.id) {
          setCreatedGameCode(data.gameCode);
        }
        return prevGame;
      });
    };

    const handleGameState = (data: { game: Game; gameCode?: string }) => {
      setCurrentGame((prevGame) => {
        if (prevGame && data.game.id === prevGame.id) {
          if (data.gameCode) {
            setCreatedGameCode(data.gameCode);
          }
          return data.game;
        }
        return prevGame;
      });
    };

    const handleGameJoined = (data: { player: Player; game: Game }) => {
      setCurrentPlayer(data.player);
      setCurrentGame(data.game);
      setIsConnecting(false);
      setError(null);
      onGameJoined(data.game, data.player);
    };

    const handlePlayerJoined = (data: { player: Player; game: Game }) => {
      // Logs réduits
      setCurrentGame(data.game);
      // Mettre à jour aussi le joueur actuel si nécessaire
      setCurrentPlayer((prevPlayer) => {
        if (prevPlayer) {
          const updatedPlayer = data.game.players.find(p => p.id === prevPlayer.id);
          if (updatedPlayer) {
            return updatedPlayer;
          }
        }
        return prevPlayer;
      });
      // Notifier App.tsx de la mise à jour
      if (currentGame && data.game.id === currentGame.id) {
        const updatedPlayer = data.game.players.find(p => p.id === currentPlayer?.id);
        if (updatedPlayer) {
          onGameJoined(data.game, updatedPlayer, createdGameCode || undefined);
        }
      }
    };

    const handleGameStarted = (data: { game: Game }) => {
      setCurrentGame(data.game);
      // Utiliser une fonction de mise à jour pour avoir accès à la valeur actuelle
      setCurrentPlayer((prevPlayer) => {
        if (prevPlayer) {
          // Trouver le joueur mis à jour dans la nouvelle partie
          const updatedPlayer = data.game.players.find(p => p.id === prevPlayer.id);
          if (updatedPlayer) {
            // Notifier App.tsx que la partie a démarré pour passer à l'écran de jeu
            onGameJoined(data.game, updatedPlayer);
            return updatedPlayer;
          } else {
            // Si le joueur n'est pas trouvé, utiliser le premier joueur de la partie
            console.warn('Joueur non trouvé dans la partie démarrée, utilisation du premier joueur');
            if (data.game.players.length > 0) {
              onGameJoined(data.game, data.game.players[0]);
              return data.game.players[0];
            }
          }
        }
        return prevPlayer;
      });
    };

    const handleGameUpdated = (data: { game: Game }) => {
      setCurrentGame(data.game);
    };

    const handleError = (data: { message: string }) => {
      setError(data.message);
      setIsConnecting(false);
    };

    socketService.on('game-created', handleGameCreated);
    socketService.on('game-reconnected', handleGameReconnected);
    socketService.on('game-reset', handleGameReset);
    socketService.on('game-code', handleGameCode);
    socketService.on('game-state', handleGameState);
    socketService.on('game-joined', handleGameJoined);
    socketService.on('player-joined', handlePlayerJoined);
    socketService.on('game-started', handleGameStarted);
    socketService.on('game-updated', handleGameUpdated);
    socketService.on('error', handleError);

    return () => {
      socketService.off('game-created', handleGameCreated);
      socketService.off('game-reconnected', handleGameReconnected);
      socketService.off('game-reset', handleGameReset);
      socketService.off('game-code', handleGameCode);
      socketService.off('game-state', handleGameState);
      socketService.off('game-joined', handleGameJoined);
      socketService.off('player-joined', handlePlayerJoined);
      socketService.off('game-started', handleGameStarted);
      socketService.off('game-updated', handleGameUpdated);
      socketService.off('error', handleError);
    };
  }, [onGameJoined]);

  const handleCreateGame = () => {
    if (!playerName.trim()) {
      setError('Veuillez entrer votre nom');
      return;
    }

    setIsConnecting(true);
    setError(null);
    socketService.emit('create-game', { playerName: playerName.trim() });
  };

  const handleJoinGame = () => {
    if (!playerName.trim()) {
      setError('Veuillez entrer votre nom');
      return;
    }

    if (!gameCode.trim()) {
      setError('Veuillez entrer un code de partie');
      return;
    }

    // Vérifier que le code est composé uniquement de chiffres et fait 6 caractères
    const code = gameCode.trim().replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) {
      setError('Le code doit être composé de 6 chiffres');
      return;
    }

    setIsConnecting(true);
    setError(null);
    socketService.emit('join-game', {
      gameCode: code,
      playerName: playerName.trim(),
    });
  };

  const handleStartGame = () => {
    if (!currentGame || !currentPlayer) return;

    if (currentGame.players.length < 2) {
      setError('Ajoutez au moins un autre joueur avant de démarrer.');
      return;
    }

    socketService.emit('start-game', { gameId: currentGame.id });
  };

  const handleUpdateSetting = (settings: Partial<GameSettings>) => {
    if (!currentGame) return;
    socketService.emit('update-game-settings', { gameId: currentGame.id, settings });
  };

  const handleToggleReady = () => {
    if (!currentGame) return;
    socketService.emit('toggle-ready', { gameId: currentGame.id });
  };

  const handleAssignTeam = (targetPlayerId: string, teamId: string) => {
    if (!currentGame) return;
    socketService.emit('assign-team', { gameId: currentGame.id, targetPlayerId, teamId });
  };

  const handleRandomizeTeams = () => {
    if (!currentGame) return;
    socketService.emit('randomize-teams', { gameId: currentGame.id });
  };

  // Si une partie est créée/rejointe mais pas encore démarrée
  if (currentGame && currentPlayer && currentGame.status === 'waiting') {
    const isHost = currentGame.players[0].id === currentPlayer.id;
    const canStart = currentGame.players.length >= 2 && isHost;

    return (
      <div className="home-screen">
        <div className="container">
          <div className="card fade-in">
            <h2 className="card-title">
              {isHost ? '🎮 Votre partie' : '⏳ En attente'}
            </h2>
            <p className="card-description">
              Code de la partie: <strong className="game-code-display">{createdGameCode || '...'}</strong>
            </p>

            <div className="waiting-section mt-3">
              <h3 className="waiting-title">Joueurs ({currentGame.players.length})</h3>
              <div className="players-waiting-list">
                {(() => {
                  const teamsEnabled = currentGame.settings.teamsEnabled;
                  const teamIds = teamsEnabled ? getTeamIds(currentGame.settings.teamCount) : [];

                  const renderPlayerRow = (player: Player) => {
                    const isPlayerHost = player.id === currentGame.players[0].id;
                    const isReady = currentGame.readyPlayerIds.includes(player.id);
                    return (
                      <div
                        key={player.id}
                        className={`player-waiting-item ${
                          player.id === currentPlayer.id ? 'player-you' : ''
                        }`}
                      >
                        <span className="player-waiting-name">{player.name}</span>
                        {player.id === currentPlayer.id && (
                          <span className="player-you-badge">Vous</span>
                        )}
                        {isHost && teamsEnabled && (
                          <div className="team-assign-buttons">
                            {teamIds.map((teamId, idx) => (
                              <button
                                key={teamId}
                                type="button"
                                className={`team-assign-btn ${player.teamId === teamId ? 'active' : ''}`}
                                style={{ borderColor: TEAM_COLORS[idx], color: player.teamId === teamId ? '#fff' : TEAM_COLORS[idx], background: player.teamId === teamId ? TEAM_COLORS[idx] : 'transparent' }}
                                onClick={() => handleAssignTeam(player.id, teamId)}
                                title={TEAM_LABELS[idx]}
                              >
                                {TEAM_LABELS[idx].slice(-1)}
                              </button>
                            ))}
                          </div>
                        )}
                        {isPlayerHost ? (
                          <span className="player-host-badge">Hôte</span>
                        ) : (
                          <span className={`player-ready-badge ${isReady ? 'is-ready' : 'is-waiting'}`}>
                            {isReady ? 'Prêt' : '...'}
                          </span>
                        )}
                      </div>
                    );
                  };

                  if (!teamsEnabled) {
                    return currentGame.players.map((player) => renderPlayerRow(player));
                  }

                  const unassigned = currentGame.players.filter(
                    (p) => !p.teamId || !teamIds.includes(p.teamId)
                  );

                  return (
                    <>
                      {teamIds.map((teamId, idx) => {
                        const members = currentGame.players.filter((p) => p.teamId === teamId);
                        return (
                          <div key={teamId} className="team-group">
                            <div className="team-group-header" style={{ color: TEAM_COLORS[idx] }}>
                              {TEAM_LABELS[idx]} ({members.length})
                            </div>
                            {members.map((player) => renderPlayerRow(player))}
                          </div>
                        );
                      })}
                      {unassigned.length > 0 && (
                        <div className="team-group">
                          <div className="team-group-header" style={{ color: 'var(--text-muted)' }}>
                            Non assignés ({unassigned.length})
                          </div>
                          {unassigned.map((player) => renderPlayerRow(player))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="settings-section mt-3">
                <h3 className="waiting-title">
                  {isHost ? 'Paramètres — Hôte uniquement' : 'Paramètres de la partie'}
                </h3>
                <div className="settings-row">
                  <span className="settings-label">Temps par tour</span>
                  {isHost ? (
                    <div className="mode-selector settings-choice">
                      {[15000, 30000, 60000].map((ms) => (
                        <button
                          key={ms}
                          type="button"
                          className={`mode-btn ${currentGame.settings.turnDurationMs === ms ? 'active' : ''}`}
                          onClick={() => handleUpdateSetting({ turnDurationMs: ms })}
                        >
                          {ms / 1000}s
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="settings-value">{currentGame.settings.turnDurationMs / 1000}s</span>
                  )}
                </div>
                <div className="settings-row">
                  <span className="settings-label">Vies</span>
                  {isHost ? (
                    <div className="mode-selector settings-choice">
                      {[1, 2, 3].map((lives) => (
                        <button
                          key={lives}
                          type="button"
                          className={`mode-btn ${currentGame.settings.maxLives === lives ? 'active' : ''}`}
                          onClick={() => handleUpdateSetting({ maxLives: lives })}
                        >
                          {lives}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="settings-value">{currentGame.settings.maxLives}</span>
                  )}
                </div>
                <div className="settings-row">
                  <span className="settings-label">Jokers</span>
                  {isHost ? (
                    <div className="mode-selector settings-choice">
                      <button
                        type="button"
                        className={`mode-btn ${!currentGame.settings.jokersEnabled ? 'active' : ''}`}
                        onClick={() => handleUpdateSetting({ jokersEnabled: false })}
                      >
                        Off
                      </button>
                      <button
                        type="button"
                        className={`mode-btn ${currentGame.settings.jokersEnabled ? 'active' : ''}`}
                        onClick={() => handleUpdateSetting({ jokersEnabled: true })}
                      >
                        On
                      </button>
                    </div>
                  ) : (
                    <span className="settings-value">{currentGame.settings.jokersEnabled ? 'On' : 'Off'}</span>
                  )}
                </div>
                <div className="settings-row">
                  <span className="settings-label">Teams</span>
                  {isHost ? (
                    <div className="mode-selector settings-choice">
                      <button
                        type="button"
                        className={`mode-btn ${!currentGame.settings.teamsEnabled ? 'active' : ''}`}
                        onClick={() => handleUpdateSetting({ teamsEnabled: false })}
                      >
                        Off
                      </button>
                      <button
                        type="button"
                        className={`mode-btn ${currentGame.settings.teamsEnabled ? 'active' : ''}`}
                        onClick={() => handleUpdateSetting({ teamsEnabled: true })}
                      >
                        On
                      </button>
                    </div>
                  ) : (
                    <span className="settings-value">{currentGame.settings.teamsEnabled ? 'On' : 'Off'}</span>
                  )}
                </div>
                {currentGame.settings.teamsEnabled && (
                  <>
                    <div className="settings-row">
                      <span className="settings-label">Nombre d'équipes</span>
                      {isHost ? (
                        <div className="mode-selector settings-choice">
                          {[2, 3, 4].map((count) => (
                            <button
                              key={count}
                              type="button"
                              className={`mode-btn ${currentGame.settings.teamCount === count ? 'active' : ''}`}
                              onClick={() => handleUpdateSetting({ teamCount: count })}
                            >
                              {count}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="settings-value">{currentGame.settings.teamCount}</span>
                      )}
                    </div>
                    <div className="settings-row">
                      <span className="settings-label">Élimination</span>
                      {isHost ? (
                        <div className="mode-selector settings-choice">
                          <button
                            type="button"
                            className={`mode-btn ${currentGame.settings.eliminationMode === 'vies' ? 'active' : ''}`}
                            onClick={() => handleUpdateSetting({ eliminationMode: 'vies' })}
                          >
                            Vies
                          </button>
                          <button
                            type="button"
                            className={`mode-btn ${currentGame.settings.eliminationMode === 'erreurs' ? 'active' : ''}`}
                            onClick={() => handleUpdateSetting({ eliminationMode: 'erreurs' })}
                          >
                            Erreurs
                          </button>
                        </div>
                      ) : (
                        <span className="settings-value">
                          {currentGame.settings.eliminationMode === 'erreurs' ? 'Erreurs' : 'Vies'}
                        </span>
                      )}
                    </div>
                    {isHost && (
                      <button
                        type="button"
                        className="btn btn-secondary w-full mt-2"
                        onClick={handleRandomizeTeams}
                      >
                        🎲 Assignation aléatoire
                      </button>
                    )}
                  </>
                )}
              </div>

              {isHost && (
                <div className="waiting-actions mt-3">
                  {!canStart && (
                    <p className="waiting-hint">
                      En attente d'au moins un autre joueur...
                    </p>
                  )}
                  <button
                    className="btn btn-primary w-full mt-2"
                    onClick={handleStartGame}
                    disabled={!canStart}
                  >
                    Démarrer la partie ({currentGame.players.length} joueurs)
                  </button>
                </div>
              )}

              {!isHost && (
                <div className="waiting-actions mt-3">
                  <button
                    className={`btn w-full ${currentGame.readyPlayerIds.includes(currentPlayer.id) ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={handleToggleReady}
                    type="button"
                  >
                    {currentGame.readyPlayerIds.includes(currentPlayer.id) ? '✓ Prêt' : 'Prêt ?'}
                  </button>
                  <p className="waiting-hint mt-2">
                    En attente que l'hôte démarre la partie...
                  </p>
                </div>
              )}

              {/* Bouton Accueil */}
              {onBackToHome && (
                <div className="mt-3">
                  <button
                    className="btn btn-secondary w-full"
                    onClick={() => {
                      // Quitter la partie et revenir à l'accueil
                      setCurrentGame(null);
                      setCurrentPlayer(null);
                      setCreatedGameCode(null);
                      onBackToHome();
                    }}
                  >
                    🏠 Retour à l'accueil
                  </button>
                </div>
              )}

              <div className="share-section mt-3">
                <p className="share-label">Partager le code de la partie :</p>
                <div className="share-input-row">
                  <input
                    type="text"
                    className="input share-input game-code-input"
                    value={createdGameCode || ''}
                    readOnly
                    maxLength={6}
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      if (createdGameCode) {
                        navigator.clipboard.writeText(createdGameCode);
                      }
                    }}
                  >
                    📋 Copier
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="home-screen">
      <div className="container">
        <div className="home-header fade-in">
          <h1 className="title">🎤 Roland Gamos</h1>
          <p className="subtitle">Jeu multijoueur en temps réel</p>
        </div>

        <div className="card fade-in">
          <div className="mode-selector">
            <button
              className={`mode-btn ${mode === 'create' ? 'active' : ''}`}
              onClick={() => setMode('create')}
            >
              Créer une partie
            </button>
            <button
              className={`mode-btn ${mode === 'join' ? 'active' : ''}`}
              onClick={() => setMode('join')}
            >
              Rejoindre une partie
            </button>
          </div>

          {error && (
            <div className="error-box mt-2">
              <p className="error-text">{error}</p>
            </div>
          )}

          <div className="form-section mt-3">
            <label className="form-label">Votre nom</label>
            <input
              type="text"
              className="input"
              placeholder="Entrez votre nom"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={20}
              disabled={isConnecting}
            />

            {mode === 'join' && (
              <>
                <label className="form-label mt-2">Code de la partie (6 chiffres)</label>
                <input
                  type="text"
                  className="input game-code-input"
                  placeholder="000000"
                  value={gameCode}
                  onChange={(e) => {
                    // Ne permettre que les chiffres et limiter à 6 caractères
                    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setGameCode(value);
                  }}
                  disabled={isConnecting}
                  maxLength={6}
                  pattern="[0-9]{6}"
                  inputMode="numeric"
                />
                <p className="form-hint">Entrez le code à 6 chiffres de la partie</p>
              </>
            )}

            <button
              className="btn btn-primary w-full mt-3"
              onClick={mode === 'create' ? handleCreateGame : handleJoinGame}
              disabled={isConnecting || !playerName.trim()}
            >
              {isConnecting
                ? 'Connexion...'
                : mode === 'create'
                ? 'Créer la partie'
                : 'Rejoindre la partie'}
            </button>

            {(onStartSolo || onStartBot) && (
              <div className="solo-section mt-4">
                <div className="divider">
                  <span>OU</span>
                </div>
                {onStartSolo && (
                  <button
                    className="btn btn-secondary w-full mt-3"
                    onClick={(e) => {
                      e.preventDefault();
                      const trimmedName = playerName.trim();
                      if (trimmedName) {
                        onStartSolo(trimmedName);
                      }
                    }}
                    disabled={!playerName.trim() || isConnecting}
                    type="button"
                  >
                    Solo Infini
                  </button>
                )}
                {onStartBot && (
                  <button
                    className="btn btn-secondary w-full mt-2"
                    onClick={(e) => {
                      e.preventDefault();
                      const trimmedName = playerName.trim();
                      if (trimmedName) {
                        onStartBot(trimmedName);
                      }
                    }}
                    disabled={!playerName.trim() || isConnecting}
                    type="button"
                  >
                    Solo vs Bot
                  </button>
                )}
                <p className="form-hint mt-2">
                  Jouez en solo ou affrontez le bot !
                </p>
                {!playerName.trim() && (
                  <p className="form-hint mt-1" style={{ color: '#ff6b6b', fontSize: '0.85rem', fontWeight: '600' }}>
                    Entrez votre nom ci-dessus pour activer les modes solo
                  </p>
                )}
              </div>
            )}

            {(onShowLeaderboard || onShowStats) && (
              <div className="mt-4" style={{ display: 'flex', gap: '0.5rem' }}>
                {onShowLeaderboard && (
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    onClick={onShowLeaderboard}
                    type="button"
                  >
                    Classement
                  </button>
                )}
                {onShowStats && (
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    onClick={onShowStats}
                    type="button"
                  >
                    Statistiques
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="rules-card card fade-in">
          <h3 className="rules-title">📋 Règles du jeu</h3>
          <ul className="rules-list">
            <li>Les joueurs jouent à tour de rôle</li>
            <li>Le premier joueur propose n'importe quel artiste</li>
            <li>
              Les joueurs suivants doivent proposer un artiste ayant collaboré
              avec l'artiste précédent
            </li>
            <li>Un artiste ne peut être proposé qu'une seule fois</li>
            <li>
              Si la proposition est invalide, le joueur est éliminé
            </li>
            <li>Le dernier joueur actif gagne !</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
