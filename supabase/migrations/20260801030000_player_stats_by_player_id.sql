-- player_stats était clé par player_name (pseudo texte), ce qui casse la
-- continuité des stats quand un joueur se renomme, et fait collisionner deux
-- joueurs avec le même pseudo sur la même ligne. On bascule la clé sur
-- player_id (UUID stable), comme toutes les autres tables joueur.

ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS player_id UUID REFERENCES players(id) ON DELETE CASCADE;

-- Backfill : uniquement les lignes où le pseudo ne correspond qu'à un seul
-- joueur (non ambigu). Les lignes ambiguës (pseudo partagé) ou orphelines
-- (joueur renommé/supprimé depuis) restent player_id NULL et seront purgées
-- ci-dessous — aucune trace fiable de sondage historique fiable en prod à ce
-- jour (dataset de test uniquement, pré-lancement).
UPDATE player_stats ps
SET player_id = p.id
FROM players p
WHERE p.pseudo = ps.player_name
  AND (SELECT COUNT(*) FROM players p2 WHERE p2.pseudo = ps.player_name) = 1;

DELETE FROM player_stats WHERE player_id IS NULL;

ALTER TABLE player_stats ALTER COLUMN player_id SET NOT NULL;

-- Retire l'ancienne contrainte unique sur player_name (nom variable selon
-- l'historique de création de la table), remplace par une contrainte unique
-- sur player_id.
DO $$
DECLARE
  cons record;
BEGIN
  FOR cons IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'player_stats'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE '%player_name%'
  LOOP
    EXECUTE 'ALTER TABLE player_stats DROP CONSTRAINT ' || quote_ident(cons.conname);
  END LOOP;
END $$;

ALTER TABLE player_stats ADD CONSTRAINT player_stats_player_id_key UNIQUE (player_id);
