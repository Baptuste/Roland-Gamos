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
- **PixelLab** retenu — endpoint **Bitforge** (`create-image-bitforge`) : supporte une image de style de référence (`styleImage` + `styleStrength`), sortie 64×64 (dans la limite 200×200 de l'endpoint), fond transparent (`noBackground`).
- Contraintes de format (héritées du doc d'origine, toujours valables) : buste uniquement (tête + épaules, coupé au sternum), aucun bras/main visible, cadrage frontal ou 3/4, fond transparent, pixel art ~16 couleurs, pas d'anti-aliasing.
- Étape critique : **verrouiller une image de style de référence** avant toute génération en série, pour garantir la cohérence visuelle entre tous les avatars (pas encore fait — à créer).
- Script prévu : `src/scripts/assets/generateAvatars.ts` (manifest JSON de prompts → appel Bitforge → sauvegarde locale → upload Supabase Storage → insertion catalogue), sur le modèle des scripts ETL existants.
- Stockage : Supabase Storage, bucket `Assets`, `avatars/<slug>.png`, URL publique dans `cosmetics_catalog.asset_url`.
- Catégories avatar : `personnage` (peut être Neutre), `artiste_reel` (jamais Neutre — poids culturel), `animal` (variable). Principe "symbole > visage" quand un symbole iconique est plus fort que le visage (ex. masque, animal totem).
- ⚠️ **Point de vigilance signalé, non tranché avec l'utilisateur** : les avatars inspirés d'artistes réels posent un risque de droit à l'image / droit à la ressemblance, indépendamment du fait que le prompt ne nomme jamais l'artiste réel (ça protège de la modération DALL-E/PixelLab, pas d'un litige commercial). À garder en tête pour la suite.

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
- **Frontend (phase 3)** : rien discuté.

---

## 5. Environnement de travail (note pour la continuité)

Les décisions ci-dessus ont été prises via un environnement sans accès en écriture au repo réel ni à Supabase (analyse en lecture seule via API GitHub + requêtes SQL exécutées manuellement par l'utilisateur). Le schéma Supabase réel (uuid partout, colonnes mortes sur `collaborations`) a été vérifié par requêtes directes le 2026-07-31 — à revalider si des migrations sont appliquées entre-temps.
