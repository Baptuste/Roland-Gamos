import {
  categorizeByQuantile,
  fetchLastfmArtistInfo,
  CATEGORY_TIERS,
  CATEGORY_BONUS,
  ArtistListenerEntry,
} from '../computeLastfmPopularity';

describe('categorizeByQuantile', () => {
  it('retourne un tableau vide si aucune entrée', () => {
    expect(categorizeByQuantile([])).toEqual([]);
  });

  it('répartit 7 artistes en 7 paliers distincts (1 par tranche)', () => {
    const entries: ArtistListenerEntry[] = [
      { id: '1', listeners: 10 },
      { id: '2', listeners: 20 },
      { id: '3', listeners: 30 },
      { id: '4', listeners: 40 },
      { id: '5', listeners: 50 },
      { id: '6', listeners: 60 },
      { id: '7', listeners: 70 },
    ];
    const result = categorizeByQuantile(entries);
    const byId = new Map(result.map((r) => [r.id, r.category]));

    expect(byId.get('1')).toBe('confidentiel'); // le moins d'auditeurs
    expect(byId.get('7')).toBe('ultra_mainstream'); // le plus d'auditeurs
    // Les 7 paliers doivent tous être utilisés une fois
    expect(new Set(result.map((r) => r.category)).size).toBe(7);
  });

  it("assigne le bon category_bonus pour chaque palier (7 entrées, 1 par palier)", () => {
    const entries: ArtistListenerEntry[] = [
      { id: '1', listeners: 1 },
      { id: '2', listeners: 2 },
      { id: '3', listeners: 3 },
      { id: '4', listeners: 4 },
      { id: '5', listeners: 5 },
      { id: '6', listeners: 6 },
      { id: '7', listeners: 100 },
    ];
    const result = categorizeByQuantile(entries);
    const low = result.find((r) => r.id === '1')!;
    const high = result.find((r) => r.id === '7')!;
    expect(low.category_bonus).toBe(CATEGORY_BONUS.confidentiel);
    expect(high.category_bonus).toBe(CATEGORY_BONUS.ultra_mainstream);
  });

  it('gère un nombre d\'artistes non multiple de 7 sans planter et couvre tous les paliers valides', () => {
    const entries: ArtistListenerEntry[] = Array.from({ length: 23 }, (_, i) => ({
      id: String(i),
      listeners: i * 10,
    }));
    const result = categorizeByQuantile(entries);
    expect(result).toHaveLength(23);
    for (const r of result) {
      expect(CATEGORY_TIERS).toContain(r.category);
    }
    // Tri croissant respecté : le dernier (plus d'auditeurs) doit être au moins aussi
    // "mainstream" que le premier (moins d'auditeurs).
    const sorted = [...entries].sort((a, b) => a.listeners - b.listeners);
    const firstCategory = result.find((r) => r.id === sorted[0].id)!.category;
    const lastCategory = result.find((r) => r.id === sorted[sorted.length - 1].id)!.category;
    expect(CATEGORY_TIERS.indexOf(lastCategory)).toBeGreaterThanOrEqual(CATEGORY_TIERS.indexOf(firstCategory));
  });

  it('gère le cas où tous les artistes ont le même nombre d\'auditeurs (paliers dégénérés mais valides)', () => {
    const entries: ArtistListenerEntry[] = Array.from({ length: 14 }, (_, i) => ({
      id: String(i),
      listeners: 500,
    }));
    const result = categorizeByQuantile(entries);
    expect(result).toHaveLength(14);
    for (const r of result) {
      expect(CATEGORY_TIERS).toContain(r.category);
    }
  });
});

describe('fetchLastfmArtistInfo', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('retourne listeners/playcount quand Last.fm répond correctement', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ artist: { stats: { listeners: '123456', playcount: '789' } } }),
    }) as any;

    const result = await fetchLastfmArtistInfo('fake-key', { mbid: 'some-mbid' });
    expect(result).toEqual({ listeners: 123456, playcount: 789 });
  });

  it('retourne null si Last.fm renvoie une erreur applicative', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 6, message: 'The artist you supplied could not be found' }),
    }) as any;

    const result = await fetchLastfmArtistInfo('fake-key', { name: 'ArtisteInexistantXYZ' });
    expect(result).toBeNull();
  });

  it('retourne null si la requête HTTP échoue (status non-ok)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as any;
    const result = await fetchLastfmArtistInfo('fake-key', { name: 'Peu importe' });
    expect(result).toBeNull();
  });

  it('retourne null si ni mbid ni name ne sont fournis', async () => {
    global.fetch = jest.fn();
    const result = await fetchLastfmArtistInfo('fake-key', {});
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('privilégie le mbid au nom quand les deux sont fournis', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ artist: { stats: { listeners: '1', playcount: '1' } } }),
    }) as any;

    await fetchLastfmArtistInfo('fake-key', { mbid: 'the-mbid', name: 'Some Name' });
    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('mbid=the-mbid');
    expect(calledUrl).not.toContain('artist=Some');
  });
});
