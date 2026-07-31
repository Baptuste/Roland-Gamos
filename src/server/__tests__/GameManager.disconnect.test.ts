import { GameManager } from '../GameManager';

describe('GameManager — délai de grâce sur déconnexion (lobby)', () => {
  beforeEach(() => {
    // doNotFake Date : createPlayer() génère ses ids via `player-${Date.now()}`
    // (sans suffixe aléatoire) — geler Date.now() ferait collisionner les ids
    // de plusieurs joueurs créés dans le même test.
    jest.useFakeTimers({ doNotFake: ['Date'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('un hôte seul qui se déconnecte ne perd pas immédiatement son lobby', () => {
    const gm = new GameManager();
    const { gameId, gameCode } = gm.createGame('Host', 'socket-1');

    gm.handleDisconnect('socket-1');

    // Toujours là juste après la déconnexion (avant l'expiration du délai de grâce)
    expect(gm.getGame(gameId)).not.toBeNull();
    expect(gm.getGameByCode(gameCode)).not.toBeNull();
  });

  it('une reconnexion dans le délai de grâce annule le retrait', () => {
    const gm = new GameManager();
    const { gameId, gameCode, player } = gm.createGame('Host', 'socket-1');

    gm.handleDisconnect('socket-1');
    jest.advanceTimersByTime(5000); // bien avant les 15s de grâce

    const result = gm.reconnectToGame(gameCode, player.id, 'socket-2');
    expect(result).not.toBeNull();

    jest.advanceTimersByTime(20000); // dépasse largement le délai de grâce d'origine

    // Toujours là : la reconnexion a bien annulé le retrait programmé
    expect(gm.getGame(gameId)).not.toBeNull();
  });

  it('sans reconnexion, le lobby solo est supprimé après le délai de grâce — et le code avec lui', () => {
    const gm = new GameManager();
    const { gameId, gameCode } = gm.createGame('Host', 'socket-1');

    gm.handleDisconnect('socket-1');
    jest.advanceTimersByTime(15001);

    expect(gm.getGame(gameId)).toBeNull();
    // Le code ne doit plus pointer vers une partie fantôme
    expect(gm.getGameByCode(gameCode)).toBeNull();
  });

  it('avec 3 joueurs, le lobby survit au retrait du déconnecté après le délai (il reste >= 2 joueurs)', () => {
    const gm = new GameManager();
    const { gameId } = gm.createGame('Host', 'socket-1');
    gm.joinGame(gameId, 'Guest1', 'socket-2');
    gm.joinGame(gameId, 'Guest2', 'socket-3');

    gm.handleDisconnect('socket-2');
    jest.advanceTimersByTime(15001);

    const game = gm.getGame(gameId);
    expect(game).not.toBeNull();
    expect(game!.players.map(p => p.name)).toEqual(['Host', 'Guest2']);
  });
});
