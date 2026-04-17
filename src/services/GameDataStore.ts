import { supabase } from './supabaseClient';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Artiste dans le store de jeu
 */
export interface GameArtist {
  id: number;
  genius_id: number;
  name: string;
  aliases: string[];
  image_url?: string;
  category: string;
  category_bonus: number;
  degree_bonus: number;
}

/**
 * Collaboration dans le store de jeu
 */
export interface GameCollaboration {
  artist1_id: number;
  artist2_id: number;
  song_count: number;
  pair_bonus: number;
  confidence: number;
}

/**
 * GameDataStore — source locale de verite pour les validations en jeu.
 * Charge les donnees au demarrage (Supabase ou JSON fallback),
 * puis repond aux requetes en memoire sans appel reseau.
 *
 * Regle absolue: AUCUN appel API externe pendant une partie.
 */
export class GameDataStore {
  private artists: Map<number, GameArtist> = new Map(); // id -> artist
  private artistsByName: Map<string, GameArtist> = new Map(); // lowercase name -> artist
  private artistsByGeniusId: Map<number, GameArtist> = new Map();
  private collaborations: Map<string, GameCollaboration> = new Map(); // "id1|id2" -> collab
  private collaboratorIndex: Map<number, Set<number>> = new Map(); // artist_id -> Set<collaborator_ids>
  private ready = false;

  /**
   * Charge les donnees au demarrage
   */
  async initialize(): Promise<void> {
    if (this.ready) return;

    console.log('GameDataStore: Loading data...');

    if (supabase) {
      await this.loadFromSupabase();
    } else {
      this.loadFromJSON();
    }

    this.buildIndexes();
    this.ready = true;
    console.log(`GameDataStore: Ready — ${this.artists.size} artists, ${this.collaborations.size} collaborations`);
  }

  private async loadFromSupabase(): Promise<void> {
    console.log('  Loading from Supabase...');

    // Charger les artistes inclus
    const { data: dbArtists, error: artistError } = await supabase!
      .from('artists')
      .select('id, genius_id, name, image_url, category, category_bonus, degree_bonus, status')
      .in('status', ['included', 'needs_review']);

    if (artistError) {
      console.error('  Supabase artist load error:', artistError.message);
      console.log('  Falling back to JSON...');
      this.loadFromJSON();
      return;
    }

    // Charger les aliases
    const { data: dbAliases } = await supabase!
      .from('artist_aliases')
      .select('artist_id, alias');

    const aliasMap = new Map<number, string[]>();
    if (dbAliases) {
      for (const a of dbAliases) {
        const artistId = Number(a.artist_id);
        if (!aliasMap.has(artistId)) aliasMap.set(artistId, []);
        aliasMap.get(artistId)!.push(a.alias);
      }
    }

    for (const a of dbArtists || []) {
      const id = Number(a.id);
      const artist: GameArtist = {
        id,
        genius_id: Number(a.genius_id),
        name: a.name,
        aliases: aliasMap.get(id) || [],
        image_url: a.image_url,
        category: a.category || 'underground',
        category_bonus: Number(a.category_bonus) || 40,
        degree_bonus: Number(a.degree_bonus) || 0,
      };
      this.artists.set(id, artist);
    }

    // Charger les collaborations
    const { data: dbCollabs, error: collabError } = await supabase!
      .from('collaborations')
      .select('artist1_id, artist2_id, song_count, pair_bonus, confidence');

    if (collabError) {
      console.error('  Supabase collab load error:', collabError.message);
    }

    for (const c of dbCollabs || []) {
      const a1 = Number(c.artist1_id);
      const a2 = Number(c.artist2_id);
      const [minId, maxId] = a1 < a2 ? [a1, a2] : [a2, a1];
      const key = `${minId}|${maxId}`;
      this.collaborations.set(key, {
        artist1_id: minId,
        artist2_id: maxId,
        song_count: Number(c.song_count) || 1,
        pair_bonus: Number(c.pair_bonus) || 0,
        confidence: Number(c.confidence) || 0.6,
      });
    }

    console.log(`  Supabase: ${this.artists.size} artists, ${this.collaborations.size} collaborations`);
  }

