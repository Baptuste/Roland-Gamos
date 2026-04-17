-- ============================================================
-- Roland-Gamos — Schema Supabase PostgreSQL
-- ============================================================

-- Artistes
CREATE TABLE IF NOT EXISTS artists (
  id SERIAL PRIMARY KEY,
  genius_id INTEGER UNIQUE,
  mbid TEXT,
  name TEXT NOT NULL,
  image_url TEXT,
  fr_collab_count INTEGER DEFAULT 0,
  is_seed BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'excluded' CHECK (status IN ('included', 'excluded', 'needs_review')),
  category TEXT DEFAULT 'underground' CHECK (category IN ('ultra_mainstream', 'mainstream', 'intermediate', 'niche', 'underground')),
  category_bonus INTEGER DEFAULT 40,
  degree_bonus INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artists_genius_id ON artists(genius_id);
CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name);
CREATE INDEX IF NOT EXISTS idx_artists_status ON artists(status);

-- Aliases d'artistes (fuzzy match)
CREATE TABLE IF NOT EXISTS artist_aliases (
  id SERIAL PRIMARY KEY,
  artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  UNIQUE(artist_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_artist_aliases_alias ON artist_aliases(alias);

-- Collaborations
CREATE TABLE IF NOT EXISTS collaborations (
  id SERIAL PRIMARY KEY,
  artist1_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
  artist2_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
  song_count INTEGER DEFAULT 1,
  confidence REAL DEFAULT 0.6,
  sources TEXT[] DEFAULT ARRAY['genius'],
  pair_bonus INTEGER DEFAULT 0,
  needs_review BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(artist1_id, artist2_id),
  CHECK(artist1_id < artist2_id)
);

CREATE INDEX IF NOT EXISTS idx_collaborations_artist1 ON collaborations(artist1_id);
CREATE INDEX IF NOT EXISTS idx_collaborations_artist2 ON collaborations(artist2_id);

-- Titres en commun (pour tracer les morceaux)
CREATE TABLE IF NOT EXISTS collaboration_songs (
  id SERIAL PRIMARY KEY,
  collaboration_id INTEGER REFERENCES collaborations(id) ON DELETE CASCADE,
  genius_song_id INTEGER,
  title TEXT NOT NULL,
  UNIQUE(collaboration_id, genius_song_id)
);

-- Vue pratique : collaborations avec noms d'artistes
CREATE OR REPLACE VIEW collaborations_view AS
SELECT
  c.id,
  a1.name AS artist1_name,
  a1.genius_id AS artist1_genius_id,
  a2.name AS artist2_name,
  a2.genius_id AS artist2_genius_id,
  c.song_count,
  c.confidence,
  c.sources,
  c.pair_bonus
FROM collaborations c
JOIN artists a1 ON c.artist1_id = a1.id
JOIN artists a2 ON c.artist2_id = a2.id;

-- ============================================================
-- RLS (Row Level Security) — lecture publique
-- ============================================================

ALTER TABLE artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaborations ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaboration_songs ENABLE ROW LEVEL SECURITY;

-- Politique de lecture publique (anon peut lire)
CREATE POLICY IF NOT EXISTS "Public read artists" ON artists FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Public read aliases" ON artist_aliases FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Public read collaborations" ON collaborations FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Public read collab songs" ON collaboration_songs FOR SELECT USING (true);

-- Ecriture reservee au service_role (backend/ETL)
-- USING = filtre pour SELECT/UPDATE/DELETE, WITH CHECK = filtre pour INSERT/UPDATE
CREATE POLICY IF NOT EXISTS "Service write artists" ON artists FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Service write aliases" ON artist_aliases FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Service write collaborations" ON collaborations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Service write collab songs" ON collaboration_songs FOR ALL TO service_role USING (true) WITH CHECK (true);
