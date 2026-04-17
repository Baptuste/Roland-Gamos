import { SoloRun, SoloRunStatus, createSoloRun } from '../types/SoloRun';
import { SoloMove, createSoloMove } from '../types/SoloMove';
import { CanonicalArtist } from '../types/Game';
import { gameDataStore } from '../services/GameDataStore';

const TURN_DURATION_MS = 30000;
const BASE_POINTS = 100;
const SCORE_CAP = 280;

export interface SoloMoveResult {
  isValid: boolean;
  move: SoloMove;
  run: SoloRun;
  message: string;
}

export class SoloManager {
  private runs: Map<string, SoloRun> = new Map();
  private runTimers: Map<string, NodeJS.Timeout> = new Map();
  private runLocks: Map<string, boolean> = new Map();

  // -------------------------------------------------------
  // Seed artist
  // -------------------------------------------------------

  private chooseSeedArtist(): CanonicalArtist {
    const artist = gameDataStore.getRandomSeedArtist();
    if (!artist) {
      // Fallback si le store est vide (ne devrait pas arriver)
      return { name: 'Booba' };
    }
    return { name: artist.name, gameId: artist.id };
  }

  // -------------------------------------------------------
  // Public API
  // -------------------------------------------------------

  async startRun(playerName: string): Promise<SoloRun> {
    // S'assurer que le store est chargé
    await gameDataStore.initialize();

    const runId = `solo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const seedArtist = this.chooseSeedArtist();
    const run = createSoloRun(runId, playerName, seedArtist);
    // Utiliser le gameId comme clé canonique (cohérent avec les coups suivants)
    run.usedArtists = [String(seedArtist.gameId ?? seedArtist.name)];
    run.currentTurnEndsAt = Date.now() + TURN_DURATION_MS;
    this.runs.set(runId, run);
    this.scheduleTurnTimer(runId, run);

    console.log(`Run solo créée: ${runId}, joueur: ${playerName}, seed: ${seedArtist.name}`);
    return run;
  }

  async makeMove(runId: string, artistName: string): Promise<SoloMoveResult> {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Run ${runId} introuvable`);

    // Anti double-submit
    if (this.runLocks.get(runId)) {
      return {
        isValid: false,
        move: createSoloMove(run.currentTurn, { name: artistName }, run.currentArtist || run.seedArtist, false, undefined, 'OTHER'),
        run,
        message: 'Un coup est déjà en cours de traitement',
      };
    }

    if (run.status !== SoloRunStatus.IN_PROGRESS) {
      return {
        isValid: false,
        move: createSoloMove(run.currentTurn, { name: artistName }, run.currentArtist || run.seedArtist, false, undefined, 'OTHER'),
        run,
        message: 'La run est terminée',
      };
    }

    if (this.isTurnExpired(run)) {
      this.handleTurnTimeout(runId);
      const updatedRun = this.runs.get(runId)!;
      return {
        isValid: false,
        move: createSoloMove(run.currentTurn, { name: artistName }, run.currentArtist || run.seedArtist, false, undefined, 'TIMEOUT'),
        run: updatedRun,
        message: 'Temps écoulé. Run terminée.',
      };
    }

    this.runLocks.set(runId, true);

