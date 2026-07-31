import { Game, GameStatus, createGame, CanonicalArtist, getTeamIds } from '../types/Game';
import { Player, JokerType } from '../types/Player';
import { Turn, createTurn, InvalidReason } from '../types/Turn';

/**
 * Jokers dont l'effet ajoute du temps au tour en cours.
 */
const TIMER_JOKER_BONUS_MS = 15000;
import { gameDataStore } from './GameDataStore';

/**
 * Nombre maximum de tentatives par tour
 */
const MAX_ATTEMPTS_PER_TURN = 2;

/**
 * Résultat d'une validation locale d'un coup (remplace l'ancien ValidationResult
 * base sur ValidationService/MusicBrainz — meme forme, source RAM-only).
 */
interface LocalValidationResult {
  exists: boolean;
  validRelation: boolean;
  source?: 'local_store';
  canonical: CanonicalArtist;
  flags?: { singleCircularCollab?: boolean };
}

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
 *
 * Validation 100% RAM via GameDataStore — aucun appel réseau pendant une partie
 * (meme regle absolue que Solo Infini / Solo vs Bot, voir CLAUDE_3.md §2.1).
 */
export class GameService {
  private onTurnTimeout?: (gameId: string) => void;

  constructor(onTurnTimeout?: (gameId: string) => void) {
    this.onTurnTimeout = onTurnTimeout;
  }

