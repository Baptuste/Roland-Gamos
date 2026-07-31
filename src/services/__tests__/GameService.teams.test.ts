import { GameService } from '../GameService';
import { createGame, GameStatus } from '../../types/Game';
import { createPlayer } from '../../types/Player';

describe('GameService — mode équipe (Phase B)', () => {
  const service = new GameService();

  function withTeam(player: ReturnType<typeof createPlayer>, teamId: string) {
    return { ...player, teamId };
  }

  it('rotation alternée par équipe : chaque équipe garde son propre curseur interne', () => {
    const alice = withTeam(createPlayer('p1', 'Alice', 2), 'team-0');
    const bob = withTeam(createPlayer('p2', 'Bob', 2), 'team-0');
    const carol = withTeam(createPlayer('p3', 'Carol', 2), 'team-1');

    let game = createGame('g1', [alice, bob, carol], {
      turnDurationMs: 30000, maxLives: 2, jokersEnabled: false,
      teamsEnabled: true, teamCount: 2, eliminationMode: 'vies', jokerSelectionMode: 'aleatoire', hintsEnabled: true,
    });
    game = service.startGame(game);
    expect(game.players[game.currentPlayerIndex].name).toBe('Alice');

    game = service.moveToNextPlayer(game);
    expect(game.players[game.currentPlayerIndex].name).toBe('Carol');

    // Bob, pas Alice — le premier tour d'Alice (choisi par startGame) doit
    // avoir fait avancer le pointeur interne de team-0 vers Bob.
    game = service.moveToNextPlayer(game);
    expect(game.players[game.currentPlayerIndex].name).toBe('Bob');

    game = service.moveToNextPlayer(game);
    expect(game.players[game.currentPlayerIndex].name).toBe('Carol');

    game = service.moveToNextPlayer(game);
    expect(game.players[game.currentPlayerIndex].name).toBe('Alice');

    game = service.moveToNextPlayer(game);
    expect(game.players[game.currentPlayerIndex].name).toBe('Carol');
  });

  it('le premier joueur (choisi par startGame, hors moveToNextPlayer) fait bien avancer le pointeur de son équipe', () => {
    // Bug réel trouvé en test live : sans ce rattrapage dans startGame, le
    // 2e passage de l'équipe du premier joueur le faisait rejouer au lieu
    // de passer à son coéquipier.
    const alice = withTeam(createPlayer('p1', 'Alice', 2), 'team-0');
    const bob = withTeam(createPlayer('p2', 'Bob', 2), 'team-0');
    const carol = withTeam(createPlayer('p3', 'Carol', 2), 'team-1');

    let game = createGame('g5', [alice, bob, carol], {
      turnDurationMs: 30000, maxLives: 2, jokersEnabled: false,
      teamsEnabled: true, teamCount: 2, eliminationMode: 'vies', jokerSelectionMode: 'aleatoire', hintsEnabled: true,
    });
    game = service.startGame(game); // Alice (team-0) joue en premier

    game = service.moveToNextPlayer(game); // team-1 : Carol
    expect(game.players[game.currentPlayerIndex].name).toBe('Carol');

    game = service.moveToNextPlayer(game); // retour team-0 : doit être Bob, pas Alice
    expect(game.players[game.currentPlayerIndex].name).toBe('Bob');
  });

  it('mode VIES : un membre à 0 vies sort de la rotation mais l\'équipe survit si un coéquipier est actif', () => {
    const alice = withTeam(createPlayer('p1', 'Alice', 1), 'team-0');
    const bob = withTeam(createPlayer('p2', 'Bob', 1), 'team-0');
    const carol = withTeam(createPlayer('p3', 'Carol', 1), 'team-1');
    const dave = withTeam(createPlayer('p4', 'Dave', 1), 'team-1');

    let game = createGame('g2', [alice, bob, carol, dave], {
      turnDurationMs: 30000, maxLives: 1, jokersEnabled: false,
      teamsEnabled: true, teamCount: 2, eliminationMode: 'vies', jokerSelectionMode: 'aleatoire', hintsEnabled: true,
    });
    game = service.startGame(game);

    game = service.eliminatePlayer(game, 'p1', 'REPEAT'); // Alice éliminée (1 vie)
    expect(game.players.find(p => p.id === 'p1')!.isEliminated).toBe(true);
    expect(game.status).toBe(GameStatus.IN_PROGRESS); // Bob encore actif dans team-0

    game = service.eliminatePlayer(game, 'p2', 'REPEAT'); // Bob éliminé -> team-0 out
    expect(game.status).toBe(GameStatus.FINISHED); // une seule équipe active restante (team-1)
  });

  it('mode VIES : maxLives=2, une seule erreur ne doit éliminer ni le joueur ni son équipe', () => {
    const alice = withTeam(createPlayer('p1', 'Alice', 2), 'team-0');
    const bob = withTeam(createPlayer('p2', 'Bob', 2), 'team-1');

    let game = createGame('g4', [alice, bob], {
      turnDurationMs: 30000, maxLives: 2, jokersEnabled: false,
      teamsEnabled: true, teamCount: 2, eliminationMode: 'vies', jokerSelectionMode: 'aleatoire', hintsEnabled: true,
    });
    game = service.startGame(game);

    game = service.eliminatePlayer(game, 'p1', 'REPEAT');
    expect(game.players.find(p => p.id === 'p1')!.livesRemaining).toBe(1);
    expect(game.players.find(p => p.id === 'p1')!.isEliminated).toBe(false);
    expect(game.status).toBe(GameStatus.IN_PROGRESS);
  });

  it('mode ERREURS : le pool d\'équipe épuisé élimine toute l\'équipe d\'un coup, même avec des vies individuelles restantes', () => {
    const alice = withTeam(createPlayer('p1', 'Alice', 3), 'team-0');
    const bob = withTeam(createPlayer('p2', 'Bob', 3), 'team-0');
    const carol = withTeam(createPlayer('p3', 'Carol', 3), 'team-1');
    const dave = withTeam(createPlayer('p4', 'Dave', 3), 'team-1');

    let game = createGame('g3', [alice, bob, carol, dave], {
      turnDurationMs: 30000, maxLives: 3, jokersEnabled: false,
      teamsEnabled: true, teamCount: 2, eliminationMode: 'erreurs', jokerSelectionMode: 'aleatoire', hintsEnabled: true,
    });
    game = service.startGame(game);
    game = { ...game, teamErrorsRemaining: { 'team-0': 3, 'team-1': 3 } };

    game = service.eliminatePlayer(game, 'p1', 'REPEAT'); // Alice se trompe
    expect(game.teamErrorsRemaining!['team-0']).toBe(2);
    expect(game.players.find(p => p.id === 'p1')!.isEliminated).toBe(false);
    expect(game.players.find(p => p.id === 'p1')!.livesRemaining).toBe(3); // vies individuelles inchangées

    game = service.eliminatePlayer(game, 'p2', 'REPEAT'); // Bob se trompe (2e erreur d'équipe)
    expect(game.teamErrorsRemaining!['team-0']).toBe(1);
    expect(game.status).toBe(GameStatus.IN_PROGRESS);

    game = service.eliminatePlayer(game, 'p1', 'REPEAT'); // Alice se trompe encore (3e erreur d'équipe = pool épuisé)
    expect(game.teamErrorsRemaining!['team-0']).toBe(0);
    expect(game.players.find(p => p.id === 'p1')!.isEliminated).toBe(true);
    expect(game.players.find(p => p.id === 'p2')!.isEliminated).toBe(true); // toute l'équipe, même Bob qui n'a pas raté la 3e fois
    expect(game.status).toBe(GameStatus.FINISHED); // team-1 seule active restante
  });
});
