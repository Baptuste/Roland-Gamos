import { useState, useEffect, useCallback, useRef } from 'react';
import { SoloRun, SoloRunStatus } from '../shared/types';
import { soloService } from '../shared/services/SoloService';

export function useSoloInfiniteGame() {
  const [run, setRun] = useState<SoloRun | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const timeoutCheckDoneRef = useRef<boolean>(false);

  const refreshRun = useCallback(async () => {
    if (!run) {
      return;
    }

    try {
      const updatedRun = await soloService.getRun(run.id);
      setRun(updatedRun);
    } catch (err: any) {
      console.error('Erreur lors du rafraîchissement de la run:', err);
    }
  }, [run?.id]);

  // Mettre à jour le timer toutes les 100ms et vérifier l'expiration
  useEffect(() => {
    if (!run || run.status !== SoloRunStatus.IN_PROGRESS || !run.currentTurnEndsAt) {
      setTimeRemaining(null);
      timeoutCheckDoneRef.current = false;
      return;
    }

    // Réinitialiser le flag quand une nouvelle run commence
    if (run.currentTurn === 0 || run.moves.length === 0) {
      timeoutCheckDoneRef.current = false;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((run.currentTurnEndsAt! - now) / 1000));
      setTimeRemaining(remaining);

      // Si le temps est écoulé et qu'on n'a pas encore vérifié, rafraîchir l'état
      if (remaining === 0 && !timeoutCheckDoneRef.current && run.status === SoloRunStatus.IN_PROGRESS) {
        timeoutCheckDoneRef.current = true;
        // Le serveur devrait avoir géré le timeout, on rafraîchit l'état après un court délai
        setTimeout(() => {
          if (run && run.id) {
            refreshRun();
          }
        }, 500); // Petit délai pour laisser le serveur traiter le timeout
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);

    return () => clearInterval(interval);
  }, [run?.currentTurnEndsAt, run?.status, run?.id, run?.currentTurn, run?.moves.length, refreshRun]);

  const startRun = useCallback(async (playerName: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const newRun = await soloService.startRun(playerName);
      setRun(newRun);
      timeoutCheckDoneRef.current = false;
    } catch (err: any) {
      setError(err.message || 'Erreur lors du démarrage de la run');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const makeMove = useCallback(async (artistName: string) => {
    if (!run) {
      throw new Error('Aucune run en cours');
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await soloService.makeMove(run.id, artistName);
      setRun(result.run);
      // Réinitialiser le flag après un coup valide
      if (result.isValid) {
        timeoutCheckDoneRef.current = false;
      }
      return result;
    } catch (err: any) {
      const errorMessage = err.message || 'Erreur lors du traitement du coup';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [run]);

  return {
    run,
    isLoading,
    error,
    timeRemaining,
    startRun,
    makeMove,
    refreshRun,
  };
}
