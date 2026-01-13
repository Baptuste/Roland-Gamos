import { Game, GameStatus } from '../types/Game';
import { Player } from '../types/Player';
import { Turn, createTurn } from '../types/Turn';
import { MusicBrainzService } from './MusicBrainzService';

export interface ProposalResult {
  isValid: boolean;
  turn: Turn;
  game: Game;
  message: string;
}

export class GameService {
  private musicBrainzService: MusicBrainzService;

  constructor(musicBrainzService?: MusicBrainzService) {
    this.musicBrainzService = musicBrainzService || new MusicBrainzService();
  }

  startGame(game: Game): Game {
    if (game.status !== GameStatus.WAITING) {
      throw new Error('La partie ne peut être démarrée que si elle est en attente');
    }

    if (game.players.length < 2) {
      throw new Error('Une partie nécessite au moins 2 joueurs');
    }

    return {
      ...game,
      status: GameStatus.IN_PROGRESS,
    };
  }

  async proposeArtist(
    game: Game,
    playerId: string,
    artistName: string
  ): Promise<ProposalResult> {
    if (game.status !== GameStatus.IN_PROGRESS) {
      return {
        isValid: false,
        turn: createTurn(playerId, artistName, false),
        game,
        message: 'La partie n\'est pas en cours',
      };
    }

    const currentPlayer = game.players[game.currentPlayerIndex];
    if (currentPlayer.id !== playerId) {
      return {
        isValid: false,
        turn: createTurn(playerId, artistName, false),
        game,
        message: `Ce n'est pas le tour de ${currentPlayer.name}`,
      };
    }

    if (currentPlayer.isEliminated) {
      return {
        isValid: false,
        turn: createTurn(playerId, artistName, false),
        game,
        message: 'Le joueur est éliminé',
      };
    }

    const normalizedArtistName = artistName.trim();

    const isDuplicate = game.turns.some(
      (turn) => turn.artistName.toLowerCase() === normalizedArtistName.toLowerCase()
    );

    if (isDuplicate) {
      const updatedGame = this.eliminatePlayer(game, playerId);
      const turn = createTurn(playerId, normalizedArtistName, false);

      return {
        isValid: false,
        turn,
        game: {
          ...updatedGame,
          turns: [...updatedGame.turns, turn],
        },
        message: `L'artiste "${normalizedArtistName}" a déjà été proposé. ${currentPlayer.name} est éliminé.`,
      };
    }

    if (game.turns.length === 0) {
      const turn = createTurn(playerId, normalizedArtistName, true);
      const updatedGame = this.moveToNextPlayer({
        ...game,
        turns: [...game.turns, turn],
        lastArtistName: normalizedArtistName,
      });

      return {
        isValid: true,
        turn,
        game: updatedGame,
        message: `Premier artiste proposé: "${normalizedArtistName}"`,
      };
    }

    if (!game.lastArtistName) {
      throw new Error('Erreur: pas d\'artiste précédent alors que des tours existent');
    }

    const hasCollaboration = await this.musicBrainzService.hasCollaboration(
      game.lastArtistName,
      normalizedArtistName
    );

    if (!hasCollaboration) {
      const updatedGame = this.eliminatePlayer(game, playerId);
      const turn = createTurn(playerId, normalizedArtistName, false);

      return {
        isValid: false,
        turn,
        game: {
          ...updatedGame,
          turns: [...updatedGame.turns, turn],
        },
        message: `Aucune collaboration trouvée entre "${game.lastArtistName}" et "${normalizedArtistName}". ${currentPlayer.name} est éliminé.`,
      };
    }

    const turn = createTurn(playerId, normalizedArtistName, true);
    const updatedGame = this.moveToNextPlayer({
      ...game,
      turns: [...game.turns, turn],
      lastArtistName: normalizedArtistName,
    });

    return {
      isValid: true,
      turn,
      game: updatedGame,
      message: `Collaboration validée entre "${game.lastArtistName}" et "${normalizedArtistName}"`,
    };
  }

  private moveToNextPlayer(game: Game): Game {
    let nextIndex = (game.currentPlayerIndex + 1) % game.players.length;

    let attempts = 0;
    while (
      game.players[nextIndex].isEliminated &&
      attempts < game.players.length
    ) {
      nextIndex = (nextIndex + 1) % game.players.length;
      attempts++;
    }

    const activePlayers = game.players.filter((p) => !p.isEliminated);
    if (activePlayers.length <= 1) {
      return {
        ...game,
        status: GameStatus.FINISHED,
        currentPlayerIndex: nextIndex,
      };
    }

    return {
      ...game,
      currentPlayerIndex: nextIndex,
    };
  }

  private eliminatePlayer(game: Game, playerId: string): Game {
    const updatedPlayers = game.players.map((player) =>
      player.id === playerId ? { ...player, isEliminated: true } : player
    );

    const activePlayers = updatedPlayers.filter((p) => !p.isEliminated);

    const newStatus =
      activePlayers.length <= 1 ? GameStatus.FINISHED : game.status;

    return {
      ...game,
      players: updatedPlayers,
      status: newStatus,
    };
  }

  getCurrentPlayer(game: Game): Player | null {
    if (game.status !== GameStatus.IN_PROGRESS) {
      return null;
    }

    return game.players[game.currentPlayerIndex];
  }

  getActivePlayers(game: Game): Player[] {
    return game.players.filter((p) => !p.isEliminated);
  }
}
