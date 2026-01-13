import { Game, GameStatus, createGame, CanonicalArtist } from '../types/Game';
import { Player } from '../types/Player';
import { Turn, createTurn, InvalidReason } from '../types/Turn';
import { ValidationService, ValidationResult } from './ValidationService';
import { MusicBrainzService } from './MusicBrainzService';
import { WikidataService } from './WikidataService';

/**
 * Durée d'un tour en millisecondes (30 secondes)
 */
const TURN_DURATION_MS = 30000;

/**
 * Nombre maximum de tentatives par tour
 */
const MAX_ATTEMPTS_PER_TURN = 2;

/**
 * Résultat d'une proposition d'artiste
 */
export interface ProposalResult {
  isValid: boolean;
  turn: Turn;
  game: Game;
  message: string;
}

/**
 * Service principal pour gérer les parties
 * Applique les règles : timer (30s), attempts (max 2), repeat (hard fail), single-circular (invalid + retry)
 */
export class GameService {
  private validationService: ValidationService;
  private onTurnTimeout?: (gameId: string) => void;

  constructor(
    musicBrainzService?: MusicBrainzService,
    wikidataService?: WikidataService,
    onTurnTimeout?: (gameId: string) => void
  ) {
    this.validationService = new ValidationService(musicBrainzService, wikidataService);
    this.onTurnTimeout = onTurnTimeout;
  }

  /**
   * Démarre une partie
   */
  startGame(game: Game): Game {
    if (game.status !== GameStatus.WAITING) {
      throw new Error('La partie ne peut être démarrée que si elle est en attente');
    }

    if (game.players.length < 2) {
      throw new Error('Une partie nécessite au moins 2 joueurs');
    }

    // Trouver le premier joueur non éliminé
    let firstPlayerIndex = 0;
    for (let i = 0; i < game.players.length; i++) {
      if (!game.players[i].isEliminated) {
        firstPlayerIndex = i;
        break;
      }
    }

    const startedGame = {
      ...game,
      status: GameStatus.IN_PROGRESS,
      currentPlayerIndex: firstPlayerIndex,
      usedArtists: game.usedArtists || [],
      attemptsUsed: 0,
    };

    // Démarrer le premier tour
    return this.startTurn(startedGame);
  }

  /**
   * Démarre un nouveau tour pour le joueur actuel
   * Initialise le timer (30s) et remet les tentatives à 0
   */
  startTurn(game: Game): Game {
    const currentPlayer = game.players[game.currentPlayerIndex];
    
    if (!currentPlayer || currentPlayer.isEliminated) {
      // Si le joueur actuel est éliminé, passer au suivant
      return this.moveToNextPlayer(game);
    }

    const now = Date.now();
    return {
      ...game,
      currentTurnEndsAt: now + TURN_DURATION_MS,
      attemptsUsed: 0,
    };
  }

  /**
   * Vérifie si le temps du tour actuel est écoulé
   */
  isTurnExpired(game: Game): boolean {
    if (!game.currentTurnEndsAt) {
      return false;
    }
    return Date.now() >= game.currentTurnEndsAt;
  }

  /**
   * Obtient l'identifiant canonique pour le stockage (MBID prioritaire, sinon nom)
   */
  private getCanonicalId(canonical: CanonicalArtist): string {
    return canonical.mbid || canonical.name.toLowerCase().trim();
  }

  /**
   * Vérifie si un artiste a déjà été utilisé (règle REPEAT)
   */
  private isArtistUsed(game: Game, canonical: CanonicalArtist): boolean {
    const canonicalId = this.getCanonicalId(canonical);
    return game.usedArtists.some(used => 
      used.toLowerCase() === canonicalId.toLowerCase()
    );
  }