    try {
      const previousArtist = run.currentArtist || run.seedArtist;
      const turnStartTime = run.currentTurnEndsAt ? run.currentTurnEndsAt - TURN_DURATION_MS : run.startedAt;
      const timeSpentSeconds = Math.floor((Date.now() - turnStartTime) / 1000);

      // --- Résolution via GameDataStore (zéro appel réseau) ---
      const resolvedProposed = gameDataStore.resolveArtist(artistName);

      if (!resolvedProposed) {
        return this.finishRun(run, runId, {
          isValid: false,
          move: createSoloMove(run.currentTurn, { name: artistName }, previousArtist, false, undefined, 'NOT_FOUND'),
          message: `Artiste "${artistName}" introuvable dans la base. Run terminée.`,
          endReason: 'INVALID_FEAT',
        });
      }

      const canonical: CanonicalArtist = { name: resolvedProposed.name, gameId: resolvedProposed.id };

      // Vérification répétition
      const canonicalKey = String(resolvedProposed.id);
      if (run.usedArtists.includes(canonicalKey)) {
        return this.finishRun(run, runId, {
          isValid: false,
          move: createSoloMove(run.currentTurn, canonical, previousArtist, false, undefined, 'REPEAT'),
          message: `"${canonical.name}" déjà utilisé. Run terminée.`,
          endReason: 'REPEAT',
        });
      }

      // Vérification collaboration
      const prevGameId = previousArtist.gameId ?? gameDataStore.resolveArtist(previousArtist.name)?.id;
      if (!prevGameId || !gameDataStore.haveCollaborated(prevGameId, resolvedProposed.id)) {
        return this.finishRun(run, runId, {
          isValid: false,
          move: createSoloMove(run.currentTurn, canonical, previousArtist, false, undefined, 'INVALID_FEAT'),
          message: `Aucune collaboration trouvée entre "${previousArtist.name}" et "${canonical.name}". Run terminée.`,
          endReason: 'INVALID_FEAT',
        });
      }

      // --- Coup valide : calcul du score ---
      const collab = prevGameId ? gameDataStore.getCollaboration(prevGameId, resolvedProposed.id) : null;
      const pairBonus = collab?.pair_bonus ?? 0;
      const categoryBonus = resolvedProposed.category_bonus ?? 0;
      const degreeBonus = resolvedProposed.degree_bonus ?? 0;
      const timeBonus = this.calculateTimeBonus(timeSpentSeconds);
      const chainBonus = this.calculateChainBonus(run.currentTurn);

      const rawScore = BASE_POINTS + categoryBonus + degreeBonus + pairBonus + timeBonus + chainBonus;
      const finalScore = Math.min(Math.round(rawScore), SCORE_CAP);

      const scoring = {
        basePoints: BASE_POINTS,
        pairBonus,
        degreeBonus,
        categoryBonus,
        timeBonus,
        chainBonus,
        finalScore,
        pairFamilyCount: collab?.song_count ?? 0,
        degree: resolvedProposed.degree_bonus ?? 0,
        category: (resolvedProposed.category as any) ?? 'underground',
        timeSpent: timeSpentSeconds,
        chainLength: run.currentTurn,
      };

      const validMove = createSoloMove(run.currentTurn, canonical, previousArtist, true, 'local_store', undefined, scoring);

      const updatedRun: SoloRun = {
        ...run,
        currentArtist: canonical,
        usedArtists: [...run.usedArtists, canonicalKey],
        moves: [...run.moves, validMove],
        totalScore: run.totalScore + finalScore,
        currentTurn: run.currentTurn + 1,
        currentTurnEndsAt: Date.now() + TURN_DURATION_MS,
      };

      this.runs.set(runId, updatedRun);
      this.scheduleTurnTimer(runId, updatedRun);
      this.runLocks.delete(runId);

      return { isValid: true, move: validMove, run: updatedRun, message: `Coup valide ! +${finalScore} points` };

    } catch (error) {
      this.runLocks.delete(runId);
      console.error(`Erreur lors du traitement du coup pour la run ${runId}:`, error);

      const errorMove = createSoloMove(run.currentTurn, { name: artistName }, run.currentArtist || run.seedArtist, false, undefined, 'OTHER');
      const finishedRun: SoloRun = { ...run, status: SoloRunStatus.FINISHED, moves: [...run.moves, errorMove], endedAt: Date.now(), endReason: 'OTHER' };
      this.runs.set(runId, finishedRun);
      this.clearTurnTimer(runId);

      return { isValid: false, move: errorMove, run: finishedRun, message: 'Erreur lors de la validation. Run terminée.' };
    }
  }

  getRun(runId: string): SoloRun | null {
    return this.runs.get(runId) || null;
  }

  deleteRun(runId: string): void {
    this.clearTurnTimer(runId);
    this.runLocks.delete(runId);
    this.runs.delete(runId);
  }

  // -------------------------------------------------------
  // Helpers privés
  // -------------------------------------------------------

  private finishRun(
    run: SoloRun,
    runId: string,
    result: { isValid: false; move: SoloMove; message: string; endReason: SoloRun['endReason'] }
  ): SoloMoveResult {
    const finishedRun: SoloRun = {
      ...run,
      status: SoloRunStatus.FINISHED,
      moves: [...run.moves, result.move],
      endedAt: Date.now(),
      endReason: result.endReason,
    };
    this.runs.set(runId, finishedRun);
    this.clearTurnTimer(runId);
    this.runLocks.delete(runId);
    return { isValid: false, move: result.move, run: finishedRun, message: result.message };
  }

  private scheduleTurnTimer(runId: string, run: SoloRun): void {
    this.clearTurnTimer(runId);
    if (run.status !== SoloRunStatus.IN_PROGRESS || !run.currentTurnEndsAt) return;

    const timeRemaining = run.currentTurnEndsAt - Date.now();
    if (timeRemaining <= 0) { this.handleTurnTimeout(runId); return; }

    this.runTimers.set(runId, setTimeout(() => this.handleTurnTimeout(runId), timeRemaining));
  }

  private handleTurnTimeout(runId: string): void {
    const run = this.runs.get(runId);
    if (!run || run.status !== SoloRunStatus.IN_PROGRESS) return;

    const timeoutMove = createSoloMove(run.currentTurn, { name: 'TIMEOUT' }, run.currentArtist || run.seedArtist, false, undefined, 'TIMEOUT');
    this.runs.set(runId, { ...run, status: SoloRunStatus.FINISHED, moves: [...run.moves, timeoutMove], endedAt: Date.now(), endReason: 'TIMEOUT' });
    this.clearTurnTimer(runId);
  }

  private clearTurnTimer(runId: string): void {
    const handle = this.runTimers.get(runId);
    if (handle) { clearTimeout(handle); this.runTimers.delete(runId); }
  }

  private isTurnExpired(run: SoloRun): boolean {
    return !!run.currentTurnEndsAt && Date.now() >= run.currentTurnEndsAt;
  }

  // TimeBonus : basé sur % du timer écoulé (timer = 30s)
  private calculateTimeBonus(seconds: number): number {
    const pct = seconds / 30;
    if (pct < 0.20) return 50;
    if (pct < 0.40) return 35;
    if (pct < 0.60) return 20;
    if (pct < 0.80) return 10;
    return 0;
  }

  // ChainBonus : bonus additif selon longueur de chaîne
  private calculateChainBonus(chainLength: number): number {
    if (chainLength >= 20) return 60;
    if (chainLength >= 15) return 40;
    if (chainLength >= 10) return 25;
    if (chainLength >= 5)  return 10;
    return 0;
  }
}

export const soloManager = new SoloManager();
