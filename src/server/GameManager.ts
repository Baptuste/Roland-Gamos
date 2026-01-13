import { Game, GameStatus, createGame } from '../types/Game';
import { Player, createPlayer } from '../types/Player';
import { GameService } from '../services/GameService';
import { ProposalResult } from '../services/GameService';
import { createTurn } from '../types/Turn';

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
  createGame(hostPlayerName: string, socketId: string): { gameId: string; gameCode: string; player: Player; game: Game } {
    const gameId = `game-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const gameCode = this.generateGameCode();
    const player = createPlayer(`player-${Date.now()}`, hostPlayerName || 'Hôte');
    
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
    };
    const gameService = new GameService(
      undefined,
      undefined,
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
  joinGame(gameCodeOrId: string, playerName: string, socketId: string): { player: Player; game: Game; isReconnection: boolean } | null {
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
      return { player: existingPlayerByName, game, isReconnection: true };
    }

    // Vérifier aussi via socketId (reconnexion rapide)
    const existingPlayerId = this.socketPlayers.get(socketId);
    if (existingPlayerId) {
      const existingPlayer = game.players.find((p) => p.id === existingPlayerId);
      if (existingPlayer) {
        // Mettre à jour le socket ID
        this.playerSockets.set(existingPlayerId, socketId);
        return { player: existingPlayer, game, isReconnection: true };
      }
    }

    // Si la partie est en cours, on ne peut pas ajouter de nouveaux joueurs
    if (game.status === GameStatus.IN_PROGRESS) {
      console.log(`Partie en cours, impossible d'ajouter un nouveau joueur: ${playerName}`);
      return null;
    }
    
    console.log(`Partie trouvée et en attente, ajout du joueur: ${playerName}`);

    const player = createPlayer(`player-${Date.now()}`, playerName);
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

    const startedGame = gameService.startGame(game);
    this.games.set(gameId, startedGame);

    // Programmer le timer pour ce tour
    this.scheduleTurnTimer(gameId, startedGame);

    console.log(`Partie démarrée: ${gameId}, currentPlayerIndex: ${startedGame.currentPlayerIndex}, joueur: ${startedGame.players[startedGame.currentPlayerIndex]?.name}`);

    return startedGame;
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

    const result = await gameService.proposeArtist(game, playerId, artistName);
    
    // Mettre à jour la partie
    this.games.set(gameId, result.game);

    return result;
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
      players: game.players.map((player) => ({
        ...player,
        isEliminated: false, // Réactiver tous les joueurs
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

    console.log(`Reconnexion réussie: joueur ${player.name} (${playerId}) à la partie ${gameId}`);

    return { player, game };
  }

  /**
   * Gère la déconnexion d'un joueur
   */
  handleDisconnect(socketId: string): void {
    const playerId = this.socketPlayers.get(socketId);
    if (!playerId) {
      return;
    }

    // Trouver la partie
    for (const [gameId, playerSet] of this.gamePlayers.entries()) {
      if (playerSet.has(playerId)) {
        const game = this.games.get(gameId);
        if (game && game.status === GameStatus.WAITING) {
          // Si la partie n'a pas commencé, retirer le joueur
          const updatedPlayers = game.players.filter((p) => p.id !== playerId);
          if (updatedPlayers.length >= 2) {
            this.games.set(gameId, { ...game, players: updatedPlayers });
          } else {
            // Pas assez de joueurs, supprimer la partie
            this.games.delete(gameId);
            this.gameServices.delete(gameId);
          }
          playerSet.delete(playerId);
        }
        // Si la partie a commencé, on garde le joueur mais on marque qu'il est déconnecté
        break;
      }
    }

    this.playerSockets.delete(playerId);
    this.socketPlayers.delete(socketId);
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
          this.clearTurnTimer(gameId);
          this.games.delete(gameId);
          this.gameServices.delete(gameId);
          const playerSet = this.gamePlayers.get(gameId);
          if (playerSet) {
            playerSet.forEach((playerId) => {
              this.playerSockets.delete(playerId);
            });
            this.gamePlayers.delete(gameId);
          }
        }
      }
    }
  }
}
