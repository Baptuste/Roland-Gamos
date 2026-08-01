import { GameService } from '../GameService';
import { createGame, GameSettings } from '../../types/Game';
import { createPlayer } from '../../types/Player';

// Même pattern de mock que GameService.jokers.test.ts — petit graphe déterministe,
// pas de dépendance au chargement réel des données.
jest.mock('../GameDataStore', () => ({
  gameDataStore: {
    resolveArtist: (name: string) => {
      const map: Record<string, { id: number; name: string }> = {
        'artist a': { id: 1, name: 'Artist A' },
        'artist b': { id: 2, name: 'Artist B' },
        'artist c': { id: 3, name: 'Artist C' },
      };
      return map[name.toLowerCase().trim()] || null;
    },
    haveCollaborated: (a: number, b: number) => {
      const pairs = new Set(['1-2', '2-1', '2-3', '3-2']);
      return pairs.has(`${a}-${b}`);
    },
    getCollaborators: (id: number) => {
      // Artist B et Artist C ont chacun >= 2 collaborateurs connus pour éviter
      // le flag single-circular (un seul collaborateur = pas de retry possible).
      const map: Record<number, number[]> = { 1: [2], 2: [1, 3], 3: [2, 1] };
      return map[id] || [];
    },
    getCollaboration: (a: number, b: number) => {
      const [min, max] = a < b ? [a, b] : [b, a];
      const map: Record<string, { pair_family_count: number }> = {
        '1-2': { pair_family_count: 2 },
        '2-3': { pair_family_count: 1 },
      };
      return map[`${min}-${max}`] || null;
    },
  },
}));

describe('GameService — score multijoueur', () => {
  const service = new GameService();

  const baseSettings: GameSettings = {
    turnDurationMs: 30000,
    maxLives: 1,
    jokersEnabled: false,
    jokerSelectionMode: 'aleatoire',
    hintsEnabled: true,
    teamsEnabled: false,
    teamCount: 2,
    eliminationMode: 'vies',
  };

  it('un coup valide incrémente le score du joueur qui vient de jouer', async () => {
    const alice = createPlayer('p1', 'Alice', 1);
    const bob = createPlayer('p2', 'Bob', 1);
    let game = createGame('g1', [alice, bob], baseSettings);
    game = service.startGame(game);

    expect(game.players.find((p) => p.id === 'p1')!.score).toBe(0);

    const result = await service.proposeArtist(game, 'p1', 'Artist A');
    expect(result.isValid).toBe(true);
    expect(result.game.players.find((p) => p.id === 'p1')!.score).toBeGreaterThan(0);
    // Bob n'a pas joué, son score reste à 0
    expect(result.game.players.find((p) => p.id === 'p2')!.score).toBe(0);
  });

  it('un coup invalide n\'ajoute aucun score', async () => {
    const alice = createPlayer('p1', 'Alice', 2); // 2 vies pour survivre à l'échec
    const bob = createPlayer('p2', 'Bob', 2);
    let game = createGame('g2', [alice, bob], { ...baseSettings, maxLives: 2 });
    game = service.startGame(game);

    const result = await service.proposeArtist(game, 'p1', 'Artiste Inconnu');
    expect(result.isValid).toBe(false);
    expect(result.game.players.find((p) => p.id === 'p1')!.score).toBe(0);
  });

  it('Combo : les 2 artistes validés dans le même tour cumulent chacun leur propre score', async () => {
    const alice = { ...createPlayer('p1', 'Alice', 1), jokerStock: { combo: 1 } };
    const bob = createPlayer('p2', 'Bob', 1);
    let game = createGame('g3', [alice, bob], { ...baseSettings, jokersEnabled: true });
    game = service.startGame(game);

    game = service.useComboJoker(game, 'p1')!;

    const first = await service.proposeArtist(game, 'p1', 'Artist A');
    expect(first.isValid).toBe(true);
    const scoreAfterFirst = first.game.players.find((p) => p.id === 'p1')!.score;
    expect(scoreAfterFirst).toBeGreaterThan(0);

    const second = await service.proposeArtist(first.game, 'p1', 'Artist B');
    expect(second.isValid).toBe(true);
    const scoreAfterSecond = second.game.players.find((p) => p.id === 'p1')!.score;

    // Le 2e artiste rapporte son propre score, cumulé au 1er (pas remplacé)
    expect(scoreAfterSecond).toBeGreaterThan(scoreAfterFirst);
  });

  it('le classement (tri par score décroissant) reflète bien qui a le plus joué/marqué', async () => {
    const alice = createPlayer('p1', 'Alice', 1);
    const bob = createPlayer('p2', 'Bob', 1);
    let game = createGame('g4', [alice, bob], baseSettings);
    game = service.startGame(game); // tour d'Alice

    const r1 = await service.proposeArtist(game, 'p1', 'Artist A'); // Alice joue, passe à Bob
    expect(r1.isValid).toBe(true);
    const r2 = await service.proposeArtist(r1.game, 'p2', 'Artist B'); // Bob joue, passe à Alice
    expect(r2.isValid).toBe(true);
    const r3 = await service.proposeArtist(r2.game, 'p1', 'Artist C'); // Alice rejoue

    expect(r3.isValid).toBe(true);
    const ranked = [...r3.game.players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    // Alice a joué 2 coups valides, Bob 1 seul : Alice doit être en tête du classement
    expect(ranked[0].id).toBe('p1');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });
});