  private loadFromJSON(): void {
    const dataDir = path.join(__dirname, '..', 'data');
    const artistsPath = path.join(dataDir, 'artists.json');
    const collabsPath = path.join(dataDir, 'collaborations.json');

    if (!fs.existsSync(artistsPath)) {
      console.warn('  No data files found. Run "npm run seed" first.');
      return;
    }

    console.log('  Loading from JSON files...');

    const rawArtists = JSON.parse(fs.readFileSync(artistsPath, 'utf-8'));
    let idCounter = 1;

    // Map genius_id -> internal id (since JSON doesn't have internal IDs)
    const geniusToId = new Map<number, number>();

    for (const a of rawArtists) {
      if (a.status === 'excluded') continue;

      const id = idCounter++;
      geniusToId.set(a.genius_id, id);

      this.artists.set(id, {
        id,
        genius_id: a.genius_id,
        name: a.name,
        aliases: a.aliases || [],
        image_url: a.image_url,
        category: 'underground',
        category_bonus: 40,
        degree_bonus: 0,
      });
    }

    if (fs.existsSync(collabsPath)) {
      const rawCollabs = JSON.parse(fs.readFileSync(collabsPath, 'utf-8'));

      for (const c of rawCollabs) {
        const a1Id = geniusToId.get(c.artist1_genius_id);
        const a2Id = geniusToId.get(c.artist2_genius_id);
        if (!a1Id || !a2Id) continue;

        const [minId, maxId] = a1Id < a2Id ? [a1Id, a2Id] : [a2Id, a1Id];
        const key = `${minId}|${maxId}`;

        this.collaborations.set(key, {
          artist1_id: minId,
          artist2_id: maxId,
          song_count: c.songs?.length || 1,
          pair_bonus: 0,
          confidence: c.confidence || 0.6,
        });
      }
    }

    console.log(`  JSON: ${this.artists.size} artists, ${this.collaborations.size} collaborations`);
  }

  private buildIndexes(): void {
    // Index par nom (lowercase)
    for (const [, artist] of this.artists) {
      this.artistsByName.set(artist.name.toLowerCase(), artist);
      this.artistsByGeniusId.set(artist.genius_id, artist);

      // Index aliases
      for (const alias of artist.aliases) {
        this.artistsByName.set(alias.toLowerCase(), artist);
      }
    }

    // Index des collaborateurs
    for (const [, collab] of this.collaborations) {
      if (!this.collaboratorIndex.has(collab.artist1_id)) {
        this.collaboratorIndex.set(collab.artist1_id, new Set());
      }
      if (!this.collaboratorIndex.has(collab.artist2_id)) {
        this.collaboratorIndex.set(collab.artist2_id, new Set());
      }
      this.collaboratorIndex.get(collab.artist1_id)!.add(collab.artist2_id);
      this.collaboratorIndex.get(collab.artist2_id)!.add(collab.artist1_id);
    }
  }

  // ============================================================
  // API publique — lecture seule, zero appel reseau
  // ============================================================

  /**
   * Resout un artiste par nom (fuzzy match basique: exact + aliases)
   */
  resolveArtist(name: string): GameArtist | null {
    const normalized = name.trim().toLowerCase();
    return this.artistsByName.get(normalized) || null;
  }

  /**
   * Verifie si deux artistes ont collabore
   */
  haveCollaborated(artist1Id: number, artist2Id: number): boolean {
    const [minId, maxId] = artist1Id < artist2Id ? [artist1Id, artist2Id] : [artist2Id, artist1Id];
    return this.collaborations.has(`${minId}|${maxId}`);
  }

  /**
   * Retourne les IDs des collaborateurs connus d'un artiste
   */
  getCollaborators(artistId: number): number[] {
    const set = this.collaboratorIndex.get(artistId);
    return set ? Array.from(set) : [];
  }

  /**
   * Retourne les details d'une collaboration
   */
  getCollaboration(artist1Id: number, artist2Id: number): GameCollaboration | null {
    const [minId, maxId] = artist1Id < artist2Id ? [artist1Id, artist2Id] : [artist2Id, artist1Id];
    return this.collaborations.get(`${minId}|${maxId}`) || null;
  }

  /**
   * Retourne un artiste par son ID interne
   */
  getArtistById(id: number): GameArtist | null {
    return this.artists.get(id) || null;
  }

  /**
   * Retourne un artiste aleatoire (pour les seeds de partie)
   */
  getRandomArtist(): GameArtist | null {
    const all = Array.from(this.artists.values());
    if (all.length === 0) return null;
    return all[Math.floor(Math.random() * all.length)];
  }

  /**
   * Retourne un artiste seed aleatoire (artistes bien connectes)
   */
  getRandomSeedArtist(): GameArtist | null {
    const seeds = Array.from(this.artists.values()).filter(a => {
      const collabs = this.collaboratorIndex.get(a.id);
      return collabs && collabs.size >= 5;
    });
    if (seeds.length === 0) return this.getRandomArtist();
    return seeds[Math.floor(Math.random() * seeds.length)];
  }

  /**
   * Verifie si le store est pret
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Nombre total d'artistes
   */
  getArtistCount(): number {
    return this.artists.size;
  }

  /**
   * Nombre total de collaborations
   */
  getCollaborationCount(): number {
    return this.collaborations.size;
  }
}

// Singleton
export const gameDataStore = new GameDataStore();
