import { CanonicalArtist } from '../types/Game';
import { SoloMove, createSoloMove } from '../types/SoloMove';
import { SoloRunStatus } from '../types/SoloRun';
import { gameDataStore } from '../services/GameDataStore';

const TURN_DURATION_MS = 30000;
const BOT_DIFFICULTY_THRESHOLDS = [5, 7, 10];

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

export class BotManager {
  private runs: Map<string, BotGameRun> = new Map();
  private runTimers: Map<string, NodeJS.Timeout> = new Map();
  private runLocks: Map<string, boolean> = new Map();

  private chooseSeedArtist(): CanonicalArtist {
    const seed = gameDataStore.getRandomSeedArtist();
    if (!seed) return { name: 'Booba', gameId: undefined };
    return { name: seed.name, gameId: seed.id };
  }

  async startGame(playerName: string): Promise<BotGameRun> {
    const runId = `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const seedArtist = this.chooseSeedArtist();

    const run: BotGameRun = {
      id: runId,
      status: SoloRunStatus.IN_PROGRESS,
      playerName,
      seedArtist,
      currentArtist: seedArtist,
      usedArtists: [String(seedArtist.gameId ?? seedArtist.name)],
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
    console.log(`Run bot créée: ${runId}, seed: ${seedArtist.name}`);
    return run;
  }

  private getBotErrorProbability(turn: number): number {
    if (turn <= BOT_DIFFICULTY_THRESHOLDS[0]) return 0.05;
    if (turn <= BOT_DIFFICULTY_THRESHOLDS[1]) return 0.12;
    if (turn <= BOT_DIFFICULTY_THRESHOLDS[2]) return 0.20;
    return 0.30;
  }

  private botChooseArtist(run: BotGameRun): CanonicalArtist | null {
    const currentArtist = run.currentArtist || run.seedArtist;
    const currentId = currentArtist.gameId ?? gameDataStore.resolveArtist(currentArtist.name)?.id;
    if (!currentId) return null;

    const collaboratorIds = gameDataStore.getCollaborators(currentId);
    if (collaboratorIds.length === 0) return null;

    // Filtrer les artistes déjà utilisés
    const usedSet = new Set(run.usedArtists);
    const available = collaboratorIds.filter(id => !usedSet.has(String(id)));
    if (available.length === 0) return null;

    // Simuler une erreur selon la difficulté
    const errorProb = this.getBotErrorProbability(run.currentTurn);
    if (Math.random() < errorProb) return null;

    const chosenId = available[Math.floor(Math.random() * available.length)];
    const artist = gameDataStore.getArtistById(chosenId);
    if (!artist) return null;

    return { name: artist.name, gameId: artist.id };
  }

  async playerMove(runId: string, artistName: string): Promise<BotGameMoveResult> {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Partie ${runId} introuvable`);

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

