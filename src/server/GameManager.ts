import { Server } from 'socket.io';
import { Game, GameStatus, createGame, GameSettings, DEFAULT_GAME_SETTINGS, getTeamIds } from '../types/Game';
import { Player, createPlayer, JokerType } from '../types/Player';
import { GameService } from '../services/GameService';
import { ProposalResult } from '../services/GameService';
import { createTurn } from '../types/Turn';
import { handleGameFinish } from '../services/GameFinishService';
import { gameDataStore } from '../services/GameDataStore';

/**
 * Gestionnaire de parties multijoueurs
 * Stocke les parties en mémoire et gère les connexions
 */
export class GameManager {
  private games: Map<string, Game> = new Map();
  private gameServices: Map<string, GameService> = new Map();
  private playerSockets: Map<string, string> = new Map(); // playerId -> socketId
  private socketPlayers: Map<string, string> = new Map(); // socketId -> playerId
  private gamePlayers: Map<string, Set<string>> = new Map(); // gameId -> Set<playerId>
  private gameCodes: Map<string, string> = new Map(); // gameCode -> gameId
  private usedCodes: Set<string> = new Set(); // Codes déjà utilisés
  private gameTimers: Map<string, NodeJS.Timeout> = new Map(); // gameId -> timeout handle
  private proposalLocks: Map<string, boolean> = new Map(); // gameId -> anti double-soumission
  private disconnectTimers: Map<string, NodeJS.Timeout> = new Map(); // playerId -> retrait différé (lobby)
  private io: Server | null = null; // Instance Socket.IO pour les notifications

  /**
   * Délai de grâce avant de retirer un joueur d'un lobby après déconnexion
   * (rechargement de page, aléa réseau...). Sans ça, toute reconnexion —
   * même un simple F5 — pouvait faire disparaître une partie en attente.
   */
  private static readonly LOBBY_DISCONNECT_GRACE_MS = 15000;

  /**
   * Définit l'instance Socket.IO pour les notifications
   */
  setSocketIO(io: Server): void {
    this.io = io;
  }

  /**
   * Génère un code de partie unique à 6 chiffres
   */
  private generateGameCode(): string {
    let code: string;
    let attempts = 0;
    const maxAttempts = 100;

    do {
      // Générer un code à 6 chiffres (100000 à 999999)
      code = Math.floor(100000 + Math.random() * 900000).toString();
      attempts++;
      
      if (attempts >= maxAttempts) {
        throw new Error('Impossible de générer un code de partie unique');
      }
    } while (this.usedCodes.has(code));

    this.usedCodes.add(code);
    return code;
  }

  /**
   * Crée une nouvelle partie
   */
  createGame(hostPlayerName: string, socketId: string, settings?: Partial<GameSettings>, persistentId?: string): { gameId: string; gameCode: string; player: Player; game: Game } {
    const gameId = `game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const gameCode = this.generateGameCode();
    const finalSettings: GameSettings = { ...DEFAULT_GAME_SETTINGS, ...settings };
    const player = createPlayer(`player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, hostPlayerName || 'Hôte', finalSettings.maxLives, persistentId);

    // Construction manuelle pour permettre la création d'un lobby avec 1 joueur
    const game: Game = {
      id: gameId,
      status: GameStatus.WAITING,
      players: [player],
      turns: [],
      currentPlayerIndex: 0,
      lastArtistName: null,
      usedArtists: [],
      attemptsUsed: 0,
      settings: finalSettings,
      readyPlayerIds: [],
    };
    const gameService = new GameService(
      (gameId: string) => this.handleTurnTimeout(gameId)
    );

    this.games.set(gameId, game);
    this.gameServices.set(gameId, gameService);
    this.gameCodes.set(gameCode, gameId);
    this.playerSockets.set(player.id, socketId);
    this.socketPlayers.set(socketId, player.id);
    
    const playerSet = new Set<string>();
    playerSet.add(player.id);
    this.gamePlayers.set(gameId, playerSet);

    console.log(`Partie créée: ${gameId}, code: ${gameCode}, joueur: ${player.name}`);

