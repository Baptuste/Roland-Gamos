-- ============================================================
-- Roland-Gamos — Migration initiale (ALTER TABLE si tables existent)
-- ============================================================

-- Ajouter les colonnes manquantes à artists (si elles n'existent pas)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='artists' AND column_name='genius_id') THEN
    ALTER TABLE artists ADD COLUMN genius_id INTEGER UNIQUE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='artists' AND column_name='mbid') THEN
    ALTER TABLE artists ADD COLUMN mbid TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='artists' AND column_name='image_url') THEN
    ALTER TABLE artists ADD COLUMN image_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='artists' AND column_name='status') THEN
    ALTER TABLE artists ADD COLUMN status TEXT DEFAULT 'excluded' CHECK (status IN ('included', 'excluded', 'needs_review'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='artists' AND column_name='category') THEN
    ALTER TABLE artists ADD COLUMN category TEXT DEFAULT 'underground' CHECK (category IN ('ultra_mainstream', 'mainstream', 'intermediate', 'niche', 'underground'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='artists' AND column_name='category_bonus') THEN
    ALTER TABLE artists ADD COLUMN category_bonus INTEGER DEFAULT 40;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='artists' AND column_name='degree_bonus') THEN
    ALTER TABLE artists ADD COLUMN degree_bonus INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='artists' AND column_name='created_at') THEN
    ALTER TABLE artists ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='artists' AND column_name='updated_at') THEN
    ALTER TABLE artists ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Indexes sur artists
CREATE INDEX IF NOT EXISTS idx_artists_genius_id ON artists(genius_id);
CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name);
CREATE INDEX IF NOT EXISTS idx_artists_status ON artists(status);

-- Ajouter les colonnes manquantes à collaborations
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='collaborations' AND column_name='artist1_id') THEN
    ALTER TABLE collaborations ADD COLUMN artist1_id INTEGER REFERENCES artists(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='collaborations' AND column_name='artist2_id') THEN
    ALTER TABLE collaborations ADD COLUMN artist2_id INTEGER REFERENCES artists(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='collaborations' AND column_name='song_count') THEN
    ALTER TABLE collaborations ADD COLUMN song_count INTEGER DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='collaborations' AND column_name='confidence') THEN
    ALTER TABLE collaborations ADD COLUMN confidence REAL DEFAULT 0.6;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='collaborations' AND column_name='sources') THEN
    ALTER TABLE collaborations ADD COLUMN sources TEXT[] DEFAULT ARRAY['genius'];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='collaborations' AND column_name='pair_bonus') THEN
    ALTER TABLE collaborations ADD COLUMN pair_bonus INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='collaborations' AND column_name='created_at') THEN
    ALTER TABLE collaborations ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='collaborations' AND column_name='updated_at') THEN
    ALTER TABLE collaborations ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Contrainte UNIQUE sur collaborations si elle n'existe pas
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='collaborations_artist1_id_artist2_id_key') THEN
    ALTER TABLE collaborations ADD CONSTRAINT collaborations_artist1_id_artist2_id_key UNIQUE (artist1_id, artist2_id);
  END IF;
END $$;

-- Indexes sur collaborations
CREATE INDEX IF NOT EXISTS idx_collaborations_artist1 ON collaborations(artist1_id);
CREATE INDEX IF NOT EXISTS idx_collaborations_artist2 ON collaborations(artist2_id);

-- Table collaboration_songs
CREATE TABLE IF NOT EXISTS collaboration_songs (
  id SERIAL PRIMARY KEY,
  collaboration_id INTEGER REFERENCES collaborations(id) ON DELETE CASCADE,
  genius_song_id INTEGER,
  title TEXT NOT NULL,
  UNIQUE(collaboration_id, genius_song_id)
);

-- Vue
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

-- RLS
ALTER TABLE artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaborations ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaboration_songs ENABLE ROW LEVEL SECURITY;

-- Politiques de lecture publique
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Public read artists' AND tablename='artists') THEN
    CREATE POLICY "Public read artists" ON artists FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Public read aliases' AND tablename='artist_aliases') THEN
    CREATE POLICY "Public read aliases" ON artist_aliases FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Public read collaborations' AND tablename='collaborations') THEN
    CREATE POLICY "Public read collaborations" ON collaborations FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Public read collab songs' AND tablename='collaboration_songs') THEN
    CREATE POLICY "Public read collab songs" ON collaboration_songs FOR SELECT USING (true);
  END IF;
END $$;

-- Politiques d'écriture service_role
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Service write artists' AND tablename='artists') THEN
    CREATE POLICY "Service write artists" ON artists FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Service write aliases' AND tablename='artist_aliases') THEN
    CREATE POLICY "Service write aliases" ON artist_aliases FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Service write collaborations' AND tablename='collaborations') THEN
    CREATE POLICY "Service write collaborations" ON collaborations FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Service write collab songs' AND tablename='collaboration_songs') THEN
    CREATE POLICY "Service write collab songs" ON collaboration_songs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