    if (run.currentTurnEndsAt && Date.now() >= run.currentTurnEndsAt) {
      const finishedRun = this.endGame(run, 'bot', 'TIMEOUT');
      return {
        playerMove: {
          isValid: false,
          move: createSoloMove(run.currentTurn, { name: artistName }, run.currentArtist || run.seedArtist, false, undefined, 'TIMEOUT'),
          message: 'Temps écoulé !',
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

      // Résoudre l'artiste proposé via GameDataStore
      const resolved = gameDataStore.resolveArtist(artistName);
      if (!resolved) {
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

      const canonicalArtist: CanonicalArtist = { name: resolved.name, gameId: resolved.id };

      // Vérifier la répétition
      if (run.usedArtists.includes(String(resolved.id))) {
        const finishedRun = this.endGame(run, 'bot', 'Artiste deja utilise');
        const move = createSoloMove(run.currentTurn, canonicalArtist, previousArtist, false, 'local_store', 'REPEAT');
        finishedRun.playerMoves = [...run.playerMoves, move];
        this.runs.set(runId, finishedRun);
        this.runLocks.delete(runId);
        return {
          playerMove: { isValid: false, move, message: `"${resolved.name}" déjà utilisé.` },
          run: finishedRun,
          gameOver: true,
          winner: 'bot',
        };
      }

      // Vérifier la collaboration
      const prevId = previousArtist.gameId ?? gameDataStore.resolveArtist(previousArtist.name)?.id;
      if (!prevId || !gameDataStore.haveCollaborated(prevId, resolved.id)) {
        const finishedRun = this.endGame(run, 'bot', 'Pas de collaboration');
        const move = createSoloMove(run.currentTurn, canonicalArtist, previousArtist, false, 'local_store', 'INVALID_FEAT');
        finishedRun.playerMoves = [...run.playerMoves, move];
        this.runs.set(runId, finishedRun);
        this.runLocks.delete(runId);
        return {
          playerMove: { isValid: false, move, message: `Aucune collaboration entre "${previousArtist.name}" et "${resolved.name}".` },
          run: finishedRun,
          gameOver: true,
          winner: 'bot',
        };
      }

      // Coup valide du joueur
      const playerScoring = this.calculateScore(timeSpentSeconds, run.currentTurn);
      const playerMove = createSoloMove(
        run.currentTurn, canonicalArtist, previousArtist, true, 'local_store', undefined, playerScoring
      );

      let updatedRun: BotGameRun = {
        ...run,
        currentArtist: canonicalArtist,
        usedArtists: [...run.usedArtists, String(resolved.id)],
        playerMoves: [...run.playerMoves, playerMove],
        playerScore: run.playerScore + playerScoring.finalScore,
        currentTurn: run.currentTurn + 1,
        isPlayerTurn: false,
      };

      // Simuler délai de réflexion du bot
      await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200));

      const botChoice = this.botChooseArtist(updatedRun);

      if (!botChoice) {
        const finishedRun = this.endGame(updatedRun, 'player', 'Le bot ne trouve pas de réponse');
        this.runs.set(runId, finishedRun);
        this.runLocks.delete(runId);
        return {
          playerMove: { isValid: true, move: playerMove, message: `+${playerScoring.finalScore} pts` },
          botMove: {
            isValid: false,
            move: createSoloMove(updatedRun.currentTurn, { name: 'BOT_FAIL' }, canonicalArtist, false, undefined, 'OTHER'),
            message: 'Le bot ne trouve pas de réponse !',
            artistName: '',
          },
          run: finishedRun,
          gameOver: true,
          winner: 'player',
        };
      }

      // Le bot joue
      const botScoring = this.calculateScore(Math.floor(Math.random() * 15) + 3, updatedRun.currentTurn);
      const botMove = createSoloMove(
        updatedRun.currentTurn, botChoice,
        updatedRun.currentArtist || updatedRun.seedArtist,
        true, 'local_store', undefined, botScoring
      );

      const finalRun: BotGameRun = {
        ...updatedRun,
        currentArtist: botChoice,
        usedArtists: [...updatedRun.usedArtists, String(botChoice.gameId)],
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
          message: `Le bot propose "${botChoice.name}" (+${botScoring.finalScore} pts)`,
          artistName: botChoice.name,
        },
        run: finalRun,
        gameOver: false,
      };
    } catch (error) {
      this.runLocks.delete(runId);
      console.error('Erreur coup bot:', error);
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

  private calculateScore(timeSpentSeconds: number, currentTurn: number): {
    basePoints: number; pairBonus: number; degreeBonus: number;
    categoryBonus: number; timeBonus: number; chainBonus: number;
    finalScore: number; pairFamilyCount: number; degree: number;
    category: 'ultra_mainstream' | 'mainstream' | 'connu' | 'niche' | 'underground';
    timeSpent: number; chainLength: number;
  } {
    const timeBonus = timeSpentSeconds <= 5 ? 20 :
                      timeSpentSeconds <= 10 ? 12 :
                      timeSpentSeconds <= 20 ? 6 : 0;

    const palier = Math.floor((currentTurn - 1) / 5);
    const chainBonus = Math.min(20, 5 * palier);

    const finalScore = Math.min(100 + timeBonus + chainBonus, 280);

    return {
      basePoints: 100, pairBonus: 0, degreeBonus: 0, categoryBonus: 0,
      timeBonus, chainBonus, finalScore,
      pairFamilyCount: 0, degree: 0, category: 'underground' as const,
      timeSpent: timeSpentSeconds, chainLength: currentTurn,
    };
  }

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

  private scheduleTurnTimer(runId: string, run: BotGameRun): void {
    this.clearTurnTimer(runId);
    if (run.status !== SoloRunStatus.IN_PROGRESS || !run.currentTurnEndsAt) return;
    const timeRemaining = run.currentTurnEndsAt - Date.now();
    if (timeRemaining <= 0) { this.handleTurnTimeout(runId); return; }
    const timeout = setTimeout(() => this.handleTurnTimeout(runId), timeRemaining);
    this.runTimers.set(runId, timeout);
  }

  private handleTurnTimeout(runId: string): void {
    const run = this.runs.get(runId);
    if (!run || run.status !== SoloRunStatus.IN_PROGRESS) return;
    if (run.isPlayerTurn) this.endGame(run, 'bot', 'TIMEOUT');
  }

  private clearTurnTimer(runId: string): void {
    const timeout = this.runTimers.get(runId);
    if (timeout) { clearTimeout(timeout); this.runTimers.delete(runId); }
  }

  getRun(runId: string): BotGameRun | null {
    return this.runs.get(runId) || null;
  }
}

export const botManager = new BotManager();
