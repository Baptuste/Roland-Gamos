import { SoloMove } from '../types/SoloMove';
import { BACKEND_URL as API_BASE_URL } from '../../services/backendUrl';

export interface BotGameRun {
  id: string;
  status: 'in_progress' | 'finished';
  playerName: string;
  seedArtist: { name: string; mbid?: string };
  currentArtist: { name: string; mbid?: string } | null;
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

export class BotService {
  async startGame(playerName: string): Promise<BotGameRun> {
    const response = await fetch(`${API_BASE_URL}/api/solo/bot/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur lors du démarrage de la partie');
    }

    const data = await response.json();
    return data.run;
  }

  async makeMove(runId: string, artistName: string): Promise<BotGameMoveResult> {
    const response = await fetch(`${API_BASE_URL}/api/solo/bot/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, artistName }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur lors du traitement du coup');
    }

    return await response.json();
  }

  async getRun(runId: string): Promise<BotGameRun> {
    const response = await fetch(`${API_BASE_URL}/api/solo/bot/run/${runId}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erreur lors de la récupération de la partie');
    }

    const data = await response.json();
    return data.run;
  }
}

export const botService = new BotService();
