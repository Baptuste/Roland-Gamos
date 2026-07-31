# CLAUDE.md — Roland-Gamos
> Fichier de contexte pour Claude Code. Mis à jour le 20 avril 2026.
> Ce fichier remplace toutes les versions précédentes.

---

## PRÉSENTATION DU PROJET

Roland-Gamos est un jeu mobile multijoueur tour par tour centré sur la culture rap français. Le principe : les joueurs doivent enchaîner des artistes via leurs collaborations (feats). Si l'artiste A a featé avec l'artiste B, le joueur peut jouer B après A.

**Stack technique :**
- Frontend : React Native (Expo)
- Backend : Node.js / TypeScript sur Render
- Base de données : Supabase (PostgreSQL)
- Temps réel : WebSocket
- Données musicales : Genius API
- Authentification : UUID local (pas d'email au lancement)

---

## ÉTAT ACTUEL DU PROJET

### Ce qui est opérationnel
- Backend déployé sur **Render** (migration Railway → Render finalisée)
- Supabase configuré et opérationnel
- ETL Wave 4 terminé : **8 569 artistes** + **72 047 collaborations** importés
- `degree_bonus` calculé sur toute la base (379 artistes à +15, 446 à +10, 583 à +5)
- `GameDataStore` adapté et fonctionnel
- `ValidationService` + `ScoringService` fonctionnels et testés
- Modes de jeu codés (Solo Infini, Solo vs Bot, Multijoueur)
- Leaderboard partiellement implémenté (`LeaderboardScreen.tsx` existant)
- Historique caché par défaut — seul le dernier artiste joué est visible
- Frontend avec autocomplete artistes
- Assets visuels uploadés dans Supabase Storage (bucket `Assets`)

### Ce qui reste à faire
Voir checklist complète en fin de fichier.

---

## SCHÉMA BASE DE DONNÉES

### Table `players`
```sql
id            uuid (PK)
auth_id       uuid (dormant, pour future auth)
pseudo        text
total_score   integer
level         integer
xp            integer  -- À AJOUTER
coins         integer  -- Dormant, ne pas utiliser
is_anonymous  boolean
created_at    timestamptz
last_seen_at  timestamptz
```

### Table `player_stats`
```sql
id                        integer (PK)
player_name               text
total_games               integer
total_solo_games          integer
total_bot_games           integer
total_multiplayer_games   integer
best_solo_score           integer
best_solo_turns           integer
best_bot_score            integer
total_score               integer
bot_wins                  integer
bot_losses                integer
xp                        integer  -- À AJOUTER
multiplayer_wins          integer  -- À AJOUTER
multiplayer_losses        integer  -- À AJOUTER
best_multiplayer_score    integer  -- À AJOUTER
updated_at                timestamptz
```

### Table `leaderboard`
```sql
id           integer (PK)
player_id    uuid   -- À MIGRER (actuellement player_name text)
score        integer
turns        integer
mode         text   -- 'Solo Infini' | 'Solo Bot' | 'Multijoueur'
created_at   timestamptz
UNIQUE(player_id, mode)  -- À AJOUTER
```

**Important :** toujours afficher `players.pseudo` via JOIN sur `player_id`. Ne jamais stocker le pseudo directement dans leaderboard — le pseudo peut changer.

### Table `cosmetics_catalog`
```sql
id               uuid (PK)
type             text  -- 'avatar'|'aura'|'cadre'|'effet_entree'|'effet_validation'|'titre'
name             text
asset_url        text  -- URL Supabase Storage
rarity           text  -- 'neutre'|'or'|'platine'|'diamant'|'plutonium'
unlock_type      text  -- 'default'|'level'|'challenge'
unlock_condition jsonb
is_default       boolean
description      text
created_at       timestamptz
```

### Table `cosmetics_unlocked`
```sql
player_id    uuid → players.id
cosmetic_id  uuid → cosmetics_catalog.id
unlocked_at  timestamptz
```

### Table `artists`
```sql
id              uuid (PK)
name            text
popularity      integer
genius_id       integer
image_url       text
status          text
category        text  -- 'underground'|'niche'|'intermediate'|'mainstream'|'ultra_mainstream'
category_bonus  integer
degree_bonus    integer  -- 0/5/10/15
created_at      timestamptz
updated_at      timestamptz
```

### Table `collaborations`
```sql
id          uuid (PK)
artist1_id  uuid → artists.id
artist2_id  uuid → artists.id
```

---

## AUTHENTIFICATION

Pas d'email au lancement. Flux :
1. Première ouverture → génération UUID local stocké dans AsyncStorage
2. Joueur choisit un pseudo
3. Création entrée `players` (id=UUID, pseudo=...)
4. Les fois suivantes : lecture UUID local → reconnexion automatique

- Pseudos **non uniques** — l'UUID fait la distinction
- Le joueur peut modifier son pseudo depuis l'écran Paramètres
- La colonne `auth_id` est gardée pour une future intégration Supabase Auth

---

## SYSTÈME XP / NIVEAUX

```typescript
xp_gagné = Math.min(Math.floor(score_partie / 10), 28)  // cappé à 28/partie
```

**40 niveaux :**
| Niveaux | XP requis par niveau |
|---------|---------------------|
| 1–10    | 50 XP               |
| 11–20   | 100 XP              |
| 21–30   | 200 XP              |
| 31–40   | 350 XP              |

**4 prestiges :**
| Prestige | Niveaux | Label    |
|----------|---------|----------|
| 1        | 1–10    | Rookie   |
| 2        | 11–20   | Street   |
| 3        | 21–30   | Vétéran  |
| 4        | 31–40   | Légende  |

---

## SERVICES À CRÉER

### XPService
```typescript
async function addXP(playerId: string, score: number): Promise<{
  xpGained: number,
  newXP: number,
  newLevel: number,
  leveledUp: boolean,
  prestige: string
}>
function getLevelFromXP(totalXP: number): number
function getPrestige(level: number): string
function getXPForNextLevel(level: number): number
```

### UnlockService
```typescript
async function checkUnlocks(
  playerId: string,
  newLevel: number,
  stats: PlayerStats
): Promise<CosmeticItem[]>
async function triggerUnlock(playerId: string, cosmeticId: string): Promise<void>
```

### Format unlock_condition (JSONB)
```json
{ "level": 13 }
{ "type": "multiplayer_wins", "value": 10 }
{ "type": "bot_wins", "value": 5 }
{ "type": "solo_score", "value": 500 }
{ "type": "chain_length", "value": 15 }
{}
```

---

## FLUX FIN DE PARTIE

```
Partie terminée
  → ScoringService.finalScore()
  → LeaderboardService.upsert(playerId, score, turns, mode)
  → player_stats.update(total_score, best_score, wins/losses, games...)
  → XPService.addXP(playerId, score)
      → level up ?
          → UnlockService.checkUnlocks(playerId, newLevel, stats)
              → nouveaux items → retourner au frontend
```

**Réponse frontend fin de partie :**
```typescript
{
  leaderboard: { rank: number, score: number },
  xp: { gained: number, total: number, level: number, leveledUp: boolean },
  unlocks: CosmeticItem[]
}
```

---

## LEADERBOARD — UPSERT

```sql
INSERT INTO leaderboard (player_id, score, turns, mode)
VALUES ($1, $2, $3, $4)
ON CONFLICT (player_id, mode)
DO UPDATE SET
  score = GREATEST(leaderboard.score, EXCLUDED.score),
  turns = CASE
    WHEN EXCLUDED.score > leaderboard.score THEN EXCLUDED.turns
    ELSE leaderboard.turns
  END;
```

---

## COSMÉTIQUES — ITEMS PAR DÉFAUT

```sql
INSERT INTO cosmetics_catalog (type, name, rarity, unlock_type, unlock_condition, is_default)
VALUES
  ('avatar', 'MC Anonyme', 'neutre', 'default', '{}', true),
  ('avatar', 'La Meuf', 'neutre', 'default', '{}', true),
  ('aura', 'Aura Neutre', 'neutre', 'default', '{}', true),
  ('cadre', 'Cadre Basique', 'neutre', 'default', '{}', true),
  ('titre', 'Rookie', 'neutre', 'default', '{}', true);
```

---

## RÈGLES MÉTIER

### Modes de jeu
- **Solo Infini** : pas de jokers, pas de bot, score cumulatif, pas de limite de temps
- **Solo vs Bot (ORACLE)** : pas de jokers, difficulté dynamique 3 phases (manches 1–7 / 8–14 / 15+)
- **Multijoueur** : jokers activables par host, 2 à 8 joueurs, mode équipe optionnel

### Historique
- Caché par défaut dans tous les modes
- Seul le dernier artiste joué est visible
- Historique complet via joker **Archives** uniquement — joueur activant, durée de son tour

### Validation
- Levenshtein pour correction de fautes de frappe
- Score calculé côté serveur uniquement (anti-triche)

### Avatars
- Format : 64×64px pixel art, tête et buste, fond transparent PNG
- ~16 couleurs, pas d'anti-aliasing, traits exagérés
- Avatars artistes réels : jamais rareté Neutre
- Symbole iconique prime sur le visage (ex: masque Freeze Corleone, singe PNL)

---

## LOGO & IDENTITÉ VISUELLE

### Logo application (validé avril 2026)
- **Style :** Split diagonal — R à gauche, G à droite, séparés par un slash doré
- **R :** violet électrique `#9b3dff`, centré dans la moitié gauche, neon glow violet
- **G :** rouge néon `#ff2244`, centré dans la moitié droite, neon glow rouge
- **Slash :** or `#ffd700`, légèrement incliné, centré entre les deux lettres, étincelles pixel art dorées le long du slash
- **Fond gauche :** bleu nuit profond `#0d0030`
- **Fond droit :** rouge sombre `#2a0005`
- **Détails :** étoiles pixel art dans les fonds, silhouettes parisiennes + Tour Eiffel en bas, barre `ROLAND-GAMOS` style arcade en bas, coins dorés arcade aux 4 coins, LED colorées haut gauche/droite
- **Sans micros** (version finale validée)
- **Format requis :** 1024×1024px pour App Store, 512×512px pour Google Play
- **Fichier :** à uploader dans Supabase Storage bucket `Assets`

### Palette globale
| Couleur | Hex | Usage |
|---------|-----|-------|
| Bleu nuit | `#06060f` | Fond principal |
| Or | `#ffd700` | Accents, bordures, boutons principaux |
| Violet | `#9b59ff` | Solo Infini, joueur, XP, auras |
| Rouge | `#ff4444` | Multijoueur, ORACLE, danger |
| Blanc | `#ffffff` | Textes principaux |
| Vert | `#44ff88` | Victoire, PRÊT, succès |

---

## ASSETS VISUELS — SUPABASE STORAGE

Bucket : `Assets`

| Fichier | Écran | Palette |
|---------|-------|---------|
| `Asset Paris-by-night.png` | Menu principal | Bleu nuit, or, violet, lune pixel |
| `Asset Solo.png` | Solo Infini | Bleu nuit, or, REC rouge |
| `Asset multi.png` | Planète Rap / Multijoueur | Tons chauds, néon Saturne |
| `Asset Solo-Bot.png` | Ring de Battle / Solo vs Bot | Rouge, foule, pupitres, sans VS central |
| `Asset fin-de-partie.png` | Fin de partie | Podium, confettis or/violet, foule |

**Format avatars :**
- 64×64px pixel art, tête + buste, fond transparent PNG
- ~16 couleurs max, pas d'anti-aliasing, traits exagérés, statiques au lancement

---

## UI/UX — FLUX DE NAVIGATION COMPLET

```
Accueil
  ├── [🏆 haut gauche] ──────────────────→ Leaderboard
  ├── [⚙️ haut droite] ──────────────────→ Paramètres
  ├── [tap avatar propre] ───────────────→ Profil
  │     └── [PERSONNALISER] ────────────→ Personnalisation (bottom sheet)
  └── [JOUER centré]
        └── Sélection des modes
              ├── Solo Infini ──────────→ Écran de jeu Solo Infini
              │     └── Fin de partie
              ├── Solo vs Bot ──────────→ Écran de jeu Solo vs Bot
              │     └── Fin de partie
              └── Multijoueur
                    └── Menu Multijoueur
                          ├── [CRÉER] ──→ Lobby (vue Host)
                          ├── [REJOINDRE]→ Lobby (vue Joueur)
                          └── [INVITER] →  Lobby
                                └── Écran de jeu Multijoueur
                                      └── Fin de partie

Tap avatar adversaire (lobby, écran de jeu) → Profil adversaire (lecture seule)

Fin de partie :
  Étape 1 (Résultats podium) → [CONTINUER]
    → Étape 2 (XP + Unlocks)
          ├── [REJOUER] → même mode, mêmes paramètres
          └── [ACCUEIL] → Accueil
```

---

## UI/UX — DÉTAIL COMPLET DE CHAQUE ÉCRAN

---

### 1. ACCUEIL

**Asset fond :** `Asset Paris-by-night.png`
Paris by night pixel art — immeubles haussmanniens, Tour Eiffel lointaine, néons or/violet, lune pixel, sol mouillé avec reflets. Centre de l'image intentionnellement dégagé pour l'UI.

**Palette UI :** or `#ffd700`, violet `#9b59ff`, blanc, monospace

**Éléments UI (z-index au-dessus du fond) :**

| Élément | Position | Style | Action |
|---------|----------|-------|--------|
| 🏆 Trophée | Haut gauche | Icône 24px, or | → Leaderboard |
| ⚙️ Engrenage | Haut droite | Icône 24px, or | → Paramètres |
| ROLAND | Centre haut | Font monospace 58px, bold, or `#ffd700` | — |
| GAMOS | Sous ROLAND | Font monospace 58px, bold, blanc | — |
| Tagline | Sous titre | `RAP FRANÇAIS — FEAT BATTLE`, violet, 12px, letter-spacing 5px | — |
| HI-SCORE XXXXX | Centre | Style arcade, violet discret, 12px | — |
| Bouton JOUER | Centre bas | Fond `#08081e`, bordure or 3px, 240×60px, font 22px bold, letter-spacing 6px | → Sélection modes |
| PROFIL | Bas discret | 11px, violet, opacity 0.6 | → Profil |
| PRESS START | Sous JOUER | 11px, blanc opacity 0.45, style arcade | — |
| v1.0 — 2026 | Tout en bas | 9px, blanc opacity 0.2 | — |

---

### 2. SÉLECTION DES MODES

**Fond :** Paris by night (continuité avec l'accueil)

**Header :**
- Flèche ← haut gauche (or) → retour Accueil
- Titre `CHOISIR UN MODE` centré, 13px, letter-spacing 4px

**Structure :** 3 cartes horizontales empilées, chacune = 1/3 de l'écran, séparées par `border-bottom: 1px solid #1a0a3a`

**Détail de chaque carte :**
- Asset fond assombri (overlay #06060f à 45%) en background de la carte
- Barre colorée 3px sur le bord gauche
- Badge mode (haut gauche) : fond sombre + bordure colorée, 9px, letter-spacing 2px
- Nom du mode : 20px, bold, blanc, 2 lignes
- Description : 10px, blanc opacity 0.55, letter-spacing 1px
- Flèche `›` droite : 22px, blanc opacity 0.3

| Carte | Asset fond | Couleur accent | Badge | Nom | Description |
|-------|-----------|----------------|-------|-----|-------------|
| Solo Infini | `Asset Solo.png` | Violet `#9b59ff` | SOLO | SOLO / INFINI | Enchaîne le plus de feats possible sans limite de temps |
| Solo vs Bot | `Asset multi.png` | Or `#ffd700` | BOT | SOLO / VS BOT | Affronte ORACLE, l'IA qui connaît tout le rap FR |
| Multijoueur | `Asset Solo-Bot.png` | Rouge `#ff4444` | MULTI | MULTI- / JOUEUR | Défie tes amis en duel ou rejoins une partie |

**Scalabilité :** ajouter un mode = ajouter une carte en bas, aucune refonte.

---

### 3. MENU MULTIJOUEUR

**Asset fond :** `Asset multi.png` (Planète Rap assombri)

**Header :**
- Flèche ← haut gauche → retour Sélection modes
- Titre `MULTIJOUEUR` centré
- Badge `MULTI` rouge (haut droite du titre)

**Éléments UI :**

| Élément | Style | Action |
|---------|-------|--------|
| Bouton CRÉER | Fond `#0d0020`, bordure rouge 2px, icône 🎮, titre rouge 16px bold | → Lobby (Host) |
| Séparateur OU | Ligne + texte centré, discret | — |
| Bouton REJOINDRE | Fond `#0d0020`, bordure `#3a1050` 1px, icône 🔑 | → Lobby (Joueur) |
| Champ code | Fond `#08001a`, bordure `#2a0a40`, 6 caractères `_ _ _ _ _ _`, violet | Saisie code partie |
| Séparateur AMIS | Ligne + texte centré, discret | — |
| Bouton INVITER UN AMI | Fond `#0d0020`, bordure `#3a1050`, icône 👥 | → Lobby (Invit) |

---

### 4. LOBBY

**Asset fond :** Planète Rap assombri (overlay `#06060f` à 65%)

**Barre code partie (toujours visible) :**
- Fond `#08001a`, bordure `#2a0a40`
- Label `CODE` (8px, discret) + code 6 chars (15px, or, letter-spacing 6px) + bouton `COPIER` (violet)

**Slots joueurs (2 à 8) :**
```
[AVATAR 24px] [PSEUDO + ÉQUIPE] [🃏][🃏][🃏] [BADGE]
```
- Avatar : 24×24px, border-radius 3px
- Pseudo : 9px bold blanc
- Équipe : 7px, couleur de l'équipe
- 3 slots jokers : 18×18px chacun, bordure violet si rempli, `?` si vide
- Badge statut :
  - `HOST` : fond `#1a0010`, bordure+texte rouge `#ff4444`
  - `PRÊT` : fond `#001a00`, bordure+texte vert `#44ff88`
  - `...` : fond `#1a0800`, bordure+texte orange (en attente)
- Slot vide : pointillés, opacité 30%, avatar `+`

**Mode équipe activé :**
- Headers colorés séparant les équipes : Équipe A (violet), Équipe B (orange), etc.
- Host peut réassigner les joueurs jusqu'au lancement

**Section paramètres — HOST UNIQUEMENT (modifiables) :**
- Titre `PARAMÈTRES — HOST UNIQUEMENT`, 8px, letter-spacing 3px
- Chaque paramètre : fond `#0d0020`, bordure `#2a0a40`, border-radius 4px

| Paramètre | Options | Composant |
|-----------|---------|-----------|
| Temps par tour | 15s / 30s / 60s | Toggle 3 boutons |
| Vies | 1 / 2 / 3 | Toggle 3 boutons |
| Jokers | ON / OFF | Switch toggle |
| Mode équipe | ON / OFF | Switch toggle |
| Élimination | VIES / ERREURS | Toggle 2 boutons (visible si mode équipe ON) |

**Section paramètres — JOUEUR (lecture seule) :**
- Titre `PARAMÈTRES DE LA PARTIE`
- Tableau simple : label gauche (violet discret) + valeur droite (or)
- Pas de contrôles interactifs

**Bouton fixe en bas :**
- Host : `LANCER LA PARTIE` — fond `#0d0020`, bordure rouge 2px, texte rouge bold
- Joueur : `PRÊT` — fond `#001a00`, bordure verte 2px, texte vert bold

---

### 5. ÉCRAN DE JEU — SOLO INFINI

**Asset fond :** `Asset Solo.png` (cabine régie bleu nuit/or, REC rouge haut droite)

**Zones UI superposées :**

**Zone vitre (haut, ~40% écran) :**
- Avatar 64×64px du joueur centré dans la cabine derrière la vitre
- Aura autour de l'avatar (bordure arrondie colorée selon rareté)
- Cadre cosmétique autour de l'avatar

**Zone intermédiaire (entre vitre et console) :**
- Carte **dernier feat** flottante :
  - Fond `#06060f`, bordure violet, border-radius 4px, opacity 0.92
  - Label `DERNIER FEAT` (8px, violet, letter-spacing 2px)
  - Nom feat : `ARTISTE A × ARTISTE B` (15px, blanc bold)
  - Info : titre + année (8px, or)

**Zone console (bas, ~35% écran) :**
- Moniteur gauche (waveform) : affiche **timer** `00:XX` en or + animation waveform
- Moniteur droit : affiche **score** (16px, or bold) + `CHAIN xN` (7px, violet)
- Faders : décoration pixel art, non interactifs
- Boutons lumineux : décoration pixel art

**Zone saisie (tout en bas, fixe) :**
- Label question : `QUI A FEATÉ AVEC [ARTISTE] ?` (8px, violet, letter-spacing 2px)
- Champ saisie : fond `#050c18`, bordure or 2px, border-radius 3px, texte or 14px, curseur `_`
- Hint `VALIDER ↵` droite (9px, opacity 0.5)

**Pas de jokers.**

---

### 6. ÉCRAN DE JEU — SOLO VS BOT

**Asset fond :** `Asset Solo-Bot.png` (Ring de battle, sans VS central, foule en bas)

**Zones UI superposées :**

**Écran LED fond (haut) :**
- Timer centré : fond `#0a0020`, texte or bold `XX`
- Barres HP style fighting game : rouge gauche (joueur) + bleu droite (ORACLE)

**Pupitre gauche — Joueur :**
- Avatar 36×36px avec bordure violet
- Pseudo (8px, violet)
- Score (14px, blanc bold)
- Vies : points rouges (3 max), grisés si perdus

**Pupitre droit — ORACLE :**
- Avatar 🤖 36×36px avec bordure rouge
- Label `ORACLE` (8px, rouge)
- Score (14px, blanc bold)
- Vies : points rouges

**Zone centrale entre pupitres :**
- Label `FEAT AVEC` (7px, or)
- Artiste actuel : 11px blanc bold, 2 lignes max

**Zone saisie (tout en bas, fixe) :**
- Label question : `QUI A FEATÉ AVEC [ARTISTE] ?` (7px, rouge, letter-spacing 2px)
- Champ saisie : fond `#08000f`, bordure rouge 2px, texte blanc 14px, curseur `_`
- Hint `↵` droite (rouge, opacity 0.6)

**Pas de jokers.**

---

### 7. ÉCRAN DE JEU — MULTIJOUEUR

**Asset fond :** `Asset multi.png` (Planète Rap, table ronde vue isométrique)

**Disposition des joueurs autour de la table :**
- 2 joueurs : gauche + droite
- 3 joueurs : haut + bas-gauche + bas-droite
- 4 joueurs : haut + gauche + droite + bas
- 5–8 joueurs : répartis uniformément autour de la table

**Chaque slot joueur :**
```
[AVATAR 36px avec aura + cadre]
[PSEUDO 7px]
[SCORE 9px]
[🃏][🃏][🃏] jokers
```
- Joueur actif : bordure dorée + label `▶`
- Joueurs éliminés : opacité 30%
- Jokers : 18×18px, remplis ou vides

**Tablet au centre de la table :**
- Fond `#080400`, bordure or 1.5px, border-radius 3px
- Écran tablet : `LAST FEAT` (6px, or) + `ARTISTE A × ARTISTE B` (5px, blanc)
- Timer autour du tablet : `◀ 00:XX ▶` (6px, or)

**Zone saisie (bas gauche, visible uniquement pendant son tour) :**
- Label question : `QUI A FEATÉ AVEC [ARTISTE] ?` (7px, or, letter-spacing 2px)
- Champ saisie : fond `#060300`, bordure or 2px, texte or 13px, curseur `_`
- Hint `↵` (or, opacity 0.5)

**Jokers accessibles :** tap sur ses propres slots jokers pendant son tour.

---

### 8. FIN DE PARTIE — ÉTAPE 1 (RÉSULTATS)

**Asset fond :** `Asset fin-de-partie.png`
Podium parisien pixel art — salle de concert, projecteurs dorés, confettis or/violet/rouge, foule avec téléphones, fenêtres haussmanniennes. Podium vide pour accueillir les avatars UI.

**Header :**
- Label `FIN DE PARTIE` (9px, violet, letter-spacing 4px)
- Titre `RÉSULTATS` (22px, or bold, letter-spacing 2px)

**Podium avec avatars :**

| Place | Marche | Hauteur | Taille avatar | Couleur |
|-------|--------|---------|---------------|---------|
| 1er | Or, centre | 70px | 48×48px, bordure or 3px | `#ffd700` |
| 2ème | Argent, gauche | 52px | 44×44px, bordure argent 2px | `#aaaacc` |
| 3ème | Bronze, droite | 38px | 40×40px, bordure bronze 2px | `#cd7f32` |

- Couronne 👑 au-dessus du 1er
- Médaille + rang + pseudo + score sous chaque avatar

**Stats rapides :**
- Fond `#06060f`, bordure `#1a0a3a`, border-radius 4px
- 3 colonnes : MEILLEUR FEAT | CHAIN MAX | MANCHES
- Séparateurs verticaux entre colonnes

**Bouton CONTINUER → :**
- Fond `#0d0020`, bordure or 2px, texte or bold, letter-spacing 4px
- Positionné tout en bas

**Solo Infini / Solo vs Bot :**
- Un seul avatar sur la marche 1 (victoire) ou hors podium (défaite vs ORACLE)

---

### 9. FIN DE PARTIE — ÉTAPE 2 (XP + UNLOCKS)

**Fond :** même asset podium, légèrement plus sombre

**Section XP :**
- Fond `#0d0020`, bordure violet, border-radius 6px
- Score ÷ 10 = XP gagné — formule visible (ex: `1840 ÷ 10 = +28`)
- Mention `CAP ATTEINT` si 28 XP
- Barre XP : fond `#0a0020`, remplissage violet, hauteur 8px
- Labels : niveau actuel (violet bold) + `XXX / XXX XP` (violet discret)
- Progression avant/après visible

**Encart LEVEL UP (si applicable) :**
- Fond `#1a0040`, bordure or 2px, icône ⬆️, texte `LEVEL UP !` + `Niveau XX débloqué`

**Liste items débloqués :**
- Titre `NOUVEAUX ITEMS DÉBLOQUÉS` (8px, discret, letter-spacing 3px)
- Chaque item : fond `#0d0020`, bordure colorée selon rareté
  - Icône 44×44px avec bordure colorée
  - Nom item (11px, blanc bold)
  - Source (8px, couleur rareté) : `Débloqué au niveau XX` ou `Défi : ...`
  - Badge rareté droite : fond + bordure + texte dans couleur rareté

**Couleurs par rareté :**
| Rareté | Couleur |
|--------|---------|
| Neutre | Gris `#888` |
| Or | `#ffd700` |
| Platine | `#b0c4de` |
| Diamant | `#7fffd4` |
| Plutonium | `#cc44ff` |

**Boutons bas (2 boutons) :**
- `REJOUER` : secondaire, fond `#08001a`, bordure `#2a0a40`, texte violet
- `ACCUEIL` : principal, fond `#0d0020`, bordure or 2px, texte or bold

---

### 10. PERSONNALISATION

**Fond haut (visible derrière le drawer) :** Paris by night étoilé

**Zone avatar (haut, ~48% écran) :**
- Pseudo : 13px bold, or, letter-spacing 3px
- Niveau + prestige : `NIVEAU XX · PRESTIGE`, 10px, violet
- Avatar 64×64px centré avec :
  - Aura : anneau arrondi autour, coloré selon rareté aura
  - Cadre : bordure rectangulaire, colorée selon rareté cadre
- Badge titre : fond `#1a0040`, bordure violet, 9px, letter-spacing 2px

**Bottom sheet (mi-écran, dragable) :**
- Handle : barre 36×3px, violet, border-radius 2px, centré en haut
- Fond `#0d0825`, border-top : 2px solid violet
- border-top-left-radius + border-top-right-radius : 20px

**5 onglets dans le drawer :**
| Onglet | Contenu |
|--------|---------|
| AVATAR | Personnages pixel art |
| AURA | Halos colorés |
| CADRE | Bordures de l'avatar |
| EFFET | Effets d'entrée + validation |
| TITRE | Badges texte |

- Onglet actif : texte or, border-bottom or 2px
- Onglet inactif : texte `#4a3070`

**Grille items (4 colonnes × 2 lignes visibles + scroll) :**
- Item normal : fond `#150a30`, bordure `#2a1060`
- Item sélectionné : fond `#1a0a3a`, bordure or 2px
- Item verrouillé : opacité 35% + cadenas 🔒 en haut droite (8px)
- Icône item centré : 20px
- Rareté sous l'icône : 7px, couleur selon rareté

**Bouton ÉQUIPER :**
- Fixe en bas du drawer
- Fond `#1a0040`, bordure or 2px, texte or bold, letter-spacing 3px

---

### 11. PROFIL

**Fond :** Paris by night étoilé (même que personnalisation)

**Header :**
- Flèche ← haut gauche → retour
- Titre `PROFIL` centré

**Zone identité (haut) :**
- Avatar 72×72px avec aura (anneau violet) + cadre (bordure or)
- Pseudo : 18px bold, or, letter-spacing 2px
- Badge titre : fond `#1a0040`, bordure violet, 9px, letter-spacing 2px
- Niveau + prestige : `NIVEAU XX · PRESTIGE`, 11px, violet
- Barre XP :
  - Label `XP` gauche + `XXX / XXX` droite, 8px
  - Fond `#0a0020`, remplissage violet, hauteur 8px, largeur 200px
- Bouton `PERSONNALISER` : fond `#0d0020`, bordure violet, 10px, letter-spacing 2px

**Section stats (4 cartes) :**
- Fond `#0d0020`, bordure `#2a0a40`, border-radius 4px
- Disposition : 4 cartes en ligne, gap 6px

| Carte | Valeur | Couleur |
|-------|--------|---------|
| PARTIES | nombre | blanc |
| MEILLEUR SCORE | score | or |
| VICTOIRES | nombre | vert `#44ff88` |
| DÉFAITES | nombre | rouge `#ff4444` |

**Section prochain niveau :**
- Titre `PROCHAIN NIVEAU — NV. XX` (8px, discret, letter-spacing 3px)
- 2–3 items qui se débloquent au niveau suivant
- Chaque item : fond `#0d0020`, bordure colorée rareté
  - Icône 40×40px + nom + type + badge rareté

**Profil adversaire (lecture seule) :**
- Même structure mais sans barre XP, sans bouton PERSONNALISER, sans section prochain niveau
- Stats visibles : parties / meilleur score / victoires / défaites

**Accès au profil :**
- Tap sur son propre avatar (accueil, lobby, fin de partie) → profil complet
- Tap sur avatar adversaire (lobby, écran de jeu) → profil adversaire lecture seule

---

### 12. PARAMÈTRES

**Fond :** Paris by night étoilé

**Header :**
- Flèche ← haut gauche → retour
- Titre `PARAMÈTRES` centré

**4 sections :**

**COMPTE :**
- Pseudo : champ éditable (fond `#06000f`, bordure violet, texte or, 120px largeur, text-align right)

**AUDIO :**
- Son (effets sonores) : toggle ON/OFF violet
- Musique (bande son) : toggle désactivé + grisé (opacity 0.4) + sous-titre `bientôt disponible`

**NOTIFICATIONS :**
- Notifications : toggle ON/OFF violet
- Sous-titre : `Invitations de parties, tours de jeu`

**INFORMATIONS :**
- Mentions légales → flèche `›`
- Version → texte `v1.0.0` droite

**ZONE DANGEREUSE :**
- Fond `#1a0008`, bordure `#3a0010`
- Titre section : `ZONE DANGEREUSE` (8px, rouge sombre, letter-spacing 3px)
- `Supprimer le compte` : texte rouge `#ff4444`
- Sous-titre : `Action irréversible — toutes les données seront perdues` (8px, rouge très sombre)
- Confirmation requise avant exécution (modale de confirmation)

---

## CHECKLIST CLAUDE CODE

```
MIGRATIONS DB
□ ALTER TABLE players ADD COLUMN xp integer DEFAULT 0
□ ALTER TABLE player_stats ADD COLUMN xp integer DEFAULT 0
□ ALTER TABLE player_stats ADD COLUMN multiplayer_wins integer DEFAULT 0
□ ALTER TABLE player_stats ADD COLUMN multiplayer_losses integer DEFAULT 0
□ ALTER TABLE player_stats ADD COLUMN best_multiplayer_score integer DEFAULT 0
□ ALTER TABLE leaderboard : remplacer player_name (text) par player_id (uuid)
□ ALTER TABLE leaderboard ADD CONSTRAINT unique_player_mode UNIQUE (player_id, mode)

SERVICES
□ Créer XPService (addXP, getLevelFromXP, getPrestige, getXPForNextLevel)
□ Créer UnlockService (checkUnlocks, triggerUnlock)
□ Mettre à jour LeaderboardService (upsert avec player_id, JOIN pseudo pour affichage)

DATA
□ Peupler cosmetics_catalog avec 5 items default

LOGIQUE
□ Brancher flux complet fin de partie
□ Frontend : écran fin de partie étape 1 (podium + résultats)
□ Frontend : écran fin de partie étape 2 (XP + unlocks)

FRONTEND — NOUVEAUX ÉCRANS
□ Écran Profil (propre + adversaire lecture seule)
□ Écran Paramètres (son, notifs, pseudo, mentions légales, suppression compte)
□ Écran Leaderboard (onglets Global/Solo/Bot/Multi + périodes Semaine/All-time)
□ Navigation : tap avatar → profil (partout dans l'app)

VÉRIFICATIONS
□ Solo vs Bot : vérifier logique ORACLE (3 phases dynamiques)
□ Historique : confirmer caché par défaut
□ Leaderboard : affichage players.pseudo via JOIN
□ Assets : référencer URLs Supabase Storage dans le code
```

---

*Fin du fichier CLAUDE.md — session du 20 avril 2026*