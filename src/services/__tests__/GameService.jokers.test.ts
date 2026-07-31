import { GameService } from '../GameService';
import { createGame, GameStatus, GameSettings } from '../../types/Game';
import { createPlayer, JokerType } from '../../types/Player';

// proposeArtist() résout les noms via gameDataStore (RAM-only, chargé au démarrage
// serveur — vide dans un process de test). Seul le test Combo l'exerce ; on mocke
// un petit graphe déterministe pour ne pas dépendre du chargement réel des données.
jest.mock('../GameDataStore', () => ({
  gameDataStore: {
    resolveArtist: (name: string) => {
      const map: Record<string, { id: number; name: string }> = {
        'artist a': { id: 1, name: 'Artist A' },
        'artist b': { id: 2, name: 'Artist B' },
      };
      return map[name.toLowerCase().trim()] || null;
    },
    haveCollaborated: (a: number, b: number) => {
      const pairs = new Set(['1-2', '2-1']);
      return pairs.has(`${a}-${b}`);
    },
    getCollaborators: (id: number) => {
      // Artist B a 2 collaborateurs (pas juste Artist A) pour éviter le flag
      // single-circular sur le 2e coup du combo.
      const map: Record<number, number[]> = { 1: [2], 2: [1, 3], 3: [2] };
      return map[id] || [];
    },
  },
}));

describe('GameService — jokers multijoueur', () => {
  const service = new GameService();

  const baseSettings: GameSettings = {
    turnDurationMs: 30000,
    maxLives: 1,
    jokersEnabled: true,
    jokerSelectionMode: 'aleatoire',
    hintsEnabled: true,
    teamsEnabled: false,
    teamCount: 2,
    eliminationMode: 'vies',
  };

  function withJokers(player: ReturnType<typeof createPlayer>, stock: Partial<Record<JokerType, number>>) {
    return { ...player, jokerStock: stock };
  }

  it('Timer : ajoute 15s au tour en cours et décrémente le stock', () => {
    const alice = withJokers(createPlayer('p1', 'Alice', 1), { timer: 2 });
    const bob = createPlayer('p2', 'Bob', 1);
    let game = createGame('g1', [alice, bob], baseSettings);
    game = service.startGame(game);

    const endsBefore = game.currentTurnEndsAt!;
    const updated = service.useTimerJoker(game, 'p1');

    expect(updated).not.toBeNull();
    expect(updated!.currentTurnEndsAt).toBe(endsBefore + 15000);
    expect(updated!.players.find((p) => p.id === 'p1')!.jokerStock!.timer).toBe(1);
  });

  it('Timer : refuse si ce n\'est pas le tour du joueur', () => {
    const alice = withJokers(createPlayer('p1', 'Alice', 1), { timer: 1 });
    const bob = withJokers(createPlayer('p2', 'Bob', 1), { timer: 1 });
    let game = createGame('g1b', [alice, bob], baseSettings);
    game = service.startGame(game); // tour d'Alice

    expect(service.useTimerJoker(game, 'p2')).toBeNull();
  });

  it('Skip : passe le tour sans élimination et journalise un tour "skip"', () => {
    const alice = withJokers(createPlayer('p1', 'Alice', 1), { skip: 1 });
    const bob = createPlayer('p2', 'Bob', 1);
    let game = createGame('g2', [alice, bob], baseSettings);
    game = service.startGame(game);

    const updated = service.useSkipJoker(game, 'p1');

    expect(updated).not.toBeNull();
    expect(updated!.players.find((p) => p.id === 'p1')!.isEliminated).toBe(false);
    expect(updated!.currentPlayerIndex).toBe(1); // Bob
    const lastTurn = updated!.turns[updated!.turns.length - 1];
    expect(lastTurn.jokerUsed).toBe('skip');
    expect(lastTurn.isValid).toBe(true);
  });

  it('Bouclier : absorbe une élimination puis se réinitialise au tour suivant', () => {
    const alice = withJokers(createPlayer('p1', 'Alice', 1), { bouclier: 1 });
    const bob = createPlayer('p2', 'Bob', 1);
    let game = createGame('g3', [alice, bob], baseSettings);
    game = service.startGame(game);

    game = service.useBouclierJoker(game, 'p1')!;
    expect(game.turnJokerState?.shieldActive).toBe(true);

    game = service.eliminatePlayer(game, 'p1', 'REPEAT');
    expect(game.players.find((p) => p.id === 'p1')!.isEliminated).toBe(false);
    expect(game.players.find((p) => p.id === 'p1')!.livesRemaining).toBe(1); // inchangé

    // Le tour suivant réinitialise turnJokerState — protection à usage unique
    game = service.startTurn(game);
    expect(game.turnJokerState?.shieldActive).toBeFalsy();
  });

  it('Combo : enchaîne 2 artistes valides dans le même tour sans passer la main', async () => {
    const alice = withJokers(createPlayer('p1', 'Alice', 1), { combo: 1 });
    const bob = createPlayer('p2', 'Bob', 1);
    let game = createGame('g4', [alice, bob], baseSettings);
    game = service.startGame(game);

    game = service.useComboJoker(game, 'p1')!;
    expect(game.turnJokerState?.comboArtistsPlayed).toBe(0);

    const first = await service.proposeArtist(game, 'p1', 'Artist A');
    expect(first.isValid).toBe(true);
    expect(first.game.currentPlayerIndex).toBe(0); // toujours Alice
    expect(first.game.turnJokerState?.comboArtistsPlayed).toBe(1);

    const second = await service.proposeArtist(first.game, 'p1', 'Artist B');
    expect(second.isValid).toBe(true);
    expect(second.game.currentPlayerIndex).toBe(1); // passe à Bob
    expect(second.game.turnJokerState?.comboArtistsPlayed).toBeUndefined(); // reset par startTurn
  });

  it('Combo : un échec du 2e artiste élimine normalement (combo déjà consommé)', async () => {
    const alice = withJokers(createPlayer('p1', 'Alice', 1), { combo: 1 });
    const bob = createPlayer('p2', 'Bob', 1);
    let game = createGame('g5', [alice, bob], baseSettings);
    game = service.startGame(game);

    game = service.useComboJoker(game, 'p1')!;
    const first = await service.proposeArtist(game, 'p1', 'Artist A');
    expect(first.isValid).toBe(true);

    // Rejoue le même artiste (REPEAT, hard-fail immédiat quel que soit le nombre de tentatives)
    const second = await service.proposeArtist(first.game, 'p1', 'Artist A');
    expect(second.isValid).toBe(false);
    expect(second.game.players.find((p) => p.id === 'p1')!.isEliminated).toBe(true);
    expect(second.game.status).toBe(GameStatus.FINISHED); // maxLives=1, 2 joueurs
  });

  it('Résurrection (classique) : cible libre parmi les joueurs éliminés, revient avec 1 vie', () => {
    const alice = withJokers(createPlayer('p1', 'Alice', 1), { resurrection: 1 });
    const bob = createPlayer('p2', 'Bob', 1);
    const carol = createPlayer('p3', 'Carol', 1);
    let game = createGame('g6', [alice, bob, carol], baseSettings);
    game = service.startGame(game);
    game = service.eliminatePlayer(game, 'p2', 'REPEAT'); // Bob éliminé (maxLives=1)
    expect(game.players.find((p) => p.id === 'p2')!.isEliminated).toBe(true);

    const updated = service.useResurrectionJoker(game, 'p1', 'p2');
    expect(updated).not.toBeNull();
    expect(updated!.players.find((p) => p.id === 'p2')!.isEliminated).toBe(false);
    expect(updated!.players.find((p) => p.id === 'p2')!.livesRemaining).toBe(1);
  });

  it('Résurrection (équipe) : coéquipier uniquement, refuse une cible d\'une autre équipe', () => {
    // Mode VIES : Bob peut être éliminé individuellement pendant qu'Alice
    // (même équipe) reste active et joue son tour — scénario réaliste, à la
    // différence du mode ERREURS où toute l'équipe tombe d'un coup (aucun
    // coéquipier ne resterait actif pour activer la Résurrection).
    const teamSettings: GameSettings = { ...baseSettings, teamsEnabled: true, teamCount: 2, eliminationMode: 'vies' };
    const alice = { ...withJokers(createPlayer('p1', 'Alice', 1), { resurrection: 1 }), teamId: 'team-0' };
    const bob = { ...createPlayer('p2', 'Bob', 1), teamId: 'team-0' };
    const carol = { ...createPlayer('p3', 'Carol', 1), teamId: 'team-1' };
    let game = createGame('g7', [alice, bob, carol], teamSettings);
    game = service.startGame(game); // Alice (team-0) commence

    game = service.eliminatePlayer(game, 'p2', 'REPEAT'); // Bob éliminé, Alice encore active
    expect(game.players.find((p) => p.id === 'p2')!.isEliminated).toBe(true);
    expect(game.status).toBe(GameStatus.IN_PROGRESS);
    expect(game.players[game.currentPlayerIndex].id).toBe('p1'); // toujours le tour d'Alice

    // Refuse Carol (team-1, pas coéquipière d'Alice)
    expect(service.useResurrectionJoker(game, 'p1', 'p3')).toBeNull();

    // Accepte Bob (team-0, coéquipier)
    const updated = service.useResurrectionJoker(game, 'p1', 'p2');
    expect(updated).not.toBeNull();
    expect(updated!.players.find((p) => p.id === 'p2')!.isEliminated).toBe(false);
    expect(updated!.players.find((p) => p.id === 'p2')!.livesRemaining).toBe(1);
  });
});
