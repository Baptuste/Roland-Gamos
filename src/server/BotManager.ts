import { CanonicalArtist } from '../types/Game';
import { SoloMove, createSoloMove } from '../types/SoloMove';
import { SoloRunStatus } from '../types/SoloRun';
import { gameDataStore } from '../services/GameDataStore';
import { scoringService, ArtistCategory } from '../services/ScoringService';

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
  overflowCount: number;
  overflowXpBonus: number;
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
      overflowCount: 0,
      overflowXpBonus: 0,
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
      const playerCollab = gameDataStore.getCollaboration(prevId, resolved.id);
      const playerScoring = scoringService.calculateScore({
        category: (resolved.category as ArtistCategory) ?? 'underground',
        collabDegree: resolved.collab_degree ?? 0,
        pairFamilyCount: playerCollab?.pair_family_count ?? 0,
        turnNumber: run.currentTurn,
        fractionElapsed: timeSpentSeconds / (TURN_DURATION_MS / 1000),
      });
      const playerMove = createSoloMove(
        run.currentTurn, canonicalArtist, previousArtist, true, 'local_store', undefined, playerScoring
      );

      let updatedRun: BotGameRun = {
        ...run,
        currentArtist: canonicalArtist,
        usedArtists: [...run.usedArtists, String(resolved.id)],
        playerMoves: [...run.playerMoves, playerMove],
        playerScore: run.playerScore + playerScoring.finalScore,
        overflowCount: run.overflowCount + (playerScoring.overflow > 0 ? 1 : 0),
        overflowXpBonus: run.overflowXpBonus + playerScoring.overflow,
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
      const botPrevId = canonicalArtist.gameId!;
      const botCollab = gameDataStore.getCollaboration(botPrevId, botChoice.gameId!);
      const botArtist = gameDataStore.getArtistById(botChoice.gameId!);
      const botScoring = scoringService.calculateScore({
        category: (botArtist?.category as ArtistCategory) ?? 'underground',
        collabDegree: botArtist?.collab_degree ?? 0,
        pairFamilyCount: botCollab?.pair_family_count ?? 0,
        turnNumber: updatedRun.currentTurn,
        fractionElapsed: (Math.floor(Math.random() * 15) + 3) / (TURN_DURATION_MS / 1000),
      });
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
