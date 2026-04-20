-- ============================================================
-- Roland-Gamos — Migration 2 : players, XP, cosmétiques, leaderboard
-- ============================================================

-- ─────────────────────────────────────────────
-- TABLE players
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS players (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id       UUID,
  pseudo        TEXT NOT NULL,
  total_score   INTEGER DEFAULT 0,
  level         INTEGER DEFAULT 1,
  xp            INTEGER DEFAULT 0,
  coins         INTEGER DEFAULT 0,
  is_anonymous  BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Ajout xp si table existait déjà sans la colonne
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='players' AND column_name='xp') THEN
    ALTER TABLE players ADD COLUMN xp INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='players' AND column_name='level') THEN
    ALTER TABLE players ADD COLUMN level INTEGER DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='players' AND column_name='total_score') THEN
    ALTER TABLE players ADD COLUMN total_score INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='players' AND column_name='last_seen_at') THEN
    ALTER TABLE players ADD COLUMN last_seen_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_players_pseudo ON players(pseudo);

-- ─────────────────────────────────────────────
-- TABLE player_stats — colonnes manquantes
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_stats (
  id                      SERIAL PRIMARY KEY,
  player_name             TEXT UNIQUE NOT NULL,
  total_games             INTEGER DEFAULT 0,
  total_solo_games        INTEGER DEFAULT 0,
  total_bot_games         INTEGER DEFAULT 0,
  total_multiplayer_games INTEGER DEFAULT 0,
  best_solo_score         INTEGER DEFAULT 0,
  best_solo_turns         INTEGER DEFAULT 0,
  best_bot_score          INTEGER DEFAULT 0,
  total_score             INTEGER DEFAULT 0,
  bot_wins                INTEGER DEFAULT 0,
  bot_losses              INTEGER DEFAULT 0,
  xp                      INTEGER DEFAULT 0,
  multiplayer_wins        INTEGER DEFAULT 0,
  multiplayer_losses      INTEGER DEFAULT 0,
  best_multiplayer_score  INTEGER DEFAULT 0,
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='player_stats' AND column_name='xp') THEN
    ALTER TABLE player_stats ADD COLUMN xp INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='player_stats' AND column_name='multiplayer_wins') THEN
    ALTER TABLE player_stats ADD COLUMN multiplayer_wins INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='player_stats' AND column_name='multiplayer_losses') THEN
    ALTER TABLE player_stats ADD COLUMN multiplayer_losses INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='player_stats' AND column_name='best_multiplayer_score') THEN
    ALTER TABLE player_stats ADD COLUMN best_multiplayer_score INTEGER DEFAULT 0;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- TABLE leaderboard — migration player_name → player_id
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leaderboard (
  id          SERIAL PRIMARY KEY,
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  score       INTEGER NOT NULL DEFAULT 0,
  turns       INTEGER NOT NULL DEFAULT 0,
  mode        TEXT NOT NULL CHECK (mode IN ('Solo Infini', 'Solo Bot', 'Multijoueur')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Si la table existait avec player_name : ajouter player_id, supprimer player_name
DO $$
BEGIN
  -- Ajouter player_id si absent
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leaderboard' AND column_name='player_id') THEN
    ALTER TABLE leaderboard ADD COLUMN player_id UUID REFERENCES players(id) ON DELETE CASCADE;
  END IF;
  -- Supprimer player_name si présent (données pré-launch, reset acceptable)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leaderboard' AND column_name='player_name') THEN
    -- Vider les anciennes entrées sans player_id avant de rendre la colonne NOT NULL
    DELETE FROM leaderboard WHERE player_id IS NULL;
    ALTER TABLE leaderboard ALTER COLUMN player_id SET NOT NULL;
    ALTER TABLE leaderboard DROP COLUMN player_name;
  END IF;
END $$;

-- Contrainte UNIQUE (player_id, mode) — une entrée par joueur par mode
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leaderboard_player_id_mode_key') THEN
    ALTER TABLE leaderboard ADD CONSTRAINT leaderboard_player_id_mode_key UNIQUE (player_id, mode);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leaderboard_mode_score ON leaderboard(mode, score DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_player ON leaderboard(player_id);

-- ─────────────────────────────────────────────
-- TABLE cosmetics_catalog
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cosmetics_catalog (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type             TEXT NOT NULL CHECK (type IN ('avatar','aura','cadre','effet_entree','effet_validation','titre')),
  name             TEXT NOT NULL,
  asset_url        TEXT,
  rarity           TEXT NOT NULL DEFAULT 'neutre' CHECK (rarity IN ('neutre','or','platine','diamant','plutonium')),
  unlock_type      TEXT NOT NULL DEFAULT 'default' CHECK (unlock_type IN ('default','level','challenge')),
  unlock_condition JSONB NOT NULL DEFAULT '{}',
  is_default       BOOLEAN DEFAULT false,
  description      TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TABLE cosmetics_unlocked
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cosmetics_unlocked (
  player_id    UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  cosmetic_id  UUID NOT NULL REFERENCES cosmetics_catalog(id) ON DELETE CASCADE,
  unlocked_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (player_id, cosmetic_id)
);

CREATE INDEX IF NOT EXISTS idx_cosmetics_unlocked_player ON cosmetics_unlocked(player_id);

-- ─────────────────────────────────────────────
-- SEED : 5 items cosmétiques par défaut
-- ─────────────────────────────────────────────
INSERT INTO cosmetics_catalog (type, name, rarity, unlock_type, unlock_condition, is_default, description)
VALUES
  ('avatar', 'MC Anonyme',   'neutre', 'default', '{}', true,  'Avatar par défaut — homme'),
  ('avatar', 'La Meuf',      'neutre', 'default', '{}', true,  'Avatar par défaut — femme'),
  ('aura',   'Aura Neutre',  'neutre', 'default', '{}', true,  'Aura de base, sans couleur'),
  ('cadre',  'Cadre Basique','neutre', 'default', '{}', true,  'Cadre simple sans décoration'),
  ('titre',  'Rookie',       'neutre', 'default', '{}', true,  'Titre de départ')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────
ALTER TABLE players           ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_stats      ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cosmetics_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE cosmetics_unlocked ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Public read players' AND tablename='players') THEN
    CREATE POLICY "Public read players" ON players FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Public read player_stats' AND tablename='player_stats') THEN
    CREATE POLICY "Public read player_stats" ON player_stats FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Public read leaderboard' AND tablename='leaderboard') THEN
    CREATE POLICY "Public read leaderboard" ON leaderboard FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Public read cosmetics_catalog' AND tablename='cosmetics_catalog') THEN
    CREATE POLICY "Public read cosmetics_catalog" ON cosmetics_catalog FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Public read cosmetics_unlocked' AND tablename='cosmetics_unlocked') THEN
    CREATE POLICY "Public read cosmetics_unlocked" ON cosmetics_unlocked FOR SELECT USING (true);
  END IF;

  -- Écriture service_role
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Service write players' AND tablename='players') THEN
    CREATE POLICY "Service write players" ON players FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Service write player_stats' AND tablename='player_stats') THEN
    CREATE POLICY "Service write player_stats" ON player_stats FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Service write leaderboard' AND tablename='leaderboard') THEN
    CREATE POLICY "Service write leaderboard" ON leaderboard FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Service write cosmetics_catalog' AND tablename='cosmetics_catalog') THEN
    CREATE POLICY "Service write cosmetics_catalog" ON cosmetics_catalog FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Service write cosmetics_unlocked' AND tablename='cosmetics_unlocked') THEN
    CREATE POLICY "Service write cosmetics_unlocked" ON cosmetics_unlocked FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
