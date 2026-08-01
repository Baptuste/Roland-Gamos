-- ============================================================
-- Roland-Gamos — Migration 6 : table de découverte d'artistes par joueur
-- ("codex/pokédex" — CLAUDE_3.md / vision produit du 2026-08-01, galaxie
-- des artistes). Un artiste devient "découvert" pour un joueur dès qu'il
-- est apparu dans une partie terminée par ce joueur (Solo Infini/Bot pour
-- l'instant — Multijoueur pas encore branché, voir handleGameFinish).
-- ============================================================

CREATE TABLE IF NOT EXISTS artist_discoveries (
  player_id    UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  artist_id    UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (player_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_artist_discoveries_player ON artist_discoveries(player_id);

ALTER TABLE artist_discoveries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Public read artist_discoveries' AND tablename='artist_discoveries') THEN
    CREATE POLICY "Public read artist_discoveries" ON artist_discoveries FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Service write artist_discoveries' AND tablename='artist_discoveries') THEN
    CREATE POLICY "Service write artist_discoveries" ON artist_discoveries FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
