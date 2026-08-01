-- ============================================================
-- Roland-Gamos — Migration 5 : élargit la contrainte CHECK sur
-- artists.category aux 7 paliers Last.fm (CLAUDE_3.md §2.5).
--
-- Bug trouvé le 2026-08-01 : la contrainte posée par la migration 1
-- (20260418000000_init_schema.sql) ne listait que les 5 anciens
-- paliers fr_collab_count. computeLastfmPopularity.ts écrit désormais
-- 'confidentiel'/'connu' en plus — ces écritures étaient rejetées en
-- silence par Postgres (le script n'a pas de gestion d'erreur sur ce
-- UPDATE), laissant ~2449 artistes bloqués sur leur ancienne
-- catégorie au lieu d'être reclassés selon leur vraie popularité.
-- ============================================================

DO $$
DECLARE
  existing_conname text;
BEGIN
  SELECT con.conname INTO existing_conname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'artists'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%category%ultra_mainstream%';

  IF existing_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE artists DROP CONSTRAINT %I', existing_conname);
  END IF;
END $$;

ALTER TABLE artists ADD CONSTRAINT artists_category_check
  CHECK (category IN ('ultra_mainstream', 'mainstream', 'connu', 'intermediate', 'niche', 'underground', 'confidentiel'));
