import { CanonicalArtist } from '../types/Game';
import { SoloMove, createSoloMove } from '../types/SoloMove';
import { SoloRun, SoloRunStatus, createSoloRun } from '../types/SoloRun';
import { ValidationService } from '../services/ValidationService';
import { MusicBrainzService } from '../services/MusicBrainzService';
import { WikidataService } from '../services/WikidataService';
import { scoringService } from '../services/ScoringService';

/**
 * Durée d'un tour en millisecondes (30 secondes)
 */
const TURN_DURATION_MS = 30000;

/**
 * Paliers de difficulté du bot
 */
const BOT_DIFFICULTY_THRESHOLDS = [5, 7, 10];

/**
 * Liste de rappeurs français populaires pour le seed
 */
const SEED_ARTISTS = [
  'Booba', 'Kaaris', 'Damso', 'PNL', 'Nekfeu',
  'Orelsan', 'Vald', 'Lomepal', 'SCH', 'Laylow',
  'Ninho', 'Jul', 'Gims', 'Soprano', 'La Fouine',
  'IAM', 'MC Solaar', 'Oxmo Puccino', 'Bigflo & Oli', 'Rohff',
];

/**
 * Résultat d'un coup dans une partie Solo vs Bot
 */
export interface BotGameMoveResult {
  playerMove: {
    isValid: boolean;
    move: SoloMove;
    message: string;
  };
  botMove?: {
    isValid: boolean;
    move: SoloMove;
    message: string;
    artistName: string;
  };
  run: BotGameRun;
  gameOver: boolean;
  winner?: 'player' | 'bot';
}

/**
 * État d'une partie Solo vs Bot
 */
export interface BotGameRun {
  id: string;
  status: SoloRunStatus;
  playerName: string;
  seedArtist: CanonicalArtist;
  currentArtist: CanonicalArtist | null;
  usedArtists: string[];
  playerMoves: SoloMove[];
  botMoves: SoloMove[];
  currentTurn: number;
  currentTurnEndsAt?: number;
  playerScore: number;
  botScore: number;
  startedAt: number;
  endedAt?: number;
  winner?: 'player' | 'bot';
  endReason?: string;
  isPlayerTurn: boolean;
}

/**
 * Gestionnaire des parties Solo vs Bot
 */
export class BotManager {
  private runs: Map<string, BotGameRun> = new Map();
  private runTimers: Map<string, NodeJS.Timeout> = new Map();
  private runLocks: Map<string, boolean> = new Map();
  private validationService: ValidationService;
  private musicBrainzService: MusicBrainzService;

  constructor() {
    this.musicBrainzService = new MusicBrainzService();
    this.validationService = new ValidationService(
      this.musicBrainzService,
      new WikidataService()
    );
  }

  /**
   * Choisit un artiste seed aléatoire
   */
  private async chooseSeedArtist(): Promise<CanonicalArtist> {
    const randomIndex = Math.floor(Math.random() * SEED_ARTISTS.length);
    const seedName = SEED_ARTISTS[randomIndex];

    const resolved = await this.musicBrainzService.resolveArtist(seedName);
    if (!resolved) {
      return { name: seedName };
    }

    return {
      name: resolved.canonicalName,
      mbid: resolved.mbid,
    };
  }

