import { SoloRun } from '../types/SoloRun';
import { BACKEND_URL as API_BASE_URL } from '../../services/backendUrl';

export interface SoloMoveResult {
  isValid: boolean;
  move: any; // SoloMove
  run: SoloRun;
  message: string;
}

export class SoloService {
  /**
   * Démarre une nouvelle run solo infinie
   */
  async startRun(playerName: string): Promise<SoloRun> {
    const response = await fetch(`${API_BASE_URL}/api/solo/infinite/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ playerName }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur lors du démarrage de la run');
    }

    const data = await response.json();
    return data.run;
  }

  /**
   * Propose un artiste pour le tour actuel
   */
  async makeMove(runId: string, artistName: string): Promise<SoloMoveResult> {
    const response = await fetch(`${API_BASE_URL}/api/solo/infinite/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ runId, artistName }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur lors du traitement du coup');
    }

    return await response.json();
  }

  /**
   * Récupère l'état actuel d'une run
   */
  async getRun(runId: string): Promise<SoloRun> {
    const response = await fetch(`${API_BASE_URL}/api/solo/infinite/run/${runId}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur lors de la récupération de la run');
    }

    const data = await response.json();
    return data.run;
  }
}

export const soloService = new SoloService();
