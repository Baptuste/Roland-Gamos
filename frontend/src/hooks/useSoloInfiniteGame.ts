import { useState, useEffect, useCallback } from 'react';
import { SoloRun, SoloRunStatus } from '../shared/types';
import { soloService } from '../shared/services/SoloService';

export function useSoloInfiniteGame() {
  const [run, setRun] = useState<SoloRun | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  // Mettre à jour le timer toutes les 100ms
  useEffect(() => {
    if (!run || run.status !== SoloRunStatus.IN_PROGRESS || !run.currentTurnEndsAt) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((run.currentTurnEndsAt! - now) / 1000));
      setTimeRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);

    return () => clearInterval(interval);
  }, [run?.currentTurnEndsAt, run?.status]);

  const startRun = useCallback(async (playerName: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const newRun = await soloService.startRun(playerName);
      setRun(newRun);
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
      return result;
    } catch (err: any) {
      const errorMessage = err.message || 'Erreur lors du traitement du coup';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [run]);

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