    return { gameId, gameCode, player, game };
  }

  /**
   * Trouve une partie par son code
   */
  getGameByCode(gameCode: string): Game | null {
    const gameId = this.gameCodes.get(gameCode);
    if (!gameId) {
      return null;
    }
    const game = this.games.get(gameId);
    return game || null;
  }

  /**
   * Rejoint une partie existante (par code ou ID)
   * @returns { player, game, isReconnection } - isReconnection indique si c'est une reconnexion
   */
  joinGame(gameCodeOrId: string, playerName: string, socketId: string, persistentId?: string): { player: Player; game: Game; isReconnection: boolean } | null {
    console.log(`Recherche de partie avec: ${gameCodeOrId}`);
    console.log(`Codes disponibles: ${Array.from(this.gameCodes.keys()).join(', ')}`);
    
    // Essayer d'abord avec le code
    let game: Game | undefined = undefined;
    let gameId: string | undefined = undefined;
    
    const gameIdFromCode = this.gameCodes.get(gameCodeOrId);
    if (gameIdFromCode) {
      game = this.games.get(gameIdFromCode);
      gameId = gameIdFromCode;
      console.log(`Partie trouvée par code: ${gameCodeOrId} -> ${gameId}`);
    } else {
      // Essayer avec l'ID directement (rétrocompatibilité)
      game = this.games.get(gameCodeOrId);
      if (game) {
        gameId = gameCodeOrId;
        console.log(`Partie trouvée par ID: ${gameCodeOrId}`);
      }
    }
    
    if (!game || !gameId) {
      console.log(`Partie non trouvée pour: ${gameCodeOrId}`);
      return null;
    }

    // Vérifier si le joueur existe déjà dans la partie (reconnexion)
    // Chercher par nom d'abord (pour reconnexion après rafraîchissement)
    const existingPlayerByName = game.players.find((p) => p.name === playerName);
    
    if (existingPlayerByName) {
      // Le joueur existe déjà dans la partie - reconnexion autorisée même si partie en cours
      console.log(`Reconnexion du joueur ${playerName} (${existingPlayerByName.id}) à la partie ${gameId}`);
      // Mettre à jour le socket ID pour ce joueur
      this.playerSockets.set(existingPlayerByName.id, socketId);
      this.socketPlayers.set(socketId, existingPlayerByName.id);
      this.clearDisconnectTimer(existingPlayerByName.id);
      return { player: existingPlayerByName, game, isReconnection: true };
    }

    // Vérifier aussi via socketId (reconnexion rapide)
    const existingPlayerId = this.socketPlayers.get(socketId);
    if (existingPlayerId) {
      const existingPlayer = game.players.find((p) => p.id === existingPlayerId);
      if (existingPlayer) {
        // Mettre à jour le socket ID
        this.playerSockets.set(existingPlayerId, socketId);
        this.clearDisconnectTimer(existingPlayerId);
        return { player: existingPlayer, game, isReconnection: true };
      }
    }

    // Si la partie est en cours, on ne peut pas ajouter de nouveaux joueurs
    if (game.status === GameStatus.IN_PROGRESS) {
      console.log(`Partie en cours, impossible d'ajouter un nouveau joueur: ${playerName}`);
      return null;
    }
    
    console.log(`Partie trouvée et en attente, ajout du joueur: ${playerName}`);

    const player = createPlayer(`player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, playerName, game.settings.maxLives, persistentId);
    const updatedGame = {
      ...game,
      players: [...game.players, player],
    };

    this.games.set(gameId, updatedGame);
    this.playerSockets.set(player.id, socketId);
    this.socketPlayers.set(socketId, player.id);
    
    const playerSet = this.gamePlayers.get(gameId) || new Set();
    playerSet.add(player.id);
    this.gamePlayers.set(gameId, playerSet);

    return { player, game: updatedGame, isReconnection: false };
  }

  /**
   * Démarre une partie
   */
  startGame(gameId: string, playerId: string): Game | null {
    const game = this.games.get(gameId);
    const gameService = this.gameServices.get(gameId);

    if (!game || !gameService) {
      return null;
    }

    // Vérifier que c'est le créateur de la partie qui démarre
    if (game.players[0].id !== playerId) {
      return null;
    }

    if (game.players.length < 2) {
      return null; // Pas assez de joueurs
    }

    let gameToStart = game;
    if (game.settings.teamsEnabled) {
      // Filet de sécurité : assigne une équipe à qui n'en a pas encore (ne
      // touche pas aux assignations déjà faites par l'hôte).
      const players = this.assignTeamsBalanced(game.players, game.settings.teamCount, true);
      const teamErrorsRemaining = game.settings.eliminationMode === 'erreurs'
        ? Object.fromEntries(getTeamIds(game.settings.teamCount).map((t) => [t, game.settings.maxLives]))
        : undefined;
      gameToStart = { ...game, players, teamErrorsRemaining, teamNextMemberIndex: {} };
      this.games.set(gameId, gameToStart);
    }

    if (gameToStart.settings.jokersEnabled) {
      // Aléatoire : tire pour tout le monde. Manuelle : filet de sécurité,
      // ne complète que les sélections incomplètes (préserve les choix faits
      // dans le lobby), même esprit que assignTeamsBalanced(onlyUnassigned).
      const players = gameToStart.players.map((p) => {
        if (gameToStart.settings.jokerSelectionMode === 'aleatoire' || !this.isCompleteJokerSelection(p.jokerStock)) {
          return { ...p, jokerStock: this.randomJokerSelection() };
        }
        return p;
      });
      gameToStart = { ...gameToStart, players };
      this.games.set(gameId, gameToStart);
    }

    const startedGame = gameService.startGame(gameToStart);
    this.games.set(gameId, startedGame);

    // Programmer le timer pour ce tour
    this.scheduleTurnTimer(gameId, startedGame);

    console.log(`Partie démarrée: ${gameId}, currentPlayerIndex: ${startedGame.currentPlayerIndex}, joueur: ${startedGame.players[startedGame.currentPlayerIndex]?.name}`);

    return startedGame;
  }

  /**
   * Met à jour les réglages d'une partie (hôte uniquement, tant que la partie
   * n'a pas démarré). Répercute maxLives sur les joueurs déjà dans le lobby.
   */
  updateSettings(gameId: string, playerId: string, settings: Partial<GameSettings>): Game | null {
    const game = this.games.get(gameId);
    if (!game) return null;
    if (game.status !== GameStatus.WAITING) return null;
    if (game.players[0].id !== playerId) return null; // hôte uniquement

    const updatedSettings: GameSettings = { ...game.settings, ...settings };
    let players = game.players.map(p => ({ ...p, livesRemaining: updatedSettings.maxLives }));

    // Si le nombre d'équipes change, les teamId existants peuvent pointer hors
    // plage — on réassigne tout le monde. Si Teams vient d'être activé, on
    // n'assigne que ceux qui n'ont pas encore d'équipe (préserve les choix
    // déjà faits si l'hôte réactive après avoir désactivé puis réactivé).
    const teamCountChanged = settings.teamCount !== undefined && settings.teamCount !== game.settings.teamCount;
    const teamsJustEnabled = settings.teamsEnabled === true && !game.settings.teamsEnabled;

    if (updatedSettings.teamsEnabled && teamCountChanged) {
      players = this.assignTeamsBalanced(players, updatedSettings.teamCount, false);
    } else if (updatedSettings.teamsEnabled && teamsJustEnabled) {
      players = this.assignTeamsBalanced(players, updatedSettings.teamCount, true);
    }

    const updatedGame: Game = {
      ...game,
      settings: updatedSettings,
      players,
    };

    this.games.set(gameId, updatedGame);
    return updatedGame;
  }

  /**
   * Assigne une équipe à un joueur précis (hôte uniquement, lobby en attente).
   */
  assignTeam(gameId: string, requesterId: string, targetPlayerId: string, teamId: string): Game | null {
    const game = this.games.get(gameId);
    if (!game) return null;
    if (game.status !== GameStatus.WAITING) return null;
    if (game.players[0].id !== requesterId) return null; // hôte uniquement
    if (!game.settings.teamsEnabled) return null;
    if (!getTeamIds(game.settings.teamCount).includes(teamId)) return null;
    if (!game.players.some((p) => p.id === targetPlayerId)) return null;

    const updatedGame: Game = {
      ...game,
      players: game.players.map((p) => (p.id === targetPlayerId ? { ...p, teamId } : p)),
    };

    this.games.set(gameId, updatedGame);
    return updatedGame;
  }

  /**
   * Réassigne tous les joueurs aléatoirement entre les équipes configurées,
   * répartition équilibrée (hôte uniquement, lobby en attente).
   */
  randomizeTeams(gameId: string, requesterId: string): Game | null {
    const game = this.games.get(gameId);
    if (!game) return null;
    if (game.status !== GameStatus.WAITING) return null;
    if (game.players[0].id !== requesterId) return null; // hôte uniquement
    if (!game.settings.teamsEnabled) return null;

    const updatedGame: Game = {
      ...game,
      players: this.assignTeamsBalanced(game.players, game.settings.teamCount, false),
    };

    this.games.set(gameId, updatedGame);
    return updatedGame;
  }

  /**
   * Répartit des joueurs entre les équipes de façon équilibrée (Fisher-Yates
   * puis attribution à l'équipe la moins peuplée). `onlyUnassigned=true` ne
   * touche qu'aux joueurs sans teamId valide (préserve les assignations
   * manuelles déjà faites) ; `false` réassigne tout le monde.
   */
  private assignTeamsBalanced(players: Player[], teamCount: number, onlyUnassigned: boolean): Player[] {
    const teamIds = getTeamIds(teamCount);
    const counts: Record<string, number> = Object.fromEntries(teamIds.map((t) => [t, 0]));
    const result = players.map((p) => ({ ...p }));

    if (onlyUnassigned) {
      for (const p of result) {
        if (p.teamId && teamIds.includes(p.teamId)) counts[p.teamId]++;
      }
    }

    const toAssign = onlyUnassigned
      ? result.filter((p) => !p.teamId || !teamIds.includes(p.teamId))
      : result;

    for (let i = toAssign.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [toAssign[i], toAssign[j]] = [toAssign[j], toAssign[i]];
    }

    for (const p of toAssign) {
      const teamId = teamIds.reduce((min, t) => (counts[t] < counts[min] ? t : min), teamIds[0]);
      p.teamId = teamId;
      counts[teamId]++;
    }

    return result;
  }

  private static readonly JOKER_TYPES: JokerType[] = ['timer', 'skip', 'combo', 'bouclier', 'archives', 'resurrection'];

  /**
   * Tire 3 jokers au hasard (max 2 exemplaires du même type — "2x le même
   * autorisé", pas 3x — voir CLAUDE_3.md §7.2).
   */
  private randomJokerSelection(): Partial<Record<JokerType, number>> {
    const counts: Partial<Record<JokerType, number>> = {};
    for (let i = 0; i < 3; i++) {
      const available = GameManager.JOKER_TYPES.filter((t) => (counts[t] ?? 0) < 2);
      const type = available[Math.floor(Math.random() * available.length)];
      counts[type] = (counts[type] ?? 0) + 1;
    }
    return counts;
  }

  /**
   * Une sélection de jokers valide/complète somme à 3, sans dépasser 2 par type.
   */
  private isCompleteJokerSelection(stock: Partial<Record<JokerType, number>> | undefined): boolean {
    if (!stock) return false;
    const values = Object.values(stock) as number[];
    const sum = values.reduce((a, b) => a + (b || 0), 0);
    return sum === 3 && values.every((v) => (v ?? 0) <= 2);
  }

  /**
   * Enregistre la sélection de jokers d'un joueur (mode manuel, lobby en
   * attente). Chaque joueur gère son propre stock — pas host-only.
   */
  selectJokers(gameId: string, playerId: string, selection: Partial<Record<JokerType, number>>): Game | null {
    const game = this.games.get(gameId);
    if (!game) return null;
    if (game.status !== GameStatus.WAITING) return null;
    if (!game.settings.jokersEnabled || game.settings.jokerSelectionMode !== 'manuelle') return null;
    if (!game.players.some((p) => p.id === playerId)) return null;

    const validTypes = Object.keys(selection).every((k) => GameManager.JOKER_TYPES.includes(k as JokerType));
    if (!validTypes || !this.isCompleteJokerSelection(selection)) return null;

    const updatedGame: Game = {
      ...game,
      players: game.players.map((p) => (p.id === playerId ? { ...p, jokerStock: selection } : p)),
    };

    this.games.set(gameId, updatedGame);
    return updatedGame;
  }

  /**
   * Active un joker pour le joueur courant (délègue à GameService). Reprogramme
   * le timer serveur après coup — Timer/Skip changent currentTurnEndsAt ou le
   * joueur courant, et même sans ça reprogrammer au même timeRemaining est
   * sans effet (même pattern que proposeArtist).
   */
  useJoker(gameId: string, playerId: string, jokerType: JokerType, targetPlayerId?: string): Game | null {
    const game = this.games.get(gameId);
    const gameService = this.gameServices.get(gameId);
    if (!game || !gameService) return null;

    let updatedGame: Game | null;
    switch (jokerType) {
      case 'timer':
        updatedGame = gameService.useTimerJoker(game, playerId);
        break;
      case 'skip':
        updatedGame = gameService.useSkipJoker(game, playerId);
        break;
      case 'bouclier':
        updatedGame = gameService.useBouclierJoker(game, playerId);
        break;
      case 'combo':
        updatedGame = gameService.useComboJoker(game, playerId);
        break;
      case 'archives':
        updatedGame = gameService.useArchivesJoker(game, playerId);
        break;
      case 'resurrection':
        updatedGame = targetPlayerId ? gameService.useResurrectionJoker(game, playerId, targetPlayerId) : null;
        break;
      default:
        return null;
    }

    if (!updatedGame) return null;

    this.games.set(gameId, updatedGame);
    this.maybeProcessGameEnd(game.status, updatedGame);

    if (updatedGame.status === GameStatus.IN_PROGRESS) {
      this.scheduleTurnTimer(gameId, updatedGame);
    } else {
      this.clearTurnTimer(gameId);
    }

    return updatedGame;
  }

  /**
   * Bascule l'état PRÊT d'un joueur non-hôte (tant que la partie n'a pas démarré).
   */
  toggleReady(gameId: string, playerId: string): Game | null {
    const game = this.games.get(gameId);
    if (!game) return null;
    if (game.status !== GameStatus.WAITING) return null;
    if (game.players[0].id === playerId) return null; // l'hôte n'a pas de bouton PRÊT

    const isReady = game.readyPlayerIds.includes(playerId);
    const updatedGame: Game = {
      ...game,
      readyPlayerIds: isReady
        ? game.readyPlayerIds.filter(id => id !== playerId)
        : [...game.readyPlayerIds, playerId],
    };

    this.games.set(gameId, updatedGame);
    return updatedGame;
  }

  /**
   * Programme un timer pour le tour actuel
   */
  private scheduleTurnTimer(gameId: string, game: Game): void {
    // Annuler le timer existant s'il y en a un
    this.clearTurnTimer(gameId);

    if (game.status !== GameStatus.IN_PROGRESS || !game.currentTurnEndsAt) {
      return;
    }

    const now = Date.now();
    const timeRemaining = game.currentTurnEndsAt - now;

    if (timeRemaining <= 0) {
      // Le temps est déjà écoulé, traiter immédiatement
      this.handleTurnTimeout(gameId);
      return;
    }

    // Programmer le timeout
    const timeout = setTimeout(() => {
      this.handleTurnTimeout(gameId);
    }, timeRemaining);

    this.gameTimers.set(gameId, timeout);
  }

  /**
   * Gère l'expiration du timer d'un tour
   */
  private handleTurnTimeout(gameId: string): void {
    const game = this.games.get(gameId);
    const gameService = this.gameServices.get(gameId);

    if (!game || !gameService) {
      return;
    }

    // Vérifier que le tour est toujours en cours et que le temps est écoulé
    if (game.status !== GameStatus.IN_PROGRESS || !gameService.isTurnExpired(game)) {
      return;
    }

    const currentPlayer = game.players[game.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.isEliminated) {
      return;
    }

    console.log(`Timer expiré pour la partie ${gameId}, joueur ${currentPlayer.name}`);

    // Éliminer le joueur et passer au suivant
    const updatedGame = gameService.eliminatePlayer(game, currentPlayer.id, 'TIMEOUT');
    const turn = createTurn(currentPlayer.id, '', false, game.attemptsUsed || 0, undefined, 'TIMEOUT');
    
    const gameWithTurn = {
      ...updatedGame,
      turns: [...updatedGame.turns, turn],
    };

    // Passer au joueur suivant et démarrer son tour
    const nextGame = gameService.moveToNextPlayer(gameWithTurn);
    const finalGame = nextGame.status === GameStatus.IN_PROGRESS 
      ? gameService.startTurn(nextGame)
      : {
          ...nextGame,
          currentTurnEndsAt: undefined,
          attemptsUsed: 0,
        };

    this.games.set(gameId, finalGame);
    this.maybeProcessGameEnd(game.status, finalGame);

    // Notifier tous les clients de la mise à jour de la partie
    if (this.io) {
      const lifeLossMsg = gameService.lifeLossMessage(updatedGame, currentPlayer.id, currentPlayer.name);
      const message = finalGame.status === GameStatus.FINISHED
        ? `Le temps est écoulé. ${lifeLossMsg} La partie est terminée.`
        : `Le temps est écoulé. ${lifeLossMsg}`;

      this.io.to(gameId).emit('game-updated', {
        game: finalGame,
        turn: turn,
        message: message,
        isValid: false,
      });
    }

    // Programmer le timer pour le nouveau tour si la partie continue
    if (finalGame.status === GameStatus.IN_PROGRESS) {
      this.scheduleTurnTimer(gameId, finalGame);
    } else {
      this.clearTurnTimer(gameId);
    }
  }

  /**
   * Annule le timer d'un tour
   */
  private clearTurnTimer(gameId: string): void {
    const timeout = this.gameTimers.get(gameId);
    if (timeout) {
      clearTimeout(timeout);
      this.gameTimers.delete(gameId);
    }
  }

  /**
   * Propose un artiste
   */
  async proposeArtist(
    gameId: string,
    playerId: string,
    artistName: string
  ): Promise<ProposalResult | null> {
    const game = this.games.get(gameId);
    const gameService = this.gameServices.get(gameId);

    if (!game || !gameService) {
      return null;
    }

    // Anti double-soumission : un seul coup traité a la fois pour cette partie
    if (this.proposalLocks.get(gameId)) {
      return null;
    }
    this.proposalLocks.set(gameId, true);

    try {
      const result = await gameService.proposeArtist(game, playerId, artistName);

      // Mettre à jour la partie
      this.games.set(gameId, result.game);
      this.maybeProcessGameEnd(game.status, result.game);

      // Reprogrammer le timer pour le tour suivant (sinon le timeout serveur
      // ne s'applique plus qu'au tour initial de la partie)
      if (result.game.status === GameStatus.IN_PROGRESS) {
        this.scheduleTurnTimer(gameId, result.game);
      } else {
        this.clearTurnTimer(gameId);
      }

      return result;
    } finally {
      this.proposalLocks.delete(gameId);
    }
  }

  /**
   * Traite la fin d'une partie Multijoueur : détermine vainqueur(s) (joueur
   * en classique, équipe complète en mode équipe) et écrit stats/leaderboard/
   * XP pour chaque joueur via handleGameFinish (voir GameFinishService).
   * Appelé côté serveur dès que game.status passe à FINISHED — fire-and-forget
   * (ne bloque jamais la réponse socket du coup qui a terminé la partie).
   */
  private processGameEnd(game: Game): void {
    let winnerIds: Set<string>;

    if (game.settings.teamsEnabled) {
      const activePlayers = game.players.filter((p) => !p.isEliminated);
      const winningTeamId = activePlayers[0]?.teamId;
      winnerIds = new Set(
        winningTeamId
          ? game.players.filter((p) => p.teamId === winningTeamId).map((p) => p.id)
          : []
      );
    } else {
      const activePlayers = game.players.filter((p) => !p.isEliminated);
      winnerIds = new Set(activePlayers.map((p) => p.id));
    }

    // Chaîne partagée par toute la partie — un seul calcul, réutilisé pour
    // chaque joueur (contrairement au Solo, il n'y a pas de "seedArtist" à
    // part : le premier tour de la partie sert d'ouverture). game.turns ne
    // garde que artistName (pas de gameId, cf. types/Turn.ts), d'où la
    // résolution via gameDataStore.resolveArtist — même mécanisme que
    // BotManager pour retrouver l'artiste depuis son nom.
    const encounteredGeniusIds = Array.from(
      new Set(
        game.turns
          .filter((t) => t.isValid)
          .map((t) => gameDataStore.resolveArtist(t.artistName)?.id)
          .filter((id): id is number => typeof id === 'number')
      )
    );

    for (const player of game.players) {
      handleGameFinish({
        playerId: player.persistentId || player.id,
        playerName: player.name,
        score: player.score ?? 0,
        turns: game.usedArtists.length,
        mode: 'Multijoueur',
        multiWin: winnerIds.has(player.id),
        encounteredGeniusIds,
      }).then((result) => {
        // Sans ça, le joueur n'a aucun retour visuel sur l'XP gagnée en
        // Multijoueur (contrairement au Solo) — cf. retour utilisateur.
        if (!this.io) return;
        const socketId = this.playerSockets.get(player.id);
        if (!socketId) return;
        this.io.to(socketId).emit('game-finish-result', {
          gameId: game.id,
          xp: result.xp,
          unlocks: result.unlocks,
          leaderboard: result.leaderboard,
        });
      }).catch((err) => console.error(`Erreur handleGameFinish (Multijoueur) pour ${player.name}:`, err));
    }
  }

  /**
   * Déclenche processGameEnd si la partie vient tout juste de passer à
   * FINISHED (transition détectée par comparaison avant/après), jamais deux
   * fois pour la même partie.
   */
  private maybeProcessGameEnd(previousStatus: GameStatus, updatedGame: Game): void {
    if (previousStatus !== GameStatus.FINISHED && updatedGame.status === GameStatus.FINISHED) {
      this.processGameEnd(updatedGame);
    }
  }

  /**
   * Obtient une partie
   */
  getGame(gameId: string): Game | null {
    return this.games.get(gameId) || null;
  }

  /**
   * Obtient le code d'une partie à partir de son ID
   */
  getGameCode(gameId: string): string | null {
    for (const [code, id] of this.gameCodes.entries()) {
      if (id === gameId) {
        return code;
      }
    }
    return null;
  }

  /**
   * Réinitialise une partie terminée pour recommencer
   * Conserve les joueurs mais réinitialise l'état de jeu
   */
  resetGame(gameId: string, playerId: string): Game | null {
    const game = this.games.get(gameId);
    if (!game) {
      return null;
    }

    // Vérifier que c'est l'hôte qui réinitialise
    if (game.players[0].id !== playerId) {
      return null;
    }

    // Vérifier que la partie est terminée
    if (game.status !== GameStatus.FINISHED) {
      return null;
    }

    // Annuler le timer s'il existe
    this.clearTurnTimer(gameId);

    // Réinitialiser l'état de la partie mais conserver les joueurs
    const resetGame: Game = {
      ...game,
      status: GameStatus.WAITING,
      turns: [],
      currentPlayerIndex: 0,
      lastArtistName: null,
      lastArtist: undefined,
      usedArtists: [],
      currentTurnEndsAt: undefined,
      attemptsUsed: 0,
      readyPlayerIds: [],
      players: game.players.map((player) => ({
        ...player,
        isEliminated: false, // Réactiver tous les joueurs
        livesRemaining: game.settings.maxLives,
        score: 0, // Nouvelle partie = nouveau cumul de score
      })),
    };

    this.games.set(gameId, resetGame);
    console.log(`Partie ${gameId} réinitialisée par ${playerId}`);

    return resetGame;
  }

  /**
   * Obtient le joueur associé à un socket
   */
  getPlayerBySocket(socketId: string): { playerId: string; gameId: string } | null {
    const playerId = this.socketPlayers.get(socketId);
    if (!playerId) {
      return null;
    }

    // Trouver la partie du joueur
    for (const [gameId, playerSet] of this.gamePlayers.entries()) {
      if (playerSet.has(playerId)) {
        return { playerId, gameId };
      }
    }

    return null;
  }

  /**
   * Rejoint une partie en cours avec un playerId (pour reconnexion)
   */
  reconnectToGame(gameCode: string, playerId: string, socketId: string): { player: Player; game: Game } | null {
    const gameId = this.gameCodes.get(gameCode);
    if (!gameId) {
      console.log(`Code de partie non trouvé: ${gameCode}`);
      return null;
    }

    const game = this.games.get(gameId);
    if (!game) {
      console.log(`Partie non trouvée pour le code: ${gameCode}`);
      return null;
    }

    // Chercher le joueur dans la partie
    const player = game.players.find((p) => p.id === playerId);
    if (!player) {
      console.log(`Joueur ${playerId} non trouvé dans la partie ${gameId}`);
      return null;
    }

    // Mettre à jour les mappings socket
    this.playerSockets.set(playerId, socketId);
    this.socketPlayers.set(socketId, playerId);
    this.clearDisconnectTimer(playerId);

    console.log(`Reconnexion réussie: joueur ${player.name} (${playerId}) à la partie ${gameId}`);

    return { player, game };
  }

  /**
   * Gère la déconnexion d'un joueur.
   * Ne retire jamais un joueur d'un lobby en attente immédiatement — un
   * simple rechargement de page produit aussi un événement disconnect, et
   * supprimer la partie sur-le-champ ferait perdre le lobby de l'hôte pour
   * un aléa réseau. On programme le retrait après un délai de grâce
   * (voir scheduleDisconnectRemoval), annulé si le joueur revient à temps.
   */
  handleDisconnect(socketId: string): void {
    const playerId = this.socketPlayers.get(socketId);
    if (!playerId) {
      return;
    }

    this.playerSockets.delete(playerId);
    this.socketPlayers.delete(socketId);

    // Trouver la partie
    for (const [gameId, playerSet] of this.gamePlayers.entries()) {
      if (playerSet.has(playerId)) {
        const game = this.games.get(gameId);
        if (game && game.status === GameStatus.WAITING) {
          this.scheduleDisconnectRemoval(gameId, playerId);
        }
        // Si la partie a commencé, on garde le joueur mais on marque qu'il est déconnecté
        break;
      }
    }
  }

  /**
   * Annule un retrait différé en attente pour ce joueur (appelé dès qu'il
   * se reconnecte, via reconnect-game ou join-game en mode reconnexion).
   */
  private clearDisconnectTimer(playerId: string): void {
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }
  }

  /**
   * Programme le retrait effectif d'un joueur d'un lobby en attente après
   * le délai de grâce, sauf s'il s'est reconnecté entre-temps (un nouveau
   * socket lui aura été réassigné dans playerSockets).
   */
  private scheduleDisconnectRemoval(gameId: string, playerId: string): void {
    this.clearDisconnectTimer(playerId);

    const timer = setTimeout(() => {
      this.disconnectTimers.delete(playerId);

      // Reconnecté entre-temps : ne rien faire
      if (this.playerSockets.has(playerId)) return;

      const game = this.games.get(gameId);
      if (!game || game.status !== GameStatus.WAITING) return;
      if (!game.players.some((p) => p.id === playerId)) return;

      const updatedPlayers = game.players.filter((p) => p.id !== playerId);
      const playerSet = this.gamePlayers.get(gameId);
      if (playerSet) playerSet.delete(playerId);

      if (updatedPlayers.length >= 2) {
        this.games.set(gameId, { ...game, players: updatedPlayers });
      } else {
        // Pas assez de joueurs restants, supprimer la partie (et son code)
        this.deleteGameAndCode(gameId);
      }
    }, GameManager.LOBBY_DISCONNECT_GRACE_MS);

    this.disconnectTimers.set(playerId, timer);
  }

  /**
   * Supprime une partie de tous les registres internes, y compris le
   * mapping code -> gameId (oublié par endroits avant, ce qui laissait des
   * codes "fantômes" pointant vers une partie déjà supprimée).
   */
  private deleteGameAndCode(gameId: string): void {
    this.clearTurnTimer(gameId);
    this.games.delete(gameId);
    this.gameServices.delete(gameId);
    this.gamePlayers.delete(gameId);
    for (const [code, id] of this.gameCodes.entries()) {
      if (id === gameId) {
        this.gameCodes.delete(code);
        break;
      }
    }
  }

  /**
   * Nettoie les parties anciennes (optionnel, pour éviter les fuites mémoire)
   */
  cleanupOldGames(maxAge: number = 3600000): void {
    const now = Date.now();
    for (const [gameId, game] of this.games.entries()) {
      // Si la partie est terminée depuis plus de maxAge
      if (game.status === GameStatus.FINISHED) {
        const gameAge = now - parseInt(gameId.split('-')[1]);
        if (gameAge > maxAge) {
          const playerSet = this.gamePlayers.get(gameId);
          if (playerSet) {
            playerSet.forEach((playerId) => {
              this.playerSockets.delete(playerId);
            });
          }
          this.deleteGameAndCode(gameId);
        }
      }
    }
  }
}
