# Roland-Gamos — CLAUDE_3.md

> Document vivant. Capture les décisions prises pour la réécriture totale du projet (structure conservée en base Supabase, code réécrit par phases : backend → ETL → frontend). À compléter au fil des prochaines sessions.

---

## 0. Contexte de la réécriture

- Décision : réécriture complète du code, **conservation intégrale de la base Supabase** (projet `idbppxeyewbyfppemzcs`, ~8569 artistes / 72047 collaborations déjà ingérées).
- Motivation : dette accumulée au fil des 23 commits d'origine (fixes successifs sur GameDataStore, UUIDs, ETL) + fiabilité de la structure à revoir globalement.
- Approche : **phasée** — Backend d'abord, puis ETL, puis Frontend.
- Contrainte d'environnement : aucun accès en écriture direct à ce repo ni à Supabase depuis l'environnement d'analyse utilisé pour ces décisions — tout passe par lecture API GitHub + requêtes SQL exécutées manuellement par l'utilisateur. Ce document doit donc être committé manuellement dans le repo réel.

---

## 1. Constats sur l'état réel du projet (avant réécriture)

Ces constats ont motivé plusieurs décisions ci-dessous — à garder en mémoire pour ne pas reproduire les mêmes incohérences.

- **Le mode Multijoueur ne respecte pas la "règle absolue"** du README (zéro appel réseau en partie) : `GameManager` → `GameService` → `ValidationService` interroge encore MusicBrainz/Wikidata en live. Seuls Solo Infini et Solo vs Bot sont déjà passés sur `GameDataStore` (RAM-only).
- **3 implémentations de scoring divergentes coexistaient** : `ScoringService` (multiplicative, jamais importée par aucun manager — code mort), `SoloManager` (additive, copie locale), `BotManager` (autre échelle encore, avec `pairBonus`/`degreeBonus`/`categoryBonus` hardcodés à 0).
- **`category_bonus` était inversé par rapport à l'intention documentée** : en prod, `ultra_mainstream = 80` et `underground = 10` (plus un artiste est connu, plus le bonus est haut) — l'exact inverse du README et de `ScoringService`, qui voulaient récompenser les picks obscurs/risqués. Confirmé par lecture directe de `push-to-supabase.ts` (`assignCategory()`, basé sur `fr_collab_count`).
- **Le pipeline `jobs/popularity/*`** (ListenBrainz + Wikipedia/Wikidata + MusicBrainz, scoring pondéré + quantiles) **n'est pas ce qui alimente réellement `artists.category`/`category_bonus`** en prod — c'est la fonction simple `assignCategory()` basée sur `fr_collab_count`. Le pipeline sophistiqué semble être un système parallèle jamais branché sur les données live, et jugé peu fiable à l'époque de son intégration.
- **`degree_bonus`/`pair_bonus` sont en réalité quasi non fonctionnels** : `DegreeProvider`/`PairStatsProvider` sont bien conçus (cache RAM, clé MBID) mais **ne sont appelés par aucun manager**. `pair_bonus` a des valeurs réelles en base (ex. 10) dont l'origine exacte n'a pas été identifiée avec certitude ; `degree_bonus` est à 0 pour ~83% des artistes, non-zéro pour le reste sans source de calcul retrouvée dans le code committé.
- **Schéma réel vs schéma versionné** : `src/scripts/schema.sql` déclare des PK `SERIAL`, mais le schéma réel Supabase utilise des **`uuid`** partout (`artists.id`, `collaborations.id`, etc.). Le repo ne reflète pas fidèlement la prod.
- **Table `collaborations` : colonnes mortes détectées.** `artist_a`/`artist_b`/`track_name`/`track_year` sont `null` sur les lignes vérifiées — le modèle réellement utilisé est `artist1_id`/`artist2_id` + table enfant `collaboration_songs`. Colonnes mortes candidates à suppression (à confirmer sur l'ensemble des lignes avant de dropper).
- **Providers orphelins** : `DegreeProvider`, `PairStatsProvider` bien conçus mais jamais branchés. `PopularityCategoryProvider` est un système de catégorisation redondant supplémentaire (seuils propres sur nombre de collaborations brut), lui aussi jamais vraiment utile une fois `jobs/popularity` supprimé.
- **Zéro test** (`jest` configuré, aucun fichier `*.test.ts`) — aucun filet de sécurité pour valider que la réécriture préserve un comportement voulu.

---

## 2. Backend — décisions actées

### 2.1 Multijoueur → GameDataStore

Le mode Multijoueur migre vers `GameDataStore` (RAM-only), comme Solo Infini et Solo vs Bot — cohérence totale avec la règle "zéro appel réseau en partie", et la latence PvP plaide justement pour du RAM-only plutôt que pour des appels live.

Couche de sécurité PvP ajoutée en plus (détails précis — durée fenêtre, seuils — **encore à définir**) :
- Vérification serveur de la propriété du tour à chaque soumission (anti double-proposition / race condition)
- Timeout de tour appliqué côté serveur (pas seulement le countdown client)
- Fenêtre de reconnexion avec resynchronisation depuis l'état autoritaire de `GameManager`

### 2.2 Formule de score unifiée (remplace les 3 implémentations existantes)

```
base        = BASE_POINTS(100) + timeBonus + chainBonus
raw         = base × categoryMult × degreeMult × pairMult
finalScore  = min(round(raw), 300)          // compté au leaderboard/XP
overflow    = max(0, round(raw) - 300)      // déclenche la récompense de dépassement
```

**Time bonus** (additif, sur % du temps de tour écoulé — `TURN_DURATION_MS` à confirmer, 30s dans l'ancien SoloManager) :

| Temps écoulé | Bonus |
|---|---|
| < 20% | +50 |
| 20–40% | +35 |
| 40–60% | +20 |
| 60–80% | +10 |
| ≥ 80% | +0 |

**Chain bonus** (additif, longueur de la chaîne en cours) :

| Longueur chaîne | Bonus |
|---|---|
| ≥ 20 | +60 |
| ≥ 15 | +40 |
| ≥ 10 | +25 |
| ≥ 5 | +10 |
| < 5 | +0 |

**Category mult** : basé uniquement sur `fr_collab_count` (le pipeline `jobs/popularity` est supprimé). Sens **corrigé** par rapport à la prod actuelle : peu de collaborations connues → bonus élevé (pick risqué/obscur récompensé) ; beaucoup de collaborations → bonus faible. **Paliers exacts et valeurs de multiplicateur encore à redéfinir** (l'ancienne table `ScoringService`, dans le bon sens, servait de base : Underground ×1.12 → Ultra Mainstream ×1.00 — à valider/adapter aux vrais paliers `fr_collab_count`).

**Degree mult** (basé sur nb de collaborateurs distincts, à calculer via nouveau job offline) :

| Collaborateurs distincts | Mult |
|---|---|
| 0–10 | ×1.05 |
| 11–25 | ×1.03 |
| 26–60 | ×1.01 |
| > 60 | ×1.00 |

**Pair mult** (basé sur nb de familles de titres communes à la paire, à calculer via nouveau job offline) :

| Familles communes | Mult |
|---|---|
| 1 | ×1.30 |
| 2–3 | ×1.18 |
| 4–7 | ×1.08 |
| 8–15 | ×1.03 |
| > 15 | ×1.00 |

### 2.3 Récompense de dépassement ("Dépassement")

- **À chaque dépassement** (`raw > 300`) : bonus XP = montant du dépassement, ajouté à l'XP du tour. Incrémente `player_stats.overflow_count`.
- **Au premier dépassement uniquement** (`overflow_count` atteint 1) : déblocage simultané, via le mécanisme `UnlockService.checkUnlocks()` existant (condition `{"metric":"overflow_count","min":1}` sur les deux lignes) :
  - Titre **"Dépassement"** (`type='titre'`)
  - Aura **"Dépassement"** (`type='aura'`, rareté `plutonium`), `render_config` :
    ```json
    {
      "primitive": "composite",
      "layers": [
        { "primitive": "glow", "params": { "colors": ["#ffd700", "#ffffff"], "pulseSpeed": 1.5, "blurRadius": 18, "opacity": [0.4, 0.9] } },
        { "primitive": "particles", "params": { "shape": "spark", "palette": ["#ffd700", "#ffffff", "#ffec8b"], "count": 30, "spawnRate": 8, "lifetime": 900, "gravity": -0.05, "sizeRange": [1, 3] } }
      ]
    }
    ```
- Tous les dépassements suivants : XP bonus seulement, pas de nouveau déblocage.

### 2.4 Job offline "métriques artiste" (remplace DegreeProvider/PairStatsProvider en runtime)

- Calcule et persiste des **métriques brutes** (pas des multiplicateurs) :
  - `artists.collab_degree` : nb de collaborateurs distincts (remplace l'usage de `degree_bonus` en tant que valeur brute)
  - `collaborations.pair_family_count` : nb de familles de titres communes (via `titleFamilyNormalizer` déjà existant)
- Les tables de multiplicateurs (§2.2) restent **en code**, pas en base — permet de retoucher l'équilibrage sans rejouer l'ETL.
- **Point bloquant à résoudre avant d'écrire ce job** : `DegreeProvider`/`PairStatsProvider` sont conçus autour d'une clé **MBID**, alors que le modèle de données réel utilise des `uuid` (`artists.id`, `collaborations.artist1_id/2_id`). Il faut faire le pont entre ces deux espaces de clés.

### 2.5 Suppressions actées

- `jobs/popularity/*` en entier (ingest ListenBrainz/Wikidata/MusicBrainz, `PopularityScoreJob`, `PopularityQuantilesJob`, `PopularityNormalizer`, `PopularityRepository`) + scripts `popularity:*` de `package.json`. Raison : jugé peu fiable à l'intégration, et de toute façon jamais réellement branché sur les données live.
- `PopularityCategoryProvider` (système de catégorisation redondant, seuils propres sur collaborations brutes).
- `ScoringService` actuel (remplacé par la formule unifiée §2.2), `DegreeProvider`/`PairStatsProvider` actuels (remplacés par le job offline §2.4, la logique runtime elle-même — cache MBID — n'est pas reprise telle quelle).
- Colonnes mortes probables sur `collaborations` : `artist_a`, `artist_b`, `track_name`, `track_year` — **à confirmer sur l'ensemble des lignes avant suppression effective** (vérifié `null` sur l'échantillon consulté uniquement).

### 2.6 Encore ouvert (backend)

- Détails précis de la couche PvP (durée fenêtre de reconnexion, seuils de rate-limiting anti-triche).
- Paliers exacts et valeurs de `categoryMult` (basés sur `fr_collab_count`, sens corrigé).
- Structure de dossiers/modules du nouveau backend (pas encore esquissée — le gros du travail jusqu'ici a porté sur la logique métier, pas l'organisation du code).
- Stratégie de tests pour sécuriser la réécriture.

---

## 3. Cosmétiques — décisions actées

### 3.1 Schéma à ajouter (migration à écrire)

Sur `cosmetics_catalog` :
- `avatar_category TEXT` — `personnage` / `artiste_reel` / `animal`
- `nom_reference TEXT` — regroupe les variantes d'un même artiste réel (pas de relation parent/enfant en table)
- `render_config JSONB` — paramètres de rendu procédural pour les auras
- `CHECK` supplémentaire : interdiction de `rarity='neutre'` quand `avatar_category='artiste_reel'`

Sur `player_stats` :
- `overflow_count INTEGER DEFAULT 0`

Seeds à ajouter : titre "Dépassement" + aura "Dépassement" (voir §2.3).

### 3.2 Pipeline Avatars — remplace DALL-E

- **DALL-E abandonné** : pas viable long terme (pas de vrai pixel art natif, nécessite un post-traitement de pixelisation jamais implémenté dans le pipeline documenté).
- **PixelLab** retenu — endpoint **Bitforge** (`POST https://api.pixellab.ai/v2/create-image-bitforge`, auth `Authorization: Bearer <token>`) : connexion testée et validée le 2026-07-31 (`npm run pixellab:test`, script `src/scripts/assets/testPixelLabConnection.ts`). Supporte une image de style de référence (`style_image`), une taille `image_size: {width, height}` (max 200×200), fond transparent (`no_background`). Réponse : `{ image: { type: 'base64', base64 }, usage: { type: 'generations', generations } }` — compte à crédits de génération, pas de facturation USD directe malgré ce qu'indique la doc publique.
- **Résolution retenue : 128×128** (tranché empiriquement le 2026-07-31 par comparaison directe 64/128/200) :
  - 64×64 : correct mais basique, peu de détail.
  - **128×128 : le point idéal** — détail net (visage, accessoires, texture pixel art) tout en restant cohérent, coût quasi identique (crédits par génération, pas au pixel).
  - 200×200 (le max de l'endpoint) : **dégradé** — le modèle perd la cohérence du sujet (têtes dupliquées/déformées, effet de collage). Ne pas utiliser malgré le fait que ce soit la limite technique de l'endpoint.
- Contraintes de format (héritées du doc d'origine, toujours valables) : buste uniquement (tête + épaules, coupé au sternum), aucun bras/main visible, cadrage frontal ou 3/4, fond transparent, pixel art ~16 couleurs, pas d'anti-aliasing.
- Étape critique restante : **verrouiller une image de style de référence** avant toute génération en série, pour garantir la cohérence visuelle entre tous les avatars (pas encore fait — à créer).
- Script prévu : `src/scripts/assets/generateAvatars.ts` (manifest JSON de prompts → appel Bitforge → sauvegarde locale → upload Supabase Storage → insertion catalogue), sur le modèle des scripts ETL existants.
- Stockage : Supabase Storage, bucket `Assets`, `avatars/<slug>.png`, URL publique dans `cosmetics_catalog.asset_url`.
- Catégories avatar : `personnage` (peut être Neutre), `artiste_reel` (jamais Neutre — poids culturel), `animal` (variable). Principe "symbole > visage" quand un symbole iconique est plus fort que le visage (ex. masque, animal totem).
- **Positionnement retenu (2026-07-31) : les avatars "artiste_reel" sont présentés comme des caricatures**, pas des portraits réalistes. Ça réduit le risque de droit à l'image (registre humoristique/stylisé assumé) mais ne l'élimine pas complètement : la caricature protège bien en contexte éditorial/satirique, moins nettement pour un usage commercial (cosmétique monétisée) au regard du droit à l'image patrimonial français. Le vrai filet de sécurité reste le principe déjà acté ci-dessus : "symbole > visage" (masque, animal totem, élément iconique plutôt que ressemblance faciale directe) + prompt qui ne nomme jamais l'artiste réel. Point à garder en tête, pas un feu vert juridique définitif.

### 3.3 Moteur d'aura procédural — remplace le CSS/SVG figé du doc d'origine

- Composant `AuraRenderer` (Canvas2D + `requestAnimationFrame`), piloté par `render_config` JSON stocké en base.
- 4 primitives couvrent toutes les familles du doc d'origine (Élémentaires, Fusion, Culture rap) :

| Primitive | Principe | Paramètres clés |
|---|---|---|
| `glow` | Halo pulsant | palette, vitesse pulse, rayon flou, opacité |
| `particles` | Émetteur de formes | shape, palette, count, gravité, durée de vie |
| `ring` | Anneau rotatif | vitesse rotation, épaisseur, motif |
| `sprite-orbit` | Icônes orbitantes | forme icône, rayon orbite, vitesse, nombre |
| `composite` | Superposition de plusieurs primitives | liste de layers (utilisé pour les fusions + l'aura "Dépassement") |

- Toujours **aucun asset fichier stocké** pour les auras (confirmé, conforme au doc d'origine) — juste enrichi en variables par rapport à du CSS/SVG écrit à la main par item.
- **Encore ouvert** : mapping complet des ~18 auras listées dans le doc (Élémentaires : Feu, Océan, Foudre, Blizzard, Ouragan, Séisme, Ombre, Lumière ; Fusion : Plasma, Tempête, Éclipse, Vapeur ; Culture rap : Cash Money, Vinyle, Graff, Néon nuit, Gold Chain, Freestyle booth) en `render_config` — seuls quelques exemples ont été esquissés jusqu'ici.

### 3.4 Encore ouvert (cosmétiques)

- Pipeline pour **cadres**, **effets d'entrée**, **effets de validation** — aucune discussion pipeline pour ces 3 types pour l'instant. Reste des assets statiques uploadés (comme dans le doc d'origine), ou traitement procédural comme les auras ?
- Image de référence de style PixelLab à créer concrètement.

---

## 4. Phases non abordées

- **ETL (phase 2)** : rien discuté sur la réécriture de `etl.ts` / `push-to-supabase.ts` au-delà des constats du §1.
- **Frontend (phase 3)** : implémentation non commencée, mais un ensemble de décisions UI/UX a été validé en amont (voir §7) — ne pas repartir de zéro ni improviser sur ces points.

---

## 5. Environnement de travail (note pour la continuité)

Les décisions ci-dessus ont été prises via un environnement sans accès en écriture au repo réel ni à Supabase (analyse en lecture seule via API GitHub + requêtes SQL exécutées manuellement par l'utilisateur). Le schéma Supabase réel (uuid partout, colonnes mortes sur `collaborations`) a été vérifié par requêtes directes le 2026-07-31 — à revalider si des migrations sont appliquées entre-temps.

---

## 6. Bug `artists.popularity = 0` et filtre de trouvabilité en Solo (2026-07-31)

### Statut du bug `popularity = 0`

**Résolu par abandon, pas par réparation.** `artists.popularity` existe bien en base et vaut `0` pour tous les artistes vérifiés — confirmé par requête directe. Ce n'est pas une régression : `src/jobs/popularity/*` (pipeline `ingestJob` → `scoreJob` → `quantilesJob`, script `npm run popularity:all`) **n'a jamais alimenté cette colonne en prod** (voir constat §1) et a été **supprimé intégralement** dans le cadre de la réécriture backend (commit du 2026-07-31). Rien n'utilise `artists.popularity` dans le code actuel — la colonne reste à `0`, sans impact, et n'a pas vocation à être repeuplée. Ne pas relancer `popularity:all` : le script n'existe plus.

### Filtre de sélection automatique en Solo

**Problème réel identifié :** en jeu, la sélection automatique d'artiste (seed de partie, et choix du bot à chaque tour en Solo vs Bot) tirait au hasard dans tout le pool sans filtrer par notoriété — un artiste très confidentiel pouvait être imposé au joueur sans qu'il l'ait choisi lui-même.

**Solution actée :** filtrer sur `artists.category` (5 paliers, réellement peuplé via `assignCategory()`/`fr_collab_count` — voir §1), pas sur `popularity`. Implémenté dans `src/config/soloArtistFilter.ts` :
- `SOLO_MIN_ARTIST_CATEGORY` (défaut `'niche'`, configurable via la variable d'env `SOLO_MIN_ARTIST_CATEGORY`) — catégorie minimale en dessous de laquelle un artiste est exclu de la sélection automatique. Défaut : exclut uniquement `'underground'`, le palier le plus confidentiel.
- Appliqué à `SoloManager.chooseSeedArtist()`, `BotManager.chooseSeedArtist()`, et `BotManager.botChooseArtist()` (choix du bot à chaque tour — c'est la source la plus fréquente de propositions obscures, pas seulement le seed).
- **Ne s'applique jamais** aux artistes proposés par un joueur humain (Solo comme Multijoueur) — un joueur peut toujours répondre avec un artiste niche s'il le connaît. **Ne touche pas au Multijoueur**, qui n'a aucune sélection automatique d'artiste.
- Fallback : si aucun candidat ne passe le seuil (ex. un artiste très peu connecté n'a que des collaborateurs `underground`), le filtre se relâche automatiquement plutôt que de bloquer la partie.

**Ajustement du seuil — testé empiriquement (2026-07-31), conclusion : ne pas toucher au seuil par défaut.**
`category` est un classement **relatif** par quintiles de `fr_collab_count` (5 paliers de ~1714 artistes chacun sur la base actuelle), pas une mesure absolue de notoriété. Test concret : l'artiste `2CheeseMilkShake` (repéré comme nom douteux lors des tests en direct, cf. §7.7-like constat) n'a que **8 collaborations FR recensées**, mais tombe dans la catégorie **`ultra_mainstream`** — le palier le plus haut, faute d'une distribution suffisamment étalée. Conséquence : remonter `SOLO_MIN_ARTIST_CATEGORY` ne changerait rien pour ce cas précis (déjà dans la catégorie la plus élevée), et le pousser jusqu'à exclure `ultra_mainstream` viderait ~80 % du pool de sélection automatique — bien trop agressif. Le seuil reste donc à `niche` (défaut inchangé). Ce cas précis n'est pas une erreur ETL (ses collaborateurs — Busta Flex, DJ Weedim, Biffty — sont de vrais artistes FR reconnus, donc probablement un vrai nom de scène/posse cut), contrairement à l'entrée fusionnée `¥$, Kanye West & Ty Dolla $ign` (3 crédits mergés en un seul artiste) qui, elle, a été exclue manuellement (`status = 'excluded'`, JSON local + Supabase) le 2026-07-31.

**Encore ouvert (au 2026-07-31) :**
- Cas d'un artiste "connu mais niche dans sa catégorie" (ex. tête d'affiche d'un sous-genre) : non traité différemment pour l'instant — le filtre ne regarde que `category`, pas de logique par sous-catégorie/scène.
- La limite structurelle ci-dessus (catégorisation relative, pas absolue) reste vraie pour tout futur cas similaire à `2CheeseMilkShake` : un filtre par `category` seul ne suffira jamais à garantir "un nom reconnaissable", seulement "pas dans le palier le plus bas du classement interne".

### 2.5 Mise à jour (2026-08-01) — `category` remplacé par une vraie donnée de popularité (Last.fm)

**Ce qui change :** `assignCategory()` basé sur `fr_collab_count` (§6 ci-dessus) est **remplacé**, pas complété — un artiste peu connecté dans ce dataset local n'est pas forcément peu populaire dans la vraie vie (cas `2CheeseMilkShake` ci-dessus), et inversement. Deux sources de vérité en parallèle auraient été pires que le problème d'origine.

**Pourquoi Last.fm et pas Spotify :** l'API Web Spotify a supprimé les champs `popularity` et `followers` de ses endpoints Get Artist en "Development Mode" (migration officielle de février 2026) ; Roland-Gamos n'a aucune app Spotify existante donc toute nouvelle app tomberait dans ce mode restreint — l'option "score `popularity` officiel Spotify" est donc indisponible en pratique. Les auditeurs mensuels Spotify n'ont de toute façon jamais été exposés par l'API officielle (uniquement visibles sur l'app/le site — scraping ou APIs tierces uniquement, zone grise ToS). Last.fm expose légalement et gratuitement `stats.listeners`/`stats.playcount` via `artist.getinfo`.

**Schéma (migration `20260801000000_lastfm_popularity.sql`) :** `artists.lastfm_listeners` (int), `artists.lastfm_playcount` (bigint), `artists.lastfm_synced_at` (timestamptz, pour un refresh périodique futur — non automatisé pour l'instant, à lancer manuellement).

**Pipeline (`npm run popularity:lastfm`, `src/scripts/computeLastfmPopularity.ts`) :**
1. Ingestion : pour chaque artiste, interroge Last.fm par `mbid` (déjà résolu via MusicBrainz à l'ETL — priorité, évite les faux positifs sur homonymes) ou par nom en secours. Rate-limit conservateur (~3,3 req/s). Les artistes introuvables sur Last.fm sont loggés, pas bloquants.
2. Catégorisation : **7 paliers** (au lieu de 5) en **quantiles relatifs** sur `lastfm_listeners` de tous les artistes — toujours pas de seuils absolus fixes, pour la même raison que documentée ci-dessus (§6). Nouveaux paliers `confidentiel` (sous `underground`) et `connu` (entre `intermediate` et `mainstream`) ; les 5 noms et multiplicateurs de bonus existants (`underground`=1.12 → `ultra_mainstream`=1.00 dans `ScoringService.calculateCategoryMult`) sont inchangés pour rester compatibles avec une éventuelle config `SOLO_MIN_ARTIST_CATEGORY` déjà déployée.
3. Prérequis : `LASTFM_API_KEY` dans `.env` (créer une clé sur https://www.last.fm/api/account/create — **non fournie**, l'utilisateur doit l'ajouter avant de lancer le script en conditions réelles).

**Qualification à l'ingestion (`push-to-supabase.ts`) :** un artiste nouvellement importé reçoit une catégorie **provisoire neutre** (`'intermediate'`) le temps qu'il soit synchronisé avec Last.fm — évite de le pénaliser ou de le favoriser à tort avant d'avoir une vraie donnée. `mbid` est désormais bien transmis à l'upsert Supabase (oubli corrigé — la colonne existait déjà en base mais n'était jamais peuplée par ce script, ce qui aurait cassé le matching par `mbid` prévu ici).

**Lien avec le filtre Solo :** `src/config/soloArtistFilter.ts` réutilise directement `ArtistCategory`/`CATEGORY_RANK` sans dupliquer de logique de catégorisation — juste étendu à 7 valeurs. `SOLO_MIN_ARTIST_CATEGORY` reste à `'niche'` par défaut, ce qui exclut désormais `'confidentiel'` **et** `'underground'` (élargissement mécanique dû à l'ajout du palier `confidentiel` sous `underground`, pas un changement de seuil délibéré).

**Non fait (hors scope de cette itération) :** refresh périodique automatique (cron) des `lastfm_listeners` — seule la colonne `lastfm_synced_at` existe pour le permettre plus tard ; critère de qualité minimal à l'ingestion ETL (avant même le premier passage Last.fm) — non implémenté, Last.fm n'étant interrogeable qu'après l'import.

---

## 7. Frontend — décisions actées (non encore implémentées)

Décisions UI/UX validées lors de sessions de design antérieures, consolidées le 2026-07-31 (`Roland-Gamos_Rapport_Ameliorations.md`). Rien de ceci n'est encore construit — **implémentation non commencée** (phase 3, voir §4) — mais à respecter telle quelle une fois la phase Frontend démarrée, pour ne pas repartir de zéro ni improviser.

### 7.1 Lobby multijoueur

**Écran intermédiaire "Planète Rap"** (avant le lobby) : 3 choix — Créer / Rejoindre / Inviter.

**Configuration réservée à l'hôte** (aucune édition possible pour les non-hôtes, résumé en lecture seule) :
- Temps par tour : 15 / 30 / 60s
- Vies : 1 / 2 / 3
- Jokers : on / off
- Teams : on / off
- Mode élimination : on / off

**État réel actuel (`MultiplayerHomeScreen.tsx` sur `main`) :** hôte basique, aucune de ces options n'est implémentée — écart confirmé entre spec et code.

### 7.2 Jokers (multijoueur uniquement — aucun en Solo)

- 7 jokers au total, rattachés visuellement à chaque avatar (dans le lobby et en jeu).
- Liste exhaustive des 7 jokers **pas encore formalisée** — à compléter avant implémentation.

### 7.3 Backgrounds validés par écran

| Écran | Background |
|---|---|
| Menu principal | Paris by night pixel art (or + violet, immeubles haussmanniens, lune, néons) |
| Solo Infini | Studio d'enregistrement bleu nuit + or, voyant REC rouge |
| Planète Rap (multi) | Tons chauds, enseigne néon "Saturn", table ronde |
| Ring de Battle (Solo Bot) | Salle de concert, podiums, écran LED VS (sans texte "VS" central), silhouettes de foule |
| Fin de partie | Podium parisien pixel art, confettis or + violet |

### 7.4 Écrans de jeu validés

- **Solo Infini :** avatar en cabine de studio derrière vitre, timer sur écran console, saisie sur la console, pas de jokers.
- **Solo Bot :** avatars + score sur podiums, zone de saisie entre les podiums, timer sur écran LED, pas de jokers.
- **Multijoueur :** avatars isométriques autour d'une table ronde, tablette centrale (saisie + dernier feat + timer), jokers accrochés à chaque avatar.

### 7.5 Flows UI/UX validés

- Accueil : bouton JOUER central, trophée en haut à gauche, réglages en haut à droite.
- Sélection de mode : 3 cartes horizontales empilées (Solo Infini/violet, Solo Bot/or, Multi/rouge).
- Profil : tap sur un avatar → profil complet si le sien, lecture seule si adversaire.
- Fin de partie : 2 étapes (podium → XP + unlocks), boutons REJOUER + ACCUEIL uniquement.

### 7.6 Identité visuelle globale

- Logo R/G, palette dark navy `#06060f` / or `#ffd700` / violet `#9b59ff` / rouge `#ff4444`.

### 7.7 Note sur les branches `claude/elated-zhukovsky` et `claude/modest-herschel`

Un audit externe avait signalé ces deux branches comme potentiellement porteuses de travail non mergé ("Solo vs Bot, écrans Leaderboard/Stats, refonte pixel art"). **Vérifié le 2026-07-31 : ce n'est pas le cas.** Le commit en question (`f67b671`) est déjà un ancêtre de `main`. Les deux branches datent d'avril 2026 (bien avant la réécriture backend de juillet) et ne contiennent, en exclusif, que des fichiers volontairement supprimés cette session (`railway.json`/docs Railway, `jobs/popularity/*`, providers MBID morts). `MultiplayerHomeScreen.tsx` y est identique à `main`. Rien à récupérer — branches obsolètes, sans risque à supprimer.