  /**
   * Propose un artiste pour le tour actuel
   * Applique toutes les règles : timer, attempts, repeat, single-circular, validation
   */
  async proposeArtist(
    game: Game,
    playerId: string,
    artistName: string
  ): Promise<ProposalResult> {
    // 1) Vérifier que la partie est en cours
    if (game.status !== GameStatus.IN_PROGRESS) {
      return {
        isValid: false,
        turn: createTurn(playerId, artistName, false, undefined, undefined, 'OTHER'),
        game,
        message: 'La partie n\'est pas en cours',
      };
    }

    // 2) Vérifier que c'est le tour du bon joueur
    const currentPlayer = game.players[game.currentPlayerIndex];
    if (currentPlayer.id !== playerId) {
      return {
        isValid: false,
        turn: createTurn(playerId, artistName, false, undefined, undefined, 'OTHER'),
        game,
        message: `Ce n'est pas le tour de ${currentPlayer.name}`,
      };
    }

    // 3) Vérifier que le joueur n'est pas éliminé
    if (currentPlayer.isEliminated) {
      return {
        isValid: false,
        turn: createTurn(playerId, artistName, false, undefined, undefined, 'OTHER'),
        game,
        message: 'Le joueur est éliminé',
      };
    }

    // 4) Vérifier le timer (TIMEOUT)
    if (this.isTurnExpired(game)) {
      const updatedGame = this.eliminatePlayer(game, playerId, 'TIMEOUT');
      const turn = createTurn(playerId, artistName, false, game.attemptsUsed || 0, undefined, 'TIMEOUT');
      
      return {
        isValid: false,
        turn,
        game: {
          ...updatedGame,
          turns: [...updatedGame.turns, turn],
        },
        message: `Temps écoulé. ${currentPlayer.name} est éliminé.`,
      };
    }

    // 5) Vérifier le nombre de tentatives
    const attemptsUsed = (game.attemptsUsed || 0) + 1;
    if (attemptsUsed > MAX_ATTEMPTS_PER_TURN) {
      const updatedGame = this.eliminatePlayer(game, playerId, 'OTHER');
      const turn = createTurn(playerId, artistName, false, attemptsUsed, undefined, 'OTHER');
      
      return {
        isValid: false,
        turn,
        game: {
          ...updatedGame,
          turns: [...updatedGame.turns, turn],
        },
        message: `Nombre maximum de tentatives atteint. ${currentPlayer.name} est éliminé.`,
      };
    }

    // 6) Normaliser le nom de l'artiste
    const normalizedArtistName = artistName.trim();

    // 7) Valider le mouvement via ValidationService
    const previousArtist = game.lastArtist || (game.lastArtistName ? { name: game.lastArtistName } : null);
    const validation = await this.validationService.validateMove(previousArtist, normalizedArtistName);

    // 8) Règle REPEAT (HARD FAIL - élimination immédiate, pas de retry)
    if (validation.exists) {
      const canonicalId = this.getCanonicalId(validation.canonical);
      if (this.isArtistUsed(game, validation.canonical)) {
        const updatedGame = this.eliminatePlayer(game, playerId, 'REPEAT');
        const turn = createTurn(playerId, normalizedArtistName, false, attemptsUsed, undefined, 'REPEAT');
        
        return {
          isValid: false,
          turn,
          game: {
            ...updatedGame,
            turns: [...updatedGame.turns, turn],
          },
          message: `L'artiste "${validation.canonical.name}" a déjà été utilisé. ${currentPlayer.name} est éliminé.`,
        };
      }
    }

    // 9) Vérifier l'existence de l'artiste
    if (!validation.exists) {
      const updatedGame = {
        ...game,
        attemptsUsed,
      };
      const turn = createTurn(playerId, normalizedArtistName, false, attemptsUsed, undefined, 'NOT_FOUND');
      
      // Si c'était la dernière tentative, éliminer
      if (attemptsUsed >= MAX_ATTEMPTS_PER_TURN) {
        const eliminatedGame = this.eliminatePlayer(updatedGame, playerId, 'NOT_FOUND');
        return {
          isValid: false,
          turn,
          game: {
            ...eliminatedGame,
            turns: [...eliminatedGame.turns, turn],
          },
          message: `Artiste "${normalizedArtistName}" non trouvé. ${currentPlayer.name} est éliminé (tentative ${attemptsUsed}/${MAX_ATTEMPTS_PER_TURN}).`,
        };
      }
      
      return {
        isValid: false,
        turn,
        game: {
          ...updatedGame,
          turns: [...updatedGame.turns, turn],
        },
        message: `Artiste "${normalizedArtistName}" non trouvé. Tentative ${attemptsUsed}/${MAX_ATTEMPTS_PER_TURN}.`,
      };
    }

    // 10) Vérifier la relation (collaboration)
    if (!validation.validRelation) {
      const updatedGame = {
        ...game,
        attemptsUsed,
      };
      const turn = createTurn(playerId, normalizedArtistName, false, attemptsUsed, undefined, 'NO_RELATION');
      
      // Si c'était la dernière tentative, éliminer
      if (attemptsUsed >= MAX_ATTEMPTS_PER_TURN) {
        const eliminatedGame = this.eliminatePlayer(updatedGame, playerId, 'NO_RELATION');
        return {
          isValid: false,
          turn,
          game: {
            ...eliminatedGame,
            turns: [...eliminatedGame.turns, turn],
          },
          message: `Aucune collaboration trouvée. ${currentPlayer.name} est éliminé (tentative ${attemptsUsed}/${MAX_ATTEMPTS_PER_TURN}).`,
        };
      }
      
      return {
        isValid: false,
        turn,
        game: {
          ...updatedGame,
          turns: [...updatedGame.turns, turn],
        },
        message: `Aucune collaboration trouvée. Tentative ${attemptsUsed}/${MAX_ATTEMPTS_PER_TURN}.`,
      };
    }

    // 11) Règle SINGLE_CIRCULAR (invalid mais retry autorisé)
    if (validation.flags?.singleCircularCollab) {
      const updatedGame = {
        ...game,
        attemptsUsed,
      };
      const turn = createTurn(playerId, normalizedArtistName, false, attemptsUsed, validation.source, 'SINGLE_CIRCULAR');
      
      // Si c'était la dernière tentative, éliminer
      if (attemptsUsed >= MAX_ATTEMPTS_PER_TURN) {
        const eliminatedGame = this.eliminatePlayer(updatedGame, playerId, 'SINGLE_CIRCULAR');
        return {
          isValid: false,
          turn,
          game: {
            ...eliminatedGame,
            turns: [...eliminatedGame.turns, turn],
          },
          message: `"${validation.canonical.name}" n'a qu'une seule collaboration (avec l'artiste précédent). ${currentPlayer.name} est éliminé (tentative ${attemptsUsed}/${MAX_ATTEMPTS_PER_TURN}).`,
        };
      }
      
      // Retry autorisé - ne pas mettre à jour lastArtist ni usedArtists
      return {
        isValid: false,
        turn,
        game: {
          ...updatedGame,
          turns: [...updatedGame.turns, turn],
        },
        message: `"${validation.canonical.name}" n'a qu'une seule collaboration (avec l'artiste précédent). Retry autorisé. Tentative ${attemptsUsed}/${MAX_ATTEMPTS_PER_TURN}.`,
      };
    }

    // 12) Proposition valide - accepter
    const canonicalId = this.getCanonicalId(validation.canonical);
    const updatedGame = this.moveToNextPlayer({
      ...game,
      turns: [...game.turns, createTurn(playerId, normalizedArtistName, true, attemptsUsed, validation.source)],
      lastArtist: validation.canonical,
      lastArtistName: validation.canonical.name, // Legacy
      usedArtists: [...game.usedArtists, canonicalId],
    });

    // Démarrer le tour suivant
    const finalGame = this.startTurn(updatedGame);

    return {
      isValid: true,
      turn: createTurn(playerId, normalizedArtistName, true, attemptsUsed, validation.source),
      game: finalGame,
      message: `Collaboration validée entre "${previousArtist?.name || 'début'}" et "${validation.canonical.name}" (${validation.source || 'musicbrainz'}).`,
    };
  }

