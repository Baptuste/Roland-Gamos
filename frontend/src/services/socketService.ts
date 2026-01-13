import { io, Socket } from 'socket.io-client';
import { Game, Player } from '../shared/types';

const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:3001';

export interface SocketEvents {
  // Événements émis par le client
  'create-game': (data: { playerName: string }) => void;
  'join-game': (data: { gameCode: string; playerName: string }) => void;
  'start-game': (data: { gameId: string }) => void;
  'reset-game': (data: { gameId: string }) => void;
  'propose-artist': (data: { gameId: string; artistName: string }) => void;
  'get-game-state': (data: { gameId: string }) => void;
  'get-game-code': (data: { gameId: string }) => void;
  'reconnect-game': (data: { gameCode: string; playerId: string }) => void;

  // Événements reçus du serveur
  'game-created': (data: { gameId: string; gameCode: string; player: Player; game: Game }) => void;
  'game-joined': (data: { player: Player; game: Game }) => void;
  'game-reconnected': (data: { player: Player; game: Game }) => void;
  'player-joined': (data: { player: Player; game: Game }) => void;
  'game-started': (data: { game: Game }) => void;
  'game-reset': (data: { game: Game; gameCode: string }) => void;
  'game-updated': (data: {
    game: Game;
    turn: any;
    message: string;
    isValid: boolean;
  }) => void;
  'game-state': (data: { game: Game; gameCode?: string }) => void;
  'game-code': (data: { gameId: string; gameCode: string }) => void;
  'error': (data: { message: string }) => void;
}

/**
 * Service pour gérer la connexion WebSocket
 */
export class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();

  /**
   * Se connecter au serveur
   */
  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    // Réenregistrer tous les listeners existants
    for (const [event, handlers] of this.listeners.entries()) {
      handlers.forEach((handler) => {
        this.socket?.on(event, handler as any);
      });
    }

    this.socket.on('connect', () => {
      console.log('Connecté au serveur WebSocket');
    });

    this.socket.on('disconnect', () => {
      console.log('Déconnecté du serveur WebSocket');
    });

    this.socket.on('error', (error: any) => {
      // Ne pas logger toutes les erreurs, seulement celles importantes
      // Les erreurs de reconnexion sont normales si la partie n'existe plus
      const message = error?.message || '';
      if (!message.includes('reconnect') && !message.includes('Code de partie invalide') && !message.includes('partie introuvable')) {
        console.error('Erreur WebSocket:', error);
      }
    });
  }

  /**
   * Se déconnecter du serveur
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Écouter un événement
   */
  on<K extends keyof SocketEvents>(
    event: K,
    handler: SocketEvents[K]
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    if (this.socket) {
      this.socket.on(event, handler as any);
    }
  }

  /**
   * Arrêter d'écouter un événement
   */
  off<K extends keyof SocketEvents>(
    event: K,
    handler: SocketEvents[K]
  ): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }

    if (this.socket) {
      this.socket.off(event, handler as any);
    }
  }

  /**
   * Émettre un événement
   */
  emit<K extends keyof SocketEvents>(
    event: K,
    ...args: Parameters<SocketEvents[K]>
  ): void {
    if (!this.socket?.connected) {
      console.error('Socket non connecté');
      return;
    }

    this.socket.emit(event, ...args);
  }

  /**
   * Vérifier si connecté
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Obtenir l'ID du socket
   */
  getSocketId(): string | undefined {
    return this.socket?.id;
  }
}

// Instance singleton
export const socketService = new SocketService();