  /**
   * Valide un coup localement via GameDataStore (zéro appel réseau).
   * Reproduit le contrat de l'ancien ValidationService.validateMove :
   * existence de l'artiste, relation de collaboration, flag single-circular.
   */
  private validateMoveLocally(
    previousArtist: CanonicalArtist | null,
    proposedArtistName: string
  ): LocalValidationResult {
    const resolved = gameDataStore.resolveArtist(proposedArtistName);
    if (!resolved) {
      return { exists: false, validRelation: false, canonical: { name: proposedArtistName } };
    }

    const canonical: CanonicalArtist = { name: resolved.name, gameId: resolved.id };

    // Premier tour de la partie : pas d'artiste précédent, existence suffit
    if (!previousArtist) {
      return { exists: true, validRelation: true, source: 'local_store', canonical };
    }

    const prevId = previousArtist.gameId ?? gameDataStore.resolveArtist(previousArtist.name)?.id;
    if (!prevId) {
      return { exists: true, validRelation: false, source: 'local_store', canonical };
    }

    const validRelation = gameDataStore.haveCollaborated(prevId, resolved.id);

    // Règle single-circular : l'artiste proposé n'a qu'un seul collaborateur connu,
    // et c'est justement l'artiste précédent (pas assez de profondeur pour continuer la chaîne)
    const collaborators = gameDataStore.getCollaborators(resolved.id);
    const singleCircularCollab = collaborators.length === 1 && collaborators[0] === prevId;

    return {
      exists: true,
      validRelation,
      source: 'local_store',
      canonical,
      flags: { singleCircularCollab },
    };
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

    // En mode équipe, ce premier joueur ne passe jamais par
    // moveToNextPlayerByTeam (qui avance normalement le pointeur interne de
    // son équipe) — sans ce rattrapage, la prochaine fois que son équipe
    // rejoue, le pointeur (resté à 0) redonnerait la main au même joueur
    // au lieu du suivant.
    let teamNextMemberIndex = game.teamNextMemberIndex;
    if (game.settings.teamsEnabled) {
      const firstPlayer = game.players[firstPlayerIndex];
      if (firstPlayer?.teamId) {
        const teamMembers = game.players.filter((p) => p.teamId === firstPlayer.teamId);
        const posInTeam = teamMembers.findIndex((p) => p.id === firstPlayer.id);
        if (posInTeam >= 0) {
          teamNextMemberIndex = {
            ...(game.teamNextMemberIndex || {}),
            [firstPlayer.teamId]: (posInTeam + 1) % teamMembers.length,
          };
        }
      }
    }

    const startedGame = {
      ...game,
      status: GameStatus.IN_PROGRESS,
      currentPlayerIndex: firstPlayerIndex,
      usedArtists: game.usedArtists || [],
      attemptsUsed: 0,
      teamNextMemberIndex,
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
      currentTurnEndsAt: now + game.settings.turnDurationMs,
      attemptsUsed: 0,
      turnJokerState: {},
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
    return canonical.gameId !== undefined ? String(canonical.gameId) : canonical.name.toLowerCase().trim();
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
      const damagedGame = this.eliminatePlayer(game, playerId, 'TIMEOUT');
      const message = `Temps écoulé. ${this.lifeLossMessage(damagedGame, playerId, currentPlayer.name)}`;
      const turn = createTurn(playerId, artistName, false, game.attemptsUsed || 0, undefined, 'TIMEOUT');
      const updatedGame = this.advanceTurnIfPlaying(damagedGame);

      return {
        isValid: false,
        turn,
        game: {
          ...updatedGame,
          turns: [...updatedGame.turns, turn],
        },
        message,
      };
    }

    // 5) Vérifier le nombre de tentatives
    const attemptsUsed = (game.attemptsUsed || 0) + 1;
    if (attemptsUsed > MAX_ATTEMPTS_PER_TURN) {
      const damagedGame = this.eliminatePlayer(game, playerId, 'OTHER');
      const message = `Nombre maximum de tentatives atteint. ${this.lifeLossMessage(damagedGame, playerId, currentPlayer.name)}`;
      const turn = createTurn(playerId, artistName, false, attemptsUsed, undefined, 'OTHER');
      const updatedGame = this.advanceTurnIfPlaying(damagedGame);

      return {
        isValid: false,
        turn,
        game: {
          ...updatedGame,
          turns: [...updatedGame.turns, turn],
        },
        message,
      };
    }

    // 6) Normaliser le nom de l'artiste
    const normalizedArtistName = artistName.trim();

    // 7) Valider le mouvement localement via GameDataStore (zéro appel réseau)
    const previousArtist = game.lastArtist || (game.lastArtistName ? { name: game.lastArtistName } : null);
    const validation = this.validateMoveLocally(previousArtist, normalizedArtistName);

    // 8) Règle REPEAT (HARD FAIL - pas de retry, coûte une vie même tour)
    if (validation.exists) {
      const canonicalId = this.getCanonicalId(validation.canonical);
      if (this.isArtistUsed(game, validation.canonical)) {
        const damagedGame = this.eliminatePlayer(game, playerId, 'REPEAT');
        const message = `L'artiste "${validation.canonical.name}" a déjà été utilisé. ${this.lifeLossMessage(damagedGame, playerId, currentPlayer.name)}`;
        const turn = createTurn(playerId, normalizedArtistName, false, attemptsUsed, undefined, 'REPEAT');
        const updatedGame = this.advanceTurnIfPlaying(damagedGame);

        return {
          isValid: false,
          turn,
          game: {
            ...updatedGame,
            turns: [...updatedGame.turns, turn],
          },
          message,
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
      
      // Si c'était la dernière tentative, retirer une vie
      if (attemptsUsed >= MAX_ATTEMPTS_PER_TURN) {
        const damagedGame = this.eliminatePlayer(updatedGame, playerId, 'NOT_FOUND');
        const message = `Artiste "${normalizedArtistName}" non trouvé. ${this.lifeLossMessage(damagedGame, playerId, currentPlayer.name)}`;
        const finalGame = this.advanceTurnIfPlaying(damagedGame);
        return {
          isValid: false,
          turn,
          game: {
            ...finalGame,
            turns: [...finalGame.turns, turn],
          },
          message,
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
      
      // Si c'était la dernière tentative, retirer une vie
      if (attemptsUsed >= MAX_ATTEMPTS_PER_TURN) {
        const damagedGame = this.eliminatePlayer(updatedGame, playerId, 'NO_RELATION');
        const message = `Aucune collaboration trouvée. ${this.lifeLossMessage(damagedGame, playerId, currentPlayer.name)}`;
        const finalGame = this.advanceTurnIfPlaying(damagedGame);
        return {
          isValid: false,
          turn,
          game: {
            ...finalGame,
            turns: [...finalGame.turns, turn],
          },
          message,
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
      
      // Si c'était la dernière tentative, retirer une vie
      if (attemptsUsed >= MAX_ATTEMPTS_PER_TURN) {
        const damagedGame = this.eliminatePlayer(updatedGame, playerId, 'SINGLE_CIRCULAR');
        const message = `"${validation.canonical.name}" n'a qu'une seule collaboration (avec l'artiste précédent). ${this.lifeLossMessage(damagedGame, playerId, currentPlayer.name)}`;
        const finalGame = this.advanceTurnIfPlaying(damagedGame);
        return {
          isValid: false,
          turn,
          game: {
            ...finalGame,
            turns: [...finalGame.turns, turn],
          },
          message,
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
    const gameAfterMove = {
      ...game,
      turns: [...game.turns, createTurn(playerId, normalizedArtistName, true, attemptsUsed, validation.source)],
      lastArtist: validation.canonical,
      lastArtistName: validation.canonical.name, // Legacy
      usedArtists: [...game.usedArtists, canonicalId],
    };

    // Joker Combo actif et 1er artiste du tour validé : le joueur enchaîne
    // immédiatement un 2e artiste sans que la main ne passe (comboArtistsPlayed
    // passe à 1, en attente du 2e coup du même joueur — voir CLAUDE_3.md §7.2).
    if (game.turnJokerState?.comboArtistsPlayed === 0) {
      const comboGame = {
        ...gameAfterMove,
        attemptsUsed: 0,
        turnJokerState: { ...gameAfterMove.turnJokerState, comboArtistsPlayed: 1 },
      };
      return {
        isValid: true,
        turn: createTurn(playerId, normalizedArtistName, true, attemptsUsed, validation.source),
        game: comboGame,
        message: `Premier artiste du combo validé ("${validation.canonical.name}"), proposez le second !`,
      };
    }

    const updatedGame = this.moveToNextPlayer(gameAfterMove);

    // Démarrer le tour suivant
    const finalGame = this.startTurn(updatedGame);

    return {
      isValid: true,
      turn: createTurn(playerId, normalizedArtistName, true, attemptsUsed, validation.source),
      game: finalGame,
      message: `Collaboration validée entre "${previousArtist?.name || 'début'}" et "${validation.canonical.name}" (${validation.source || 'local_store'}).`,
    };
  }

  /**
   * Passe au joueur suivant
   * Public pour permettre à GameManager de l'utiliser lors des timeouts
   */
  moveToNextPlayer(game: Game): Game {
    if (game.settings.teamsEnabled) {
      return this.moveToNextPlayerByTeam(game);
    }

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
   * Rotation alternée par équipe : passe à l'équipe suivante (dans l'ordre
   * team-0, team-1, ...), qui reprend son propre round-robin interne là où
   * elle l'avait laissé (game.teamNextMemberIndex). currentPlayerIndex reste
   * un index direct dans game.players (jamais réordonné — players[0] doit
   * toujours rester l'hôte, cf. GameManager).
   */
  private moveToNextPlayerByTeam(game: Game): Game {
    const teamIds = getTeamIds(game.settings.teamCount);
    const activeTeams = this.getActiveTeams(game.players, teamIds);

    if (activeTeams.size <= 1) {
      return {
        ...game,
        status: GameStatus.FINISHED,
        currentTurnEndsAt: undefined,
        attemptsUsed: 0,
      };
    }

    const currentPlayer = game.players[game.currentPlayerIndex];
    const curTeamPos = currentPlayer?.teamId ? teamIds.indexOf(currentPlayer.teamId) : -1;
    const startPos = curTeamPos >= 0 ? curTeamPos : 0;
    const pointers: Record<string, number> = { ...(game.teamNextMemberIndex || {}) };

    for (let i = 1; i <= teamIds.length; i++) {
      const candidateTeamId = teamIds[(startPos + i) % teamIds.length];
      if (!activeTeams.has(candidateTeamId)) continue;

      const members = game.players.filter((p) => p.teamId === candidateTeamId);
      if (members.length === 0) continue;

      const pointer = pointers[candidateTeamId] ?? 0;
      for (let attempt = 0; attempt < members.length; attempt++) {
        const idx = (pointer + attempt) % members.length;
        const member = members[idx];
        if (!member.isEliminated) {
          pointers[candidateTeamId] = (idx + 1) % members.length;
          return {
            ...game,
            currentPlayerIndex: game.players.findIndex((p) => p.id === member.id),
            teamNextMemberIndex: pointers,
          };
        }
      }
    }

    // Aucun membre actif trouvé malgré activeTeams.size > 1 : ne devrait pas
    // arriver (activeTeams est calculé sur les mêmes joueurs), sécurité quand même.
    return {
      ...game,
      status: GameStatus.FINISHED,
      currentTurnEndsAt: undefined,
      attemptsUsed: 0,
    };
  }

  /**
   * Ids des équipes ayant encore au moins un membre actif.
   */
  private getActiveTeams(players: Player[], teamIds: string[]): Set<string> {
    const active = new Set<string>();
    for (const p of players) {
      if (!p.isEliminated && p.teamId && teamIds.includes(p.teamId)) {
        active.add(p.teamId);
      }
    }
    return active;
  }

  /**
   * Retire une vie à un joueur. Ne l'élimine réellement que s'il n'a plus
   * de vie (livesRemaining atteint 0) — avec maxLives=1 (défaut historique),
   * une perte de vie élimine toujours immédiatement, comme avant.
   * Public pour permettre à GameManager de l'utiliser lors des timeouts.
   */
  eliminatePlayer(game: Game, playerId: string, reason?: InvalidReason): Game {
    // Joker Bouclier armé ce tour-ci : absorbe l'élimination, rien ne change.
    // Se réinitialise naturellement au tour suivant (startTurn remet
    // turnJokerState à {}), donc protection à usage unique garantie.
    if (game.turnJokerState?.shieldActive) {
      return game;
    }

    if (game.settings.teamsEnabled) {
      return this.eliminatePlayerTeamMode(game, playerId);
    }

    const updatedPlayers = game.players.map((player) => {
      if (player.id !== playerId) return player;
      const livesRemaining = Math.max(0, player.livesRemaining - 1);
      return { ...player, livesRemaining, isEliminated: livesRemaining <= 0 };
    });

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
   * Retire une vie/erreur en mode équipe. Deux mécaniques distinctes selon
   * settings.eliminationMode (voir CLAUDE_3.md §7.1) :
   * - 'vies' : chaque membre garde ses propres vies (même logique qu'en solo).
   *   Un membre à 0 vies sort de la rotation, l'équipe survit tant qu'il en
   *   reste un autre actif.
   * - 'erreurs' : l'équipe partage un pool d'erreurs commun (indépendant des
   *   vies individuelles). N'importe quel membre qui se trompe le consomme ;
   *   à 0, toute l'équipe est éliminée d'un coup, peu importe les vies
   *   individuelles restantes de ses membres.
   */
  private eliminatePlayerTeamMode(game: Game, playerId: string): Game {
    const teamIds = getTeamIds(game.settings.teamCount);
    const targetPlayer = game.players.find((p) => p.id === playerId);
    const teamId = targetPlayer?.teamId;

    let updatedPlayers = game.players;
    let teamErrorsRemaining = game.teamErrorsRemaining;

    if (game.settings.eliminationMode === 'erreurs' && teamId) {
      const currentRemaining = game.teamErrorsRemaining?.[teamId] ?? game.settings.maxLives;
      const remaining = Math.max(0, currentRemaining - 1);
      teamErrorsRemaining = { ...(game.teamErrorsRemaining || {}), [teamId]: remaining };

      if (remaining <= 0) {
        // Pool épuisé : toute l'équipe est éliminée d'un coup
        updatedPlayers = game.players.map((p) =>
          p.teamId === teamId ? { ...p, isEliminated: true } : p
        );
      }
      // Sinon : pool entamé mais pas vide, aucun joueur n'est marqué éliminé
    } else {
      // Mode 'vies' (ou joueur sans équipe assignée, edge case défensif) :
      // même logique individuelle que le mode solo/sans-équipe.
      updatedPlayers = game.players.map((player) => {
        if (player.id !== playerId) return player;
        const livesRemaining = Math.max(0, player.livesRemaining - 1);
        return { ...player, livesRemaining, isEliminated: livesRemaining <= 0 };
      });
    }

    const activeTeams = this.getActiveTeams(updatedPlayers, teamIds);
    const newStatus = activeTeams.size <= 1 ? GameStatus.FINISHED : game.status;

    return {
      ...game,
      players: updatedPlayers,
      teamErrorsRemaining,
      status: newStatus,
    };
  }

  /**
   * Si la partie est toujours en cours, passe la main au joueur suivant et
   * démarre son tour. Nécessaire dès que maxLives > 1 : un joueur qui
   * survit à une perte de vie doit pouvoir laisser la partie continuer
   * normalement au lieu de rester bloqué sur le même tour expiré.
   */
  private advanceTurnIfPlaying(game: Game): Game {
    if (game.status !== GameStatus.IN_PROGRESS) return game;
    const advancedGame = this.moveToNextPlayer(game);
    return advancedGame.status === GameStatus.IN_PROGRESS ? this.startTurn(advancedGame) : advancedGame;
  }

  /**
   * Message de statut cohérent selon qu'une perte de vie élimine le joueur
   * ou non (maxLives > 1).
   */
  lifeLossMessage(damagedGame: Game, playerId: string, playerName: string): string {
    if (damagedGame.turnJokerState?.shieldActive) {
      return `${playerName} active son Bouclier — élimination absorbée, aucune vie perdue.`;
    }

    const player = damagedGame.players.find(p => p.id === playerId);

    if (damagedGame.settings.teamsEnabled && damagedGame.settings.eliminationMode === 'erreurs' && player?.teamId) {
      const remaining = damagedGame.teamErrorsRemaining?.[player.teamId];
      if (player.isEliminated) return `Pool d'erreurs de l'équipe épuisé. Équipe éliminée.`;
      return `${playerName} entame le pool d'erreurs de l'équipe (${remaining} restante${remaining !== 1 ? 's' : ''}).`;
    }

    if (!player || player.isEliminated) return `${playerName} est éliminé${damagedGame.settings.teamsEnabled ? ', son équipe continue si un coéquipier est encore actif.' : '.'}`;
    const lives = player.livesRemaining;
    return `${playerName} perd une vie (${lives} restante${lives > 1 ? 's' : ''}).`;
  }

  /**
   * Vérifie que le joueur peut activer ce joker (son tour, partie en cours,
   * stock disponible) et décrémente le stock. Retourne null si invalide —
   * charge à l'appelant (GameManager) de traduire ça en erreur socket.
   */
  private consumeJoker(game: Game, playerId: string, jokerType: JokerType): Game | null {
    if (!game.settings.jokersEnabled) return null;
    if (game.status !== GameStatus.IN_PROGRESS) return null;
    const currentPlayer = game.players[game.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== playerId) return null;
    const stock = currentPlayer.jokerStock?.[jokerType] ?? 0;
    if (stock <= 0) return null;

    return {
      ...game,
      players: game.players.map((p) =>
        p.id === playerId
          ? { ...p, jokerStock: { ...p.jokerStock, [jokerType]: stock - 1 } }
          : p
      ),
    };
  }

  /**
   * Joker Timer : +15s au tour en cours.
   */
  useTimerJoker(game: Game, playerId: string): Game | null {
    const consumed = this.consumeJoker(game, playerId, 'timer');
    if (!consumed) return null;
    return {
      ...consumed,
      currentTurnEndsAt: (consumed.currentTurnEndsAt ?? Date.now()) + TIMER_JOKER_BONUS_MS,
    };
  }

  /**
   * Joker Skip : passe son tour sans élimination. Compte comme un tour
   * "joué" pour la rotation (classique ou par équipe) — aucun traitement
   * spécial, mêmes moveToNextPlayer/startTurn qu'un coup normal.
   */
  useSkipJoker(game: Game, playerId: string): Game | null {
    const consumed = this.consumeJoker(game, playerId, 'skip');
    if (!consumed) return null;

    const turn = createTurn(playerId, '', true, undefined, undefined, undefined, 'skip');
    const gameWithTurn = { ...consumed, turns: [...consumed.turns, turn] };
    const advancedGame = this.moveToNextPlayer(gameWithTurn);
    return advancedGame.status === GameStatus.IN_PROGRESS ? this.startTurn(advancedGame) : advancedGame;
  }

  /**
   * Joker Bouclier : armé pour ce tour, absorbe la prochaine élimination
   * (voir eliminatePlayer). Activation préventive avant de proposer — pari
   * sur son propre coup.
   */
  useBouclierJoker(game: Game, playerId: string): Game | null {
    const consumed = this.consumeJoker(game, playerId, 'bouclier');
    if (!consumed) return null;
    return {
      ...consumed,
      turnJokerState: { ...consumed.turnJokerState, shieldActive: true },
    };
  }

  /**
   * Joker Combo : active l'enchaînement de 2 artistes dans le même tour
   * (voir proposeArtist étape 12). comboArtistsPlayed=0 = en attente du 1er.
   */
  useComboJoker(game: Game, playerId: string): Game | null {
    const consumed = this.consumeJoker(game, playerId, 'combo');
    if (!consumed) return null;
    return {
      ...consumed,
      turnJokerState: { ...consumed.turnJokerState, comboArtistsPlayed: 0 },
    };
  }

  /**
   * Joker Archives : révèle l'historique complet des artistes de la partie
   * pour ce joueur, pendant son tour uniquement (utile surtout si
   * settings.hintsEnabled=false — sinon l'historique est déjà visible).
   */
  useArchivesJoker(game: Game, playerId: string): Game | null {
    const consumed = this.consumeJoker(game, playerId, 'archives');
    if (!consumed) return null;
    return {
      ...consumed,
      turnJokerState: { ...consumed.turnJokerState, archivesRevealedPlayerId: playerId },
    };
  }

  /**
   * Joker Résurrection : ressuscite un joueur éliminé avec 1 vie. Cible un
   * coéquipier uniquement si teamsEnabled (refuse une cible d'une autre
   * équipe) ; en classique, cible libre parmi les joueurs éliminés. En mode
   * ERREURS, remonte aussi le pool d'équipe à 1 s'il était épuisé (sinon la
   * ressuscitée retomberait immédiatement à la prochaine erreur du groupe).
   */
  useResurrectionJoker(game: Game, playerId: string, targetPlayerId: string): Game | null {
    const consumed = this.consumeJoker(game, playerId, 'resurrection');
    if (!consumed) return null;

    const activator = consumed.players.find((p) => p.id === playerId);
    const target = consumed.players.find((p) => p.id === targetPlayerId);
    if (!target || !target.isEliminated) return null;

    if (consumed.settings.teamsEnabled) {
      if (!activator?.teamId || target.teamId !== activator.teamId) return null;
    }

    const updatedPlayers = consumed.players.map((p) =>
      p.id === targetPlayerId ? { ...p, isEliminated: false, livesRemaining: 1 } : p
    );

    let teamErrorsRemaining = consumed.teamErrorsRemaining;
    if (consumed.settings.teamsEnabled && consumed.settings.eliminationMode === 'erreurs' && target.teamId) {
      const currentPool = teamErrorsRemaining?.[target.teamId] ?? 0;
      if (currentPool <= 0) {
        teamErrorsRemaining = { ...(teamErrorsRemaining || {}), [target.teamId]: 1 };
      }
    }

    return {
      ...consumed,
      players: updatedPlayers,
      teamErrorsRemaining,
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
