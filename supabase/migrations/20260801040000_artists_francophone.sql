-- Marque les artistes francophones (langue parlée = français OU nationalité
-- France/Belgique/Suisse via Wikidata), pour restreindre le choix du premier
-- artiste (seed) en Solo Infini / Solo vs Bot aux débuts francophones — le
-- graphe de collaborations peut atteindre des artistes non francophones via
-- des featurings internationaux, mais l'ouverture doit rester francophone.
-- NULL = pas encore classifié (npm run francophone:compute).
ALTER TABLE artists ADD COLUMN IF NOT EXISTS is_francophone BOOLEAN;
