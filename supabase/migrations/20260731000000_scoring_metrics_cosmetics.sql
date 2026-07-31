-- ============================================================
-- Roland-Gamos — Migration 3 : métriques de scoring, dépassement, cosmétiques avatars
-- (CLAUDE_3.md §2.3, §2.4, §3.1)
-- ============================================================

-- ─────────────────────────────────────────────
-- artists.collab_degree — nombre de collaborateurs distincts
-- (persisté pour analytics/offline ; le runtime le recalcule aussi en RAM depuis GameDataStore)
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='artists' AND column_name='collab_degree') THEN
    ALTER TABLE artists ADD COLUMN collab_degree INTEGER DEFAULT 0;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- collaborations.pair_family_count — familles de titres distinctes pour la paire
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='collaborations' AND column_name='pair_family_count') THEN
    ALTER TABLE collaborations ADD COLUMN pair_family_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- player_stats.overflow_count — nombre de coups ayant dépassé le plafond de score (300)
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='player_stats' AND column_name='overflow_count') THEN
    ALTER TABLE player_stats ADD COLUMN overflow_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- cosmetics_catalog — colonnes avatars + rendu procédural des auras
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cosmetics_catalog' AND column_name='avatar_category') THEN
    ALTER TABLE cosmetics_catalog ADD COLUMN avatar_category TEXT CHECK (avatar_category IN ('personnage','artiste_reel','animal'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cosmetics_catalog' AND column_name='nom_reference') THEN
    ALTER TABLE cosmetics_catalog ADD COLUMN nom_reference TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cosmetics_catalog' AND column_name='render_config') THEN
    ALTER TABLE cosmetics_catalog ADD COLUMN render_config JSONB;
  END IF;
END $$;

-- Un avatar d'artiste réel ne peut jamais être de rareté "neutre" (poids culturel — CLAUDE_3.md §3.2)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cosmetics_catalog_artiste_reel_not_neutre') THEN
    ALTER TABLE cosmetics_catalog ADD CONSTRAINT cosmetics_catalog_artiste_reel_not_neutre
      CHECK (avatar_category IS DISTINCT FROM 'artiste_reel' OR rarity != 'neutre');
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- SEED : titre + aura "Dépassement" (débloqués au 1er dépassement du plafond de score)
-- ─────────────────────────────────────────────
INSERT INTO cosmetics_catalog (type, name, rarity, unlock_type, unlock_condition, is_default, description)
VALUES
  ('titre', 'Dépassement', 'plutonium', 'challenge', '{"type":"overflow_count","value":1}', false, 'Débloqué en dépassant le plafond de score sur un coup')
ON CONFLICT DO NOTHING;

INSERT INTO cosmetics_catalog (type, name, rarity, unlock_type, unlock_condition, is_default, description, render_config)
VALUES
  ('aura', 'Dépassement', 'plutonium', 'challenge', '{"type":"overflow_count","value":1}', false, 'Aura débloquée en dépassant le plafond de score sur un coup',
   '{
     "primitive": "composite",
     "layers": [
       { "primitive": "glow", "params": { "colors": ["#ffd700", "#ffffff"], "pulseSpeed": 1.5, "blurRadius": 18, "opacity": [0.4, 0.9] } },
       { "primitive": "particles", "params": { "shape": "spark", "palette": ["#ffd700", "#ffffff", "#ffec8b"], "count": 30, "spawnRate": 8, "lifetime": 900, "gravity": -0.05, "sizeRange": [1, 3] } }
     ]
   }'::jsonb)
ON CONFLICT DO NOTHING;