  /**
   * Passe au joueur suivant
   * Public pour permettre à GameManager de l'utiliser lors des timeouts
   */
  moveToNextPlayer(game: Game): Game {
    let nextIndex = (game.currentPlayerIndex + 1) % game.players.length;

    // Trouver le prochain joueur non éliminé
    let attempts = 0;
    while (
      game.players[nextIndex].isEliminated &&
      attempts < game.players.length
    ) {
      nextIndex = (nextIndex + 1) % game.players.length;
      attempts++;
    }

    // Vérifier s'il reste des joueurs
    const activePlayers = game.players.filter((p) => !p.isEliminated);
    if (activePlayers.length <= 1) {
      // Un seul joueur actif ou moins : la partie est terminée
      return {
        ...game,
        status: GameStatus.FINISHED,
        currentPlayerIndex: nextIndex,
        currentTurnEndsAt: undefined,
        attemptsUsed: 0,
      };
    }

    return {
      ...game,
      currentPlayerIndex: nextIndex,
    };
  }

  /**
   * Élimine un joueur
   * Public pour permettre à GameManager de l'utiliser lors des timeouts
   */
  eliminatePlayer(game: Game, playerId: string, reason?: InvalidReason): Game {
    const updatedPlayers = game.players.map((player) =>
      player.id === playerId ? { ...player, isEliminated: true } : player
    );

    const activePlayers = updatedPlayers.filter((p) => !p.isEliminated);

    // Si un seul joueur actif ou moins, la partie est terminée
    const newStatus =
      activePlayers.length <= 1 ? GameStatus.FINISHED : game.status;

    return {
      ...game,
      players: updatedPlayers,
      status: newStatus,
    };
  }

  /**
   * Obtient le joueur actuel
   */
  getCurrentPlayer(game: Game): Player | null {
    if (game.status !== GameStatus.IN_PROGRESS) {
      return null;
    }

    return game.players[game.currentPlayerIndex];
  }

  /**
   * Obtient la liste des joueurs actifs (non éliminés)
   */
  getActivePlayers(game: Game): Player[] {
    return game.players.filter((p) => !p.isEliminated);
  }
}