  /**
   * Crée une nouvelle partie Solo vs Bot
   */
  async startGame(playerName: string): Promise<BotGameRun> {
    const runId = `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const seedArtist = await this.chooseSeedArtist();

    const run: BotGameRun = {
      id: runId,
      status: SoloRunStatus.IN_PROGRESS,
      playerName,
      seedArtist,
      currentArtist: seedArtist,
      usedArtists: [seedArtist.mbid || seedArtist.name],
      playerMoves: [],
      botMoves: [],
      currentTurn: 1,
      currentTurnEndsAt: Date.now() + TURN_DURATION_MS,
      playerScore: 0,
      botScore: 0,
      startedAt: Date.now(),
      isPlayerTurn: true,
    };

    this.runs.set(runId, run);
    this.scheduleTurnTimer(runId, run);

    return run;
  }

  /**
   * Calcule la probabilité d'erreur du bot selon le tour
   */
  private getBotErrorProbability(turn: number): number {
    if (turn <= BOT_DIFFICULTY_THRESHOLDS[0]) return 0.05;
    if (turn <= BOT_DIFFICULTY_THRESHOLDS[1]) return 0.12;
    if (turn <= BOT_DIFFICULTY_THRESHOLDS[2]) return 0.20;
    return 0.30;
  }

  /**
   * Le bot choisit un artiste collaborateur valide
   */
  private async botChooseArtist(run: BotGameRun): Promise<{ artist: CanonicalArtist; isValid: boolean } | null> {
    const currentArtist = run.currentArtist || run.seedArtist;

    if (!currentArtist.mbid) {
      return null;
    }

    try {
      // Obtenir les collaborateurs connus de l'artiste actuel
      const collaboratorMbids = await this.musicBrainzService.getKnownCollaborators(currentArtist.mbid);

      if (!collaboratorMbids || collaboratorMbids.length === 0) {
        return null;
      }

      // Filtrer les artistes déjà utilisés
      const availableCollaborators = collaboratorMbids.filter(
        mbid => !run.usedArtists.some(used => used.toLowerCase() === mbid.toLowerCase())
      );

      if (availableCollaborators.length === 0) {
        return null;
      }

      // Choisir un collaborateur aléatoire
      const chosenMbid = availableCollaborators[Math.floor(Math.random() * availableCollaborators.length)];

      // Résoudre le nom de l'artiste à partir du MBID
      const resolved = await this.musicBrainzService.resolveArtistByMbid(chosenMbid);
      if (!resolved) {
        return null;
      }

      // Vérifier la collaboration via le ValidationService pour être sûr
      const validation = await this.validationService.validateMove(
        currentArtist,
        resolved.canonicalName
      );

      if (validation.exists && validation.validRelation) {
        return {
          artist: validation.canonical,
          isValid: true,
        };
      }

      return null;
    } catch (error) {
      console.error('Erreur lors du choix du bot:', error);
      return null;
    }
  }

  /**
   * Le joueur propose un artiste, puis le bot joue automatiquement
   */
  async playerMove(runId: string, artistName: string): Promise<BotGameMoveResult> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Partie ${runId} introuvable`);
    }

    if (this.runLocks.get(runId)) {
      return {
        playerMove: {
          isValid: false,
          move: createSoloMove(run.currentTurn, { name: artistName }, run.currentArtist || run.seedArtist, false, undefined, 'OTHER'),
          message: 'Un coup est déjà en cours de traitement',
        },
        run,
        gameOver: false,
      };
    }

    if (run.status !== SoloRunStatus.IN_PROGRESS) {
      return {
        playerMove: {
          isValid: false,
          move: createSoloMove(run.currentTurn, { name: artistName }, run.currentArtist || run.seedArtist, false, undefined, 'OTHER'),
          message: 'La partie est terminée',
        },
        run,
        gameOver: true,
        winner: run.winner,
      };
    }

    if (!run.isPlayerTurn) {
      return {
        playerMove: {
          isValid: false,
          move: createSoloMove(run.currentTurn, { name: artistName }, run.currentArtist || run.seedArtist, false, undefined, 'OTHER'),
          message: "Ce n'est pas votre tour",
        },
        run,
        gameOver: false,
      };
    }

    // Vérifier le timer
    if (run.currentTurnEndsAt && Date.now() >= run.currentTurnEndsAt) {
      const finishedRun = this.endGame(run, 'bot', 'TIMEOUT');
      return {
        playerMove: {
          isValid: false,
          move: createSoloMove(run.currentTurn, { name: artistName }, run.currentArtist || run.seedArtist, false, undefined, 'TIMEOUT'),
          message: 'Temps ecoulé !',
        },
        run: finishedRun,
        gameOver: true,
        winner: 'bot',
      };
    }

    this.runLocks.set(runId, true);

    try {
      const previousArtist = run.currentArtist || run.seedArtist;
      const turnStartTime = run.currentTurnEndsAt ? run.currentTurnEndsAt - TURN_DURATION_MS : run.startedAt;
      const timeSpentSeconds = Math.floor((Date.now() - turnStartTime) / 1000);

      // Valider le coup du joueur
      const validation = await this.validationService.validateMove(previousArtist, artistName);

      // Artiste introuvable
      if (!validation.exists) {
        const finishedRun = this.endGame(run, 'bot', 'Artiste introuvable');
        const move = createSoloMove(run.currentTurn, { name: artistName }, previousArtist, false, undefined, 'NOT_FOUND');
        finishedRun.playerMoves = [...run.playerMoves, move];
        this.runs.set(runId, finishedRun);
        this.runLocks.delete(runId);
        return {
          playerMove: { isValid: false, move, message: `Artiste "${artistName}" introuvable.` },
          run: finishedRun,
          gameOver: true,
          winner: 'bot',
        };
      }

      // Vérifier la répétition
      const canonicalId = validation.canonical.mbid || validation.canonical.name;
      if (run.usedArtists.some(used => used.toLowerCase() === canonicalId.toLowerCase())) {
        const finishedRun = this.endGame(run, 'bot', 'Artiste deja utilise');
        const move = createSoloMove(run.currentTurn, validation.canonical, previousArtist, false, validation.source, 'REPEAT');
        finishedRun.playerMoves = [...run.playerMoves, move];
        this.runs.set(runId, finishedRun);
        this.runLocks.delete(runId);
        return {
          playerMove: { isValid: false, move, message: `"${validation.canonical.name}" déjà utilisé.` },
          run: finishedRun,
          gameOver: true,
          winner: 'bot',
        };
      }

      // Vérifier la collaboration
      if (!validation.validRelation) {
        const finishedRun = this.endGame(run, 'bot', 'Pas de collaboration');
        const move = createSoloMove(run.currentTurn, validation.canonical, previousArtist, false, validation.source, 'INVALID_FEAT');
        finishedRun.playerMoves = [...run.playerMoves, move];
        this.runs.set(runId, finishedRun);
        this.runLocks.delete(runId);
        return {
          playerMove: { isValid: false, move, message: `Aucune collaboration entre "${previousArtist.name}" et "${validation.canonical.name}".` },
          run: finishedRun,
          gameOver: true,
          winner: 'bot',
        };
      }

      // Coup valide du joueur - calculer le score
      const playerScoring = this.calculateSimpleScore(timeSpentSeconds, run.currentTurn, validation.canonical.mbid);
      const playerMove = createSoloMove(
        run.currentTurn, validation.canonical, previousArtist, true,
        validation.source, undefined, playerScoring
      );

      // Mettre à jour la run après le coup du joueur
      let updatedRun: BotGameRun = {
        ...run,
        currentArtist: validation.canonical,
        usedArtists: [...run.usedArtists, canonicalId],
        playerMoves: [...run.playerMoves, playerMove],
        playerScore: run.playerScore + playerScoring.finalScore,
        currentTurn: run.currentTurn + 1,
        isPlayerTurn: false,
      };

      // C'est au tour du bot
      const botResult = await this.botPlay(updatedRun);

      if (!botResult) {
        // Le bot n'a pas trouvé de réponse valide -> le joueur gagne
        const finishedRun = this.endGame(updatedRun, 'player', 'Le bot ne trouve pas de réponse');
        this.runs.set(runId, finishedRun);
        this.runLocks.delete(runId);
        return {
          playerMove: { isValid: true, move: playerMove, message: `+${playerScoring.finalScore} pts` },
          botMove: {
            isValid: false,
            move: createSoloMove(updatedRun.currentTurn, { name: 'BOT_FAIL' }, validation.canonical, false, undefined, 'OTHER'),
            message: 'Le bot ne trouve pas de réponse !',
            artistName: '',
          },
          run: finishedRun,
          gameOver: true,
          winner: 'player',
        };
      }

      // Le bot a joué avec succès
      const botScoring = this.calculateSimpleScore(
        Math.floor(Math.random() * 15) + 3, // Le bot prend 3-18 secondes
        updatedRun.currentTurn,
        botResult.artist.mbid
      );
      const botMove = createSoloMove(
        updatedRun.currentTurn, botResult.artist,
        updatedRun.currentArtist || updatedRun.seedArtist,
        true, undefined, undefined, botScoring
      );

      const botCanonicalId = botResult.artist.mbid || botResult.artist.name;
      const finalRun: BotGameRun = {
        ...updatedRun,
        currentArtist: botResult.artist,
        usedArtists: [...updatedRun.usedArtists, botCanonicalId],
        botMoves: [...updatedRun.botMoves, botMove],
        botScore: updatedRun.botScore + botScoring.finalScore,
        currentTurn: updatedRun.currentTurn + 1,
        currentTurnEndsAt: Date.now() + TURN_DURATION_MS,
        isPlayerTurn: true,
      };

      this.runs.set(runId, finalRun);
      this.scheduleTurnTimer(runId, finalRun);
      this.runLocks.delete(runId);

      return {
        playerMove: { isValid: true, move: playerMove, message: `+${playerScoring.finalScore} pts` },
        botMove: {
          isValid: true,
          move: botMove,
          message: `Le bot propose "${botResult.artist.name}" (+${botScoring.finalScore} pts)`,
          artistName: botResult.artist.name,
        },
        run: finalRun,
        gameOver: false,
      };
    } catch (error) {
      this.runLocks.delete(runId);
      console.error(`Erreur lors du traitement du coup:`, error);
      const finishedRun = this.endGame(run, 'player', 'Erreur technique');
      this.runs.set(runId, finishedRun);
      return {
        playerMove: {
          isValid: false,
          move: createSoloMove(run.currentTurn, { name: artistName }, run.currentArtist || run.seedArtist, false, undefined, 'OTHER'),
          message: 'Erreur lors de la validation.',
        },
        run: finishedRun,
        gameOver: true,
        winner: 'player',
      };
    }
  }

  /**
   * Le bot joue son tour
   */
  private async botPlay(run: BotGameRun): Promise<{ artist: CanonicalArtist } | null> {
    // Simuler un délai de réflexion humain (1-4 secondes)
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 3000));

    const choice = await this.botChooseArtist(run);
    if (!choice || !choice.isValid) {
      return null;
    }

    return { artist: choice.artist };
  }

  /**
   * Calcule un score simplifié
   */
  private calculateSimpleScore(
    timeSpentSeconds: number,
    currentTurn: number,
    mbid?: string
  ): {
    basePoints: number; pairBonus: number; degreeBonus: number;
    categoryBonus: number; timeBonus: number; chainBonus: number;
    finalScore: number; pairFamilyCount: number; degree: number;
    category: 'ultra_mainstream' | 'mainstream' | 'connu' | 'niche' | 'underground';
    timeSpent: number; chainLength: number;
  } {
    const timeBonus = timeSpentSeconds <= 5 ? 1.20 :
                      timeSpentSeconds <= 10 ? 1.12 :
                      timeSpentSeconds <= 20 ? 1.06 :
                      timeSpentSeconds <= 35 ? 1.02 : 1.00;

    const palier = Math.floor((currentTurn - 1) / 5);
    const chainBonus = 1 + Math.min(0.20, 0.05 * palier);

    const rawScore = 100 * timeBonus * chainBonus;
    const finalScore = Math.min(Math.round(rawScore), 280);

    return {
      basePoints: 100,
      pairBonus: 1.00,
      degreeBonus: 1.00,
      categoryBonus: 1.00,
      timeBonus,
      chainBonus,
      finalScore,
      pairFamilyCount: 0,
      degree: 0,
      category: 'underground' as const,
      timeSpent: timeSpentSeconds,
      chainLength: currentTurn,
    };
  }

  /**
   * Termine une partie
   */
  private endGame(run: BotGameRun, winner: 'player' | 'bot', reason: string): BotGameRun {
    this.clearTurnTimer(run.id);
    const finishedRun: BotGameRun = {
      ...run,
      status: SoloRunStatus.FINISHED,
      endedAt: Date.now(),
      winner,
      endReason: reason,
      currentTurnEndsAt: undefined,
    };
    this.runs.set(run.id, finishedRun);
    return finishedRun;
  }

  /**
   * Programme un timer pour le tour actuel
   */
  private scheduleTurnTimer(runId: string, run: BotGameRun): void {
    this.clearTurnTimer(runId);

    if (run.status !== SoloRunStatus.IN_PROGRESS || !run.currentTurnEndsAt) {
      return;
    }

    const timeRemaining = run.currentTurnEndsAt - Date.now();
    if (timeRemaining <= 0) {
      this.handleTurnTimeout(runId);
      return;
    }

    const timeout = setTimeout(() => {
      this.handleTurnTimeout(runId);
    }, timeRemaining);

    this.runTimers.set(runId, timeout);
  }

  /**
   * Gère l'expiration du timer
   */
  private handleTurnTimeout(runId: string): void {
    const run = this.runs.get(runId);
    if (!run || run.status !== SoloRunStatus.IN_PROGRESS) return;

    if (run.isPlayerTurn) {
      // Le joueur n'a pas répondu à temps -> le bot gagne
      this.endGame(run, 'bot', 'TIMEOUT');
    }
  }

  private clearTurnTimer(runId: string): void {
    const timeout = this.runTimers.get(runId);
    if (timeout) {
      clearTimeout(timeout);
      this.runTimers.delete(runId);
    }
  }

  /**
   * Obtient une partie par son ID
   */
  getRun(runId: string): BotGameRun | null {
    return this.runs.get(runId) || null;
  }
}

// Singleton
export const botManager = new BotManager();
