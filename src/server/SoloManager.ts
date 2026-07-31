import { SoloRun, SoloRunStatus, createSoloRun } from '../types/SoloRun';
import { SoloMove, createSoloMove } from '../types/SoloMove';
import { CanonicalArtist } from '../types/Game';
import { gameDataStore } from '../services/GameDataStore';
import { scoringService, ArtistCategory } from '../services/ScoringService';
import { meetsMinCategory } from '../config/soloArtistFilter';

const TURN_DURATION_MS = 30000;

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
    const artist = gameDataStore.getRandomSeedArtist(a => meetsMinCategory(a.category));
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

      // --- Coup valide : calcul du score (formule unifiée ScoringService) ---
      const collab = prevGameId ? gameDataStore.getCollaboration(prevGameId, resolvedProposed.id) : null;

      const scoring = scoringService.calculateScore({
        category: (resolvedProposed.category as ArtistCategory) ?? 'underground',
        collabDegree: resolvedProposed.collab_degree ?? 0,
        pairFamilyCount: collab?.pair_family_count ?? 0,
        turnNumber: run.currentTurn,
        fractionElapsed: timeSpentSeconds / (TURN_DURATION_MS / 1000),
      });

      const validMove = createSoloMove(run.currentTurn, canonical, previousArtist, true, 'local_store', undefined, scoring);

      const updatedRun: SoloRun = {
        ...run,
        currentArtist: canonical,
        usedArtists: [...run.usedArtists, canonicalKey],
        moves: [...run.moves, validMove],
        totalScore: run.totalScore + scoring.finalScore,
        overflowCount: run.overflowCount + (scoring.overflow > 0 ? 1 : 0),
        overflowXpBonus: run.overflowXpBonus + scoring.overflow,
        currentTurn: run.currentTurn + 1,
        currentTurnEndsAt: Date.now() + TURN_DURATION_MS,
      };

      this.runs.set(runId, updatedRun);
      this.scheduleTurnTimer(runId, updatedRun);
      this.runLocks.delete(runId);

      return { isValid: true, move: validMove, run: updatedRun, message: `Coup valide ! +${scoring.finalScore} points` };

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
}

export const soloManager = new SoloManager();
