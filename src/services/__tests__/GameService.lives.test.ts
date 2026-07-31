import { GameService } from '../GameService';
import { createGame, GameStatus } from '../../types/Game';
import { createPlayer } from '../../types/Player';

describe('GameService — système de vies (lobby Phase A)', () => {
  const service = new GameService();

  it('un joueur avec plusieurs vies ne devient éliminé qu\'à sa dernière vie', () => {
    const p1 = createPlayer('p1', 'Alice', 2);
    const p2 = createPlayer('p2', 'Bob', 2);
    let game = createGame('g1', [p1, p2], { turnDurationMs: 30000, maxLives: 2, jokersEnabled: false, teamsEnabled: false, teamCount: 2, eliminationMode: 'vies', jokerSelectionMode: 'aleatoire', hintsEnabled: true });

    game = service.eliminatePlayer(game, 'p1', 'REPEAT');
    const afterFirstHit = game.players.find(p => p.id === 'p1')!;
    expect(afterFirstHit.livesRemaining).toBe(1);
    expect(afterFirstHit.isEliminated).toBe(false);
    expect(game.status).not.toBe(GameStatus.FINISHED);

    game = service.eliminatePlayer(game, 'p1', 'REPEAT');
    const afterSecondHit = game.players.find(p => p.id === 'p1')!;
    expect(afterSecondHit.livesRemaining).toBe(0);
    expect(afterSecondHit.isEliminated).toBe(true);
  });

  it('avec maxLives=1 (défaut), une perte de vie élimine immédiatement — comportement historique préservé', () => {
    const p1 = createPlayer('p1', 'Alice', 1);
    const p2 = createPlayer('p2', 'Bob', 1);
    let game = createGame('g2', [p1, p2]); // settings par défaut = maxLives 1

    game = service.eliminatePlayer(game, 'p1', 'TIMEOUT');
    const player = game.players.find(p => p.id === 'p1')!;
    expect(player.isEliminated).toBe(true);
    expect(game.status).toBe(GameStatus.FINISHED); // un seul joueur actif restant
  });

  it('un joueur qui survit à une perte de vie laisse la partie continuer normalement (le tour peut passer au suivant)', () => {
    const p1 = createPlayer('p1', 'Alice', 2);
    const p2 = createPlayer('p2', 'Bob', 2);
    const p3 = createPlayer('p3', 'Carol', 2);
    let game = createGame('g3', [p1, p2, p3], { turnDurationMs: 30000, maxLives: 2, jokersEnabled: false, teamsEnabled: false, teamCount: 2, eliminationMode: 'vies', jokerSelectionMode: 'aleatoire', hintsEnabled: true });
    game = service.startGame(game);
    expect(game.currentPlayerIndex).toBe(0);

    const damaged = service.eliminatePlayer(game, 'p1', 'REPEAT');
    expect(damaged.players[0].isEliminated).toBe(false);
    expect(damaged.status).toBe(GameStatus.IN_PROGRESS);

    const advanced = service.moveToNextPlayer(damaged);
    expect(advanced.currentPlayerIndex).toBe(1); // passe à Bob
    expect(advanced.status).toBe(GameStatus.IN_PROGRESS);
  });

  it('startTurn utilise la durée de tour configurée dans game.settings', () => {
    const p1 = createPlayer('p1', 'Alice', 1);
    const p2 = createPlayer('p2', 'Bob', 1);
    const game = createGame('g4', [p1, p2], { turnDurationMs: 15000, maxLives: 1, jokersEnabled: false, teamsEnabled: false, teamCount: 2, eliminationMode: 'vies', jokerSelectionMode: 'aleatoire', hintsEnabled: true });
    const started = service.startTurn({ ...game, status: GameStatus.IN_PROGRESS });
    const remaining = (started.currentTurnEndsAt || 0) - Date.now();
    expect(remaining).toBeGreaterThan(14000);
    expect(remaining).toBeLessThanOrEqual(15000);
  });
});
