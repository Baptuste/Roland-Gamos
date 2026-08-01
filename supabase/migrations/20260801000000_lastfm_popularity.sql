-- ============================================================
-- Roland-Gamos — Migration 4 : popularité Last.fm (remplace le proxy fr_collab_count)
-- (CLAUDE_3.md §2.5)
-- ============================================================

-- ─────────────────────────────────────────────
-- artists.lastfm_listeners / lastfm_playcount / lastfm_synced_at
-- Source de vérité pour artists.category / artists.category_bonus,
-- calculés séparément par npm run popularity:lastfm (quantiles sur lastfm_listeners).
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='artists' AND column_name='lastfm_listeners') THEN
    ALTER TABLE artists ADD COLUMN lastfm_listeners INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='artists' AND column_name='lastfm_playcount') THEN
    ALTER TABLE artists ADD COLUMN lastfm_playcount BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='artists' AND column_name='lastfm_synced_at') THEN
    ALTER TABLE artists ADD COLUMN lastfm_synced_at TIMESTAMPTZ;
  END IF;
END $$;
