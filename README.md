# Roland Gamos

Jeu multijoueur tour par tour sur le rap français, où les joueurs doivent enchaîner des artistes ayant collaboré ensemble.

## Principe du jeu

- Les joueurs jouent à tour de rôle
- Un joueur propose un artiste
- Le joueur suivant doit proposer un artiste ayant déjà collaboré avec l'artiste précédent
- Un artiste ne peut pas être répété dans une même partie
- Si la proposition est invalide ou répétée, le joueur est éliminé

## Architecture

Le projet est organisé en deux parties :

### Backend (Logique métier)

```
src/
├── types/          # Modèles de données (Game, Player, Turn)
├── services/       # Logique métier (GameService, MusicBrainzService)
└── server/         # Serveur WebSocket multijoueur
    ├── GameManager.ts      # Gestionnaire de parties
    ├── socketHandlers.ts    # Handlers WebSocket
    └── index.ts             # Serveur Express + Socket.io
```

### Frontend (Interface utilisateur)

```
frontend/
├── src/
│   ├── screens/    # Écrans principaux (HomeScreen, GameScreen)
│   ├── styles/     # Styles CSS pour chaque écran
│   ├── shared/     # Types et services partagés
│   └── App.tsx     # Composant principal
└── package.json    # Dépendances frontend
```

### Types

- **Player** : Représente un joueur avec son ID, nom et statut d'élimination
- **Turn** : Représente un tour de jeu avec l'artiste proposé et sa validité
- **Game** : Représente une partie avec les joueurs, les tours et l'état actuel

### Services

- **GameService** : Gère la logique de jeu (tours, validation, élimination)
- **MusicBrainzService** : Valide les collaborations entre artistes via l'API MusicBrainz
- **GameManager** : Gère les parties multijoueurs en mémoire
- **Socket Handlers** : Gère les événements WebSocket (création, rejoindre, propositions)

### Mode Multijoueur

Le projet supporte le mode multijoueur en temps réel via WebSocket :
- Création de parties avec code à 6 chiffres
- Rejoindre une partie existante
- Synchronisation en temps réel de l'état de la partie
- Gestion des déconnexions et reconnexions
- Validation des propositions côté serveur

## Installation

### Backend

```bash
npm install
```

### Frontend

```bash
cd frontend
npm install
```

## Compilation

### Backend

```bash
npm run build
```

### Frontend

```bash
cd frontend
npm run build
```

## Lancement de l'application

### 🚀 Mode Développement (Recommandé - Lance les deux en même temps)

```bash
npm run dev:all
```

Cette commande lance automatiquement :
- Le serveur backend sur `http://localhost:3001`
- Le frontend sur `http://localhost:3000`

### Lancement séparé

**Terminal 1 - Serveur backend** :
```bash
npm run dev
```
Le serveur démarre sur `http://localhost:3001`

**Terminal 2 - Interface utilisateur** :
```bash
npm run dev:frontend
```
L'application sera accessible sur `http://localhost:3000`

### Backend seul (exemple en ligne de commande)

```bash
npm run dev:example
```

## Utilisation

### Exemple basique

```typescript
import { createPlayer } from './types/Player';
import { createGame } from './types/Game';
import { GameService } from './services/GameService';

// Créer les joueurs
const player1 = createPlayer('p1', 'Alice');
const player2 = createPlayer('p2', 'Bob');

// Créer une partie
const game = createGame('game1', [player1, player2]);

// Créer le service
const gameService = new GameService();

// Démarrer la partie
let currentGame = gameService.startGame(game);

// Proposer un artiste
const result = await gameService.proposeArtist(
  currentGame,
  player1.id,
  'Booba'
);

// Mettre à jour la partie
currentGame = result.game;
```

## API MusicBrainz

L'application utilise l'API MusicBrainz pour valider les collaborations. Un cache simple est implémenté pour éviter les appels répétés.

**Important** : MusicBrainz requiert un User-Agent personnalisé. Le service utilise par défaut `RolandGamos/1.0.0`.

## Règles du jeu

1. **Premier tour** : N'importe quel artiste peut être proposé
2. **Tours suivants** : L'artiste doit avoir collaboré avec l'artiste précédent
3. **Pas de répétition** : Un artiste ne peut être proposé qu'une seule fois
4. **Élimination** : Un joueur est éliminé si sa proposition est invalide ou répétée
5. **Fin de partie** : La partie se termine quand il ne reste qu'un joueur actif ou moins

## Développement

### Frontend

```bash
cd frontend
npm run dev
```

L'interface utilisateur se rechargera automatiquement lors des modifications.

### Backend

```bash
npm run dev
```

## Tests

```bash
npm test
```

## Structure du code

Le code est conçu pour être :
- **Simple** : Logique claire et directe
- **Robuste** : Gestion d'erreurs appropriée
- **Évolutif** : Architecture modulaire facile à étendre
- **Testable** : Services isolés et injectables
