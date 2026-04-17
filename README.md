# Roland Gamos

Jeu mobile multijoueur tour par tour centré sur la culture rap / hip-hop francophone.

## Concept

Un joueur propose un artiste. Le suivant doit proposer un artiste ayant **réellement collaboré** avec lui (featuring, titre commun, remix crédité). Un artiste déjà cité est définitivement interdit. Si la proposition est invalide, répétée ou hors délai — le joueur est éliminé.

---

## Modes de jeu

| Mode | Description |
|---|---|
| **Multijoueur classique** | Tour par tour en temps réel via WebSocket, code de partie à 6 chiffres |
| **Solo Infini** | Enchaîner un maximum de réponses valides, scoring détaillé par tour |
| **Solo vs Bot (ORACLE)** | Affronter un bot à difficulté progressive par paliers |

---

## Stack technique

| Couche | Technologie |
|---|---|
| Backend | Node.js + TypeScript |
| Temps réel | Socket.io / WebSocket |
| Frontend | React + TypeScript + Vite |
| Base de données | Supabase (PostgreSQL) |
| API enrichissement | Genius API (ETL hors partie) |
| Déploiement backend | Render |
| Déploiement frontend | Vercel |

---

## Architecture

```
Roland-Gamos/
├── src/                          # Backend
│   ├── types/                    # Player, Game, Turn, SoloRun, SoloMove
│   ├── services/
│   │   ├── GameDataStore.ts      # Source de vérité locale (RAM) — zéro appel réseau en partie
│   │   ├── GeniusService.ts      # Enrichissement via API Genius (ETL uniquement)
│   │   ├── ScoringService.ts     # Calcul des scores avec tous les bonus
│   │   ├── ValidationService.ts  # Validation des propositions (Levenshtein + GameDataStore)
│   │   └── supabaseClient.ts     # Client Supabase
│   ├── server/
│   │   ├── GameManager.ts        # Gestionnaire de parties multijoueur
│   │   ├── SoloManager.ts        # Gestionnaire de sessions Solo Infini
│   │   ├── BotManager.ts         # Logique du bot ORACLE (Solo vs Bot)
│   │   ├── socketHandlers.ts     # Handlers WebSocket
│   │   └── index.ts              # Serveur Express + Socket.io
│   ├── scripts/
│   │   ├── etl.ts                # Script ETL Genius → base locale
│   │   └── push-to-supabase.ts   # Push données locales → Supabase
│   └── data/
│       ├── artists.json          # Données artistes pré-calculées
│       └── collaborations.json   # Collaborations validées
├── frontend/
│   └── src/
│       ├── screens/
│       │   ├── MultiplayerHomeScreen.tsx
│       │   ├── MultiplayerGameScreen.tsx
│       │   ├── SoloInfiniteScreen.tsx
│       │   ├── SoloBotScreen.tsx
│       │   ├── LeaderboardScreen.tsx
│       │   └── StatsScreen.tsx
│       ├── hooks/
│       │   └── useSoloInfiniteGame.ts
│       ├── shared/services/
│       │   ├── SoloService.ts    # Client REST Solo Infini
│       │   └── BotService.ts     # Client REST Solo vs Bot
│       └── styles/               # CSS pixel art par écran
├── .env.example
├── render.yaml
└── CLAUDE_1.md / CLAUDE_2.md    # Spécifications complètes du projet
```

---

## Règle absolue

**Aucun appel API externe pendant une partie.** Toutes les validations s'appuient sur le `GameDataStore` chargé en RAM au démarrage du serveur.

---

## Système de score

```
Score d'un tour = BASE (100) + category_bonus + degree_bonus + pair_bonus + TimeBonus + ChainBonus
```

Plafond : **280 pts / tour**

| Bonus | Source |
|---|---|
| `category_bonus` | Popularité de l'artiste (niche=40, mainstream=15…) |
| `degree_bonus` | Réseau collaboratif de l'artiste |
| `pair_bonus` | Rareté du duo |
| `TimeBonus` | Rapidité de réponse (0–50 pts) |
| `ChainBonus` | Longueur de chaîne (≥5=10, ≥10=25, ≥15=40, ≥20=60) |

---

## Installation et lancement

### Prérequis

```bash
npm install
cd frontend && npm install
```

### Variables d'environnement

```bash
cp .env.example .env
# Remplir SUPABASE_URL, SUPABASE_ANON_KEY, GENIUS_ACCESS_TOKEN
```

### Développement (full stack)

```bash
npm run dev:all
# Backend  → http://localhost:3001
# Frontend → http://localhost:3000
```

### Lancement séparé

```bash
# Terminal 1 — backend
npm run dev

# Terminal 2 — frontend
npm run dev:frontend
```

---

## Endpoints REST — Solo Infini

```
POST  /api/solo/infinite/start         Démarrer une run
POST  /api/solo/infinite/move          Proposer un artiste
GET   /api/solo/infinite/run/:id       État d'une run
GET   /api/solo/infinite/hint/:runId   Collabs connues de l'artiste actuel
```

## Endpoints REST — Solo vs Bot

```
POST  /api/solo/bot/start    Démarrer une partie vs ORACLE
POST  /api/solo/bot/move     Proposer un artiste
GET   /api/solo/bot/run/:id  État de la partie
```

---

## ETL — Données artistes

Les données sont pré-calculées hors partie via les scripts ETL :

```bash
# Importer depuis Genius API
npx ts-node src/scripts/etl.ts

# Pousser vers Supabase
npx ts-node src/scripts/push-to-supabase.ts
```

---

## Déploiement

- **Backend** : Render (`render.yaml` présent) — `npm run build` puis `node dist/server/index.js`
- **Frontend** : Vercel (build `cd frontend && npm run build`)

---

## Tests

```bash
npm test
```
