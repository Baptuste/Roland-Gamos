import { SoloRun, SoloRunStatus, createSoloRun } from '../types/SoloRun';
import { SoloMove, createSoloMove } from '../types/SoloMove';
import { CanonicalArtist } from '../types/Game';
import { ValidationService } from '../services/ValidationService';
import { MusicBrainzService } from '../services/MusicBrainzService';
import { WikidataService } from '../services/WikidataService';
import { scoringService } from '../services/ScoringService';

/**
 * Durée d'un tour en millisecondes (30 secondes)
 */
const TURN_DURATION_MS = 30000;

/**
 * Liste de rappeurs français populaires pour démarrer une run solo
 * Ces artistes doivent être bien connus et avoir beaucoup de collaborations
 */
const SEED_ARTISTS = [
  'Booba',
  'Kaaris',
  'Damso',
  'PNL',
  'Nekfeu',
  'Orelsan',
  'Vald',
  'Lomepal',
  'SCH',
  'Laylow',
  'Ninho',
  'Jul',
  'Gims',
  'Soprano',
  'Maître Gims',
  'Bigflo & Oli',
  'IAM',
  'MC Solaar',
  'Oxmo Puccino',
  'La Fouine',
];

/**
 * Résultat d'un coup dans une run solo
 */
export interface SoloMoveResult {
  isValid: boolean;
  move: SoloMove;
  run: SoloRun;
  message: string;
}

/**
 * Gestionnaire de runs solo infinies
 * Stocke les runs en mémoire et gère les timers
 */
export class SoloManager {
  private runs: Map<string, SoloRun> = new Map();
  private runTimers: Map<string, NodeJS.Timeout> = new Map(); // runId -> timeout handle
  private runLocks: Map<string, boolean> = new Map(); // runId -> isProcessing (anti double-submit)
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
   * Choisit un artiste seed aléatoire depuis la liste
   */
  private async chooseSeedArtist(): Promise<CanonicalArtist> {
    const randomIndex = Math.floor(Math.random() * SEED_ARTISTS.length);
    const seedName = SEED_ARTISTS[randomIndex];

    // Résoudre l'artiste pour obtenir son identité canonique
    const resolved = await this.musicBrainzService.resolveArtist(seedName);
    if (!resolved) {
      // Fallback : utiliser le nom tel quel si résolution échoue
      console.warn(`Impossible de résoudre l'artiste seed "${seedName}", utilisation du nom tel quel`);
      return { name: seedName };
    }

    return {
      name: resolved.canonicalName,
      mbid: resolved.mbid,
    };
  }

  /**
   * Crée une nouvelle run solo infinie
   */
  async startRun(playerName: string): Promise<SoloRun> {
    const runId = `solo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const seedArtist = await this.chooseSeedArtist();

    const run = createSoloRun(runId, playerName, seedArtist);
    
    // Définir le timer pour le premier tour
    run.currentTurnEndsAt = Date.now() + TURN_DURATION_MS;
    
    this.runs.set(runId, run);
    this.scheduleTurnTimer(runId, run);

    console.log(`Run solo créée: ${runId}, joueur: ${playerName}, seed: ${seedArtist.name}`);

    return run;
  }

  /**
   * Programme un timer pour le tour actuel
   */
  private scheduleTurnTimer(runId: string, run: SoloRun): void {
    // Annuler le timer existant s'il y en a un
    this.clearTurnTimer(runId);

    if (run.status !== SoloRunStatus.IN_PROGRESS || !run.currentTurnEndsAt) {
      return;
    }

    const now = Date.now();
    const timeRemaining = run.currentTurnEndsAt - now;

    if (timeRemaining <= 0) {
      // Le temps est déjà écoulé, traiter immédiatement
      this.handleTurnTimeout(runId);
      return;
    }

    // Programmer le timeout
    const timeoutHandle = setTimeout(() => {
      this.handleTurnTimeout(runId);
    }, timeRemaining);

    this.runTimers.set(runId, timeoutHandle);
  }

  /**
   * Gère l'expiration du timer d'un tour
   */
  private handleTurnTimeout(runId: string): void {
    const run = this.runs.get(runId);
    if (!run || run.status !== SoloRunStatus.IN_PROGRESS) {
      return;
    }

    console.log(`Timer expiré pour la run ${runId}, tour ${run.currentTurn}`);

    // Créer un coup invalide pour timeout
    const timeoutMove = createSoloMove(
      run.currentTurn,
      { name: 'TIMEOUT' }, // Artiste fictif pour timeout
      run.currentArtist || run.seedArtist,
      false,
      undefined,
      'TIMEOUT'
    );

    // Finir la run
    const finishedRun: SoloRun = {
      ...run,
      status: SoloRunStatus.FINISHED,
      moves: [...run.moves, timeoutMove],
      endedAt: Date.now(),
      endReason: 'TIMEOUT',
    };

    this.runs.set(runId, finishedRun);
    this.clearTurnTimer(runId);
  }

  /**
   * Annule le timer d'un tour
   */
  private clearTurnTimer(runId: string): void {
    const timeoutHandle = this.runTimers.get(runId);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      this.runTimers.delete(runId);
    }
  }

  /**
   * Vérifie si le tour actuel est expiré
   */
  private isTurnExpired(run: SoloRun): boolean {
    if (!run.currentTurnEndsAt) {
      return false;
    }
    return Date.now() >= run.currentTurnEndsAt;
  }

  /**
   * Vérifie si un artiste a déjà été utilisé dans la run
   */
  private isArtistUsed(run: SoloRun, canonical: CanonicalArtist): boolean {
    const canonicalId = canonical.mbid || canonical.name;
    return run.usedArtists.some(used => 
      used.toLowerCase() === canonicalId.toLowerCase()
    );
  }

  /**
   * Obtient l'ID canonique d'un artiste
   */
  private getCanonicalId(canonical: CanonicalArtist): string {
    return canonical.mbid || canonical.name;
  }

  /**
   * Propose un artiste pour le tour actuel
   * Valide le coup, calcule le score, et termine la run si erreur
   */
  async makeMove(runId: string, artistName: string): Promise<SoloMoveResult> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run ${runId} introuvable`);
    }

    // Vérifier le lock (anti double-submit)
    if (this.runLocks.get(runId)) {
      return {
        isValid: false,
        move: createSoloMove(
          run.currentTurn,
          { name: artistName },
          run.currentArtist || run.seedArtist,
          false,
          undefined,
          'OTHER'
        ),
        run,
        message: 'Un coup est déjà en cours de traitement',
      };
    }

    // Vérifier que la run est en cours
    if (run.status !== SoloRunStatus.IN_PROGRESS) {
      return {
        isValid: false,
        move: createSoloMove(
          run.currentTurn,
          { name: artistName },
          run.currentArtist || run.seedArtist,
          false,
          undefined,
          'OTHER'
        ),
        run,
        message: 'La run est terminée',
      };
    }

    // Vérifier le timer
    if (this.isTurnExpired(run)) {
      this.handleTurnTimeout(runId);
      const updatedRun = this.runs.get(runId)!;
      return {
        isValid: false,
        move: createSoloMove(
          run.currentTurn,
          { name: artistName },
          run.currentArtist || run.seedArtist,
          false,
          undefined,
          'TIMEOUT'
        ),
        run: updatedRun,
        message: 'Temps écoulé. Run terminée.',
      };
    }

    // Activer le lock
    this.runLocks.set(runId, true);

    try {
      const previousArtist = run.currentArtist || run.seedArtist;
      const turnStartTime = run.currentTurnEndsAt ? run.currentTurnEndsAt - TURN_DURATION_MS : run.startedAt;
      const timeSpentSeconds = Math.floor((Date.now() - turnStartTime) / 1000);

      // Valider le mouvement
      const validation = await this.validationService.validateMove(
        previousArtist,
        artistName
      );

      // Vérifier si l'artiste existe
      if (!validation.exists) {
        this.runLocks.delete(runId);
        const invalidMove = createSoloMove(
          run.currentTurn,
          { name: artistName },
          previousArtist,
          false,
          undefined,
          'NOT_FOUND'
        );
        const finishedRun: SoloRun = {
          ...run,
          status: SoloRunStatus.FINISHED,
          moves: [...run.moves, invalidMove],
          endedAt: Date.now(),
          endReason: 'INVALID_FEAT',
        };
        this.runs.set(runId, finishedRun);
        this.clearTurnTimer(runId);
        return {
          isValid: false,
          move: invalidMove,
          run: finishedRun,
          message: `Artiste "${artistName}" introuvable. Run terminée.`,
        };
      }

      // Vérifier la répétition
      if (this.isArtistUsed(run, validation.canonical)) {
        this.runLocks.delete(runId);
        const invalidMove = createSoloMove(
          run.currentTurn,
          validation.canonical,
          previousArtist,
          false,
          validation.source,
          'REPEAT'
        );
        const finishedRun: SoloRun = {
          ...run,
          status: SoloRunStatus.FINISHED,
          moves: [...run.moves, invalidMove],
          endedAt: Date.now(),
          endReason: 'REPEAT',
        };
        this.runs.set(runId, finishedRun);
        this.clearTurnTimer(runId);
        return {
          isValid: false,
          move: invalidMove,
          run: finishedRun,
          message: `Artiste "${validation.canonical.name}" déjà utilisé. Run terminée.`,
        };
      }

      // Vérifier la relation (collaboration)
      if (!validation.validRelation) {
        this.runLocks.delete(runId);
        const invalidMove = createSoloMove(
          run.currentTurn,
          validation.canonical,
          previousArtist,
          false,
          validation.source,
          'INVALID_FEAT'
        );
        const finishedRun: SoloRun = {
          ...run,
          status: SoloRunStatus.FINISHED,
          moves: [...run.moves, invalidMove],
          endedAt: Date.now(),
          endReason: 'INVALID_FEAT',
        };
        this.runs.set(runId, finishedRun);
        this.clearTurnTimer(runId);
        return {
          isValid: false,
          move: invalidMove,
          run: finishedRun,
          message: `Aucune collaboration trouvée entre "${previousArtist.name}" et "${validation.canonical.name}". Run terminée.`,
        };
      }

      // Coup valide ! Calculer le score
      const previousMbid = previousArtist.mbid || '';
      const currentMbid = validation.canonical.mbid || '';
      
      if (!currentMbid) {
        // Si pas de MBID, on ne peut pas calculer le score précisément
        // Utiliser un score de base avec seulement timeBonus et chainBonus
        const timeBonus = timeSpentSeconds <= 5 ? 1.20 :
                          timeSpentSeconds <= 10 ? 1.12 :
                          timeSpentSeconds <= 20 ? 1.06 :
                          timeSpentSeconds <= 35 ? 1.02 : 1.00;
        
        const palier = Math.floor((run.currentTurn - 1) / 5);
        const chainBonus = 1 + Math.min(0.20, 0.05 * palier);
        
        const rawScore = 100 * 1.00 * 1.00 * 1.00 * timeBonus * chainBonus;
        const finalScore = Math.min(Math.round(rawScore), 280);
        
        const scoring = {
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
          chainLength: run.currentTurn,
        };
        
        const validMove = createSoloMove(
          run.currentTurn,
          validation.canonical,
          previousArtist,
          true,
          validation.source,
          undefined,
          scoring
        );

        const updatedRun: SoloRun = {
          ...run,
          currentArtist: validation.canonical,
          usedArtists: [...run.usedArtists, this.getCanonicalId(validation.canonical)],
          moves: [...run.moves, validMove],
          totalScore: run.totalScore + scoring.finalScore,
          currentTurn: run.currentTurn + 1,
          currentTurnEndsAt: Date.now() + TURN_DURATION_MS,
        };

        this.runs.set(runId, updatedRun);
        this.scheduleTurnTimer(runId, updatedRun);
        this.runLocks.delete(runId);

        return {
          isValid: true,
          move: validMove,
          run: updatedRun,
          message: `Coup valide ! +${scoring.finalScore} points`,
        };
      }

      // Calculer le score avec tous les bonus
      const scoring = scoringService.calculateScore(
        previousMbid,
        currentMbid,
        run.currentTurn,
        timeSpentSeconds
      );

      const validMove = createSoloMove(
        run.currentTurn,
        validation.canonical,
        previousArtist,
        true,
        validation.source,
        undefined,
        scoring
      );

      // Mettre à jour la run
      const updatedRun: SoloRun = {
        ...run,
        currentArtist: validation.canonical,
        usedArtists: [...run.usedArtists, this.getCanonicalId(validation.canonical)],
        moves: [...run.moves, validMove],
        totalScore: run.totalScore + scoring.finalScore,
        currentTurn: run.currentTurn + 1,
        currentTurnEndsAt: Date.now() + TURN_DURATION_MS,
      };

      this.runs.set(runId, updatedRun);
      this.scheduleTurnTimer(runId, updatedRun);
      this.runLocks.delete(runId);

      return {
        isValid: true,
        move: validMove,
        run: updatedRun,
        message: `Coup valide ! +${scoring.finalScore} points`,
      };
    } catch (error) {
      this.runLocks.delete(runId);
      console.error(`Erreur lors du traitement du coup pour la run ${runId}:`, error);
      
      const errorMove = createSoloMove(
        run.currentTurn,
        { name: artistName },
        run.currentArtist || run.seedArtist,
        false,
        undefined,
        'OTHER'
      );
      
      const finishedRun: SoloRun = {
        ...run,
        status: SoloRunStatus.FINISHED,
        moves: [...run.moves, errorMove],
        endedAt: Date.now(),
        endReason: 'OTHER',
      };
      
      this.runs.set(runId, finishedRun);
      this.clearTurnTimer(runId);
      
      return {
        isValid: false,
        move: errorMove,
        run: finishedRun,
        message: 'Erreur lors de la validation. Run terminée.',
      };
    }
  }

  /**
   * Obtient une run par son ID
   */
  getRun(runId: string): SoloRun | null {
    return this.runs.get(runId) || null;
  }

  /**
   * Supprime une run (utile pour le nettoyage)
   */
  deleteRun(runId: string): void {
    this.clearTurnTimer(runId);
    this.runLocks.delete(runId);
    this.runs.delete(runId);
  }
}

// Instance singleton
export const soloManager = new SoloManager();
