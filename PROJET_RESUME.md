# Résumé du Projet Roland Gamos

## 📋 Vue d'ensemble

**Roland Gamos** est un jeu multijoueur tour par tour centré sur le rap/hip-hop français. Les joueurs doivent enchaîner des artistes ayant collaboré ensemble, avec validation via l'API MusicBrainz.

## 🎮 Principe du jeu

1. **Premier tour** : N'importe quel artiste peut être proposé
2. **Tours suivants** : L'artiste proposé doit avoir collaboré avec l'artiste précédent
3. **Règles de validation** :
   - La collaboration doit être sur un **son individuel** (enregistrement), pas sur un album ou projet complet
   - L'artiste proposé doit avoir **au moins une autre collaboration** avec un autre artiste (pas seulement avec l'artiste précédent)
   - Un artiste ne peut être proposé qu'**une seule fois** dans une partie
4. **Élimination** : Si la proposition est invalide ou répétée, le joueur est éliminé
5. **Fin de partie** : La partie se termine quand il ne reste qu'un joueur actif ou moins

## 🏗️ Architecture technique

### Backend (Node.js, TypeScript, Express, Socket.io)

#### Structure des fichiers
```
src/
├── types/
│   ├── Player.ts          # Interface Player (id, name, isEliminated)
│   ├── Turn.ts            # Interface Turn (playerId, artistName, isValid, timestamp)
│   └── Game.ts            # Interface Game (players, turns, status, currentPlayerIndex, lastArtistName)
├── services/
│   ├── MusicBrainzService.ts  # Service pour valider les collaborations via MusicBrainz API
│   └── GameService.ts          # Logique métier du jeu (tours, validation, élimination)
├── server/
│   ├── GameManager.ts     # Gestionnaire de parties multijoueurs en mémoire
│   ├── socketHandlers.ts  # Handlers WebSocket pour les événements
│   └── index.ts           # Serveur Express + Socket.io
└── examples/
    └── gameExample.ts     # Exemple d'utilisation en ligne de commande
```

#### Fonctionnalités backend

**1. Gestion des parties multijoueurs**
- Création de parties avec **code à 6 chiffres** (100000-999999)
- Système de mapping `gameCode -> gameId` pour retrouver les parties
- Gestion des joueurs et des connexions WebSocket
- État des parties : `WAITING`, `IN_PROGRESS`, `FINISHED`

**2. Validation des collaborations**
- Intégration avec l'API MusicBrainz
- Recherche d'artistes avec plusieurs stratégies (nom exact, recherche large)
- Validation uniquement sur les **enregistrements** (sons individuels), pas sur les albums
- Vérification que l'artiste a d'autres collaborations
- Système de retry automatique (3 tentatives) en cas d'erreur réseau
- Cache simple en mémoire pour éviter les appels répétés

**3. WebSocket Events**
- `create-game` : Créer une partie (retourne gameId, gameCode, player, game)
- `join-game` : Rejoindre une partie avec le code à 6 chiffres
- `start-game` : Démarrer une partie (seul l'hôte peut démarrer)
- `reset-game` : Réinitialiser une partie terminée (conserve les joueurs)
- `propose-artist` : Proposer un artiste (validation automatique)
- `get-game-state` : Obtenir l'état actuel de la partie
- `get-game-code` : Obtenir le code d'une partie

**4. Événements émis par le serveur**
- `game-created` : Partie créée (avec gameCode)
- `game-joined` : Joueur a rejoint
- `player-joined` : Nouveau joueur dans la partie
- `game-started` : Partie démarrée
- `game-reset` : Partie réinitialisée (avec gameCode)
- `game-updated` : État de la partie mis à jour
- `game-state` : État complet de la partie (avec gameCode)
- `error` : Erreur survenue

### Frontend (React, TypeScript, Vite)

#### Structure des fichiers
```
frontend/
├── src/
│   ├── screens/
│   │   ├── MultiplayerHomeScreen.tsx    # Écran de création/rejoindre une partie
│   │   ├── MultiplayerGameScreen.tsx   # Écran de jeu multijoueur
│   │   ├── HomeScreen.tsx              # Écran solo (legacy)
│   │   └── GameScreen.tsx              # Écran de jeu solo (legacy)
│   ├── services/
│   │   └── socketService.ts           # Service WebSocket client
│   ├── shared/
│   │   ├── types/                      # Types partagés (Game, Player, Turn)
│   │   └── services/                   # Services partagés (GameService, MusicBrainzService)
│   ├── styles/
│   │   ├── HomeScreen.css              # Styles pour les écrans
│   │   └── GameScreen.css
│   ├── App.tsx                         # Composant racine (gestion de la navigation)
│   └── main.tsx                        # Point d'entrée React
└── package.json
```

#### Fonctionnalités frontend

**1. Interface utilisateur mobile-first**
- Design responsive avec thème sombre
- Animations et transitions fluides
- Feedback visuel clair pour les actions
- Indicateur de statut de connexion WebSocket

**2. Écran de création/rejoindre (MultiplayerHomeScreen)**
- Création de partie avec génération automatique du code à 6 chiffres
- Affichage du code en grand avec bouton de copie
- Rejoindre une partie avec validation du code (6 chiffres uniquement)
- Liste des joueurs dans le salon
- Bouton "Démarrer la partie" (visible uniquement pour l'hôte)
- Affichage du code même après réinitialisation

**3. Écran de jeu (MultiplayerGameScreen)**
- Affichage du joueur actuel
- Formulaire de proposition d'artiste
- Historique des tours avec validation/invalidation
- Liste des joueurs avec statut (actif/éliminé)
- Écran de fin de partie avec gagnant
- Bouton "Recommencer" pour l'hôte (conserve les joueurs)
- Synchronisation en temps réel via WebSocket

**4. Gestion de l'état**
- Synchronisation automatique avec le serveur
- Gestion du code de partie dans `App.tsx` pour persistance
- Mise à jour en temps réel de tous les joueurs
- Gestion des déconnexions/reconnexions

## 🔧 Fonctionnalités principales

### ✅ Mode multijoueur en temps réel
- Plusieurs appareils peuvent jouer ensemble
- Synchronisation instantanée via WebSocket
- Gestion des connexions/déconnexions

### ✅ Système de code à 6 chiffres
- Code facile à partager (ex: 123456)
- Validation automatique (6 chiffres uniquement)
- Affichage et copie en un clic
- Code conservé lors de la réinitialisation

### ✅ Salon d'attente
- Création de salon avec un seul joueur (hôte)
- Autres joueurs peuvent rejoindre avec le code
- Liste des joueurs en temps réel
- L'hôte démarre la partie quand il le souhaite (minimum 2 joueurs)

### ✅ Recommencer une partie
- Bouton "Recommencer" visible uniquement pour l'hôte
- Conserve tous les joueurs précédents
- Permet à de nouveaux joueurs de rejoindre
- Réinitialise l'état de jeu mais garde les joueurs
- Code de partie conservé et affiché

### ✅ Validation des collaborations
- Validation via API MusicBrainz
- Uniquement sur des **sons individuels** (pas albums/projets)
- Vérification que l'artiste a d'autres collaborations
- Retry automatique en cas d'erreur réseau
- Cache pour optimiser les performances

### ✅ Gestion des erreurs
- Messages d'erreur clairs et explicites
- Gestion des erreurs réseau avec retry
- Validation côté serveur pour sécurité
- Logs détaillés pour le débogage

## 📦 Installation et lancement

### Prérequis
- Node.js 18+
- npm

### Installation
```bash
# Backend
npm install

# Frontend
cd frontend
npm install
cd ..
```

### Lancement

**Option 1 - Une seule commande (Recommandé)** :
```bash
npm run dev:all
```

Cette commande lance automatiquement :
- Backend sur `http://localhost:3001`
- Frontend sur `http://localhost:3000`

**Option 2 - Lancement séparé** :
```bash
# Terminal 1 - Backend
npm run dev

# Terminal 2 - Frontend
npm run dev:frontend
```

## 🎯 Règles de validation détaillées

### 1. Collaboration avec l'artiste précédent
- L'artiste proposé doit avoir collaboré avec l'artiste précédent
- La collaboration doit être sur un **enregistrement individuel** (son/track)
- Les collaborations sur des albums ou projets complets ne sont **pas** acceptées

### 2. Autres collaborations requises
- L'artiste proposé doit avoir **au moins une autre collaboration** avec un autre artiste
- Cette autre collaboration ne doit pas être uniquement avec l'artiste précédent
- Vérification effectuée sur les enregistrements de l'artiste

### 3. Pas de répétition
- Un artiste ne peut être proposé qu'**une seule fois** dans une partie
- Vérification automatique dans l'historique des tours

### 4. Élimination
- Si la proposition est invalide (pas de collaboration, pas d'autres collaborations, ou répétée), le joueur est éliminé
- Le tour passe automatiquement au joueur suivant

## 🔄 Flux de jeu

1. **Création de partie**
   - Un joueur crée une partie → Code à 6 chiffres généré
   - Le code est affiché et peut être copié

2. **Rejoindre une partie**
   - Autres joueurs entrent le code à 6 chiffres
   - Ils rejoignent le salon d'attente

3. **Démarrage**
   - L'hôte clique sur "Démarrer la partie"
   - Minimum 2 joueurs requis
   - La partie passe en statut `IN_PROGRESS`

4. **Jouer**
   - Les joueurs jouent à tour de rôle
   - Chaque proposition est validée automatiquement
   - Les résultats sont synchronisés en temps réel

5. **Fin de partie**
   - Quand il ne reste qu'un joueur actif ou moins
   - Affichage du gagnant
   - Bouton "Recommencer" pour l'hôte

6. **Recommencer**
   - L'hôte clique sur "Recommencer"
   - Les joueurs retournent au salon
   - Le code de partie est conservé
   - De nouveaux joueurs peuvent rejoindre
   - L'hôte peut relancer une nouvelle partie

## 🛠️ Technologies utilisées

### Backend
- **Node.js** : Runtime JavaScript
- **TypeScript** : Typage statique
- **Express** : Framework web
- **Socket.io** : WebSocket pour temps réel
- **Axios** : Client HTTP pour MusicBrainz API
- **ts-node** : Exécution TypeScript directe

### Frontend
- **React** : Bibliothèque UI
- **TypeScript** : Typage statique
- **Vite** : Build tool et dev server
- **Socket.io-client** : Client WebSocket
- **CSS** : Styles personnalisés (mobile-first)

### Services externes
- **MusicBrainz API** : Validation des collaborations d'artistes

## 📝 Scripts npm

### Backend
- `npm run build` : Compiler TypeScript
- `npm run dev` : Lancer le serveur en mode développement
- `npm run start` : Lancer le serveur compilé
- `npm test` : Lancer les tests

### Frontend
- `npm run dev` : Lancer le serveur de développement
- `npm run build` : Build de production
- `npm run preview` : Prévisualiser le build

### Global
- `npm run dev:all` : Lancer backend + frontend en une commande
- `npm run dev:frontend` : Lancer uniquement le frontend

## 🎨 Design et UX

- **Thème sombre** : Interface moderne et agréable
- **Mobile-first** : Optimisé pour les appareils mobiles
- **Animations** : Transitions fluides pour une meilleure expérience
- **Feedback visuel** : Messages clairs pour chaque action
- **Indicateurs** : Statut de connexion, joueur actuel, etc.

## 🔒 Sécurité et robustesse

- **Validation côté serveur** : Toute la logique de jeu est validée côté serveur
- **Gestion d'erreurs** : Retry automatique pour les erreurs réseau
- **Cache** : Réduction des appels API répétés
- **TypeScript** : Typage strict pour éviter les erreurs
- **Logs** : Logs détaillés pour le débogage

## 📚 Documentation

- **README.md** : Documentation principale du projet
- **QUICK_START.md** : Guide de démarrage rapide
- **PROJET_RESUME.md** : Ce document (résumé complet)

## 🚀 Évolutions futures possibles

- Base de données pour persister les parties
- Système de statistiques et classements
- Modes de jeu supplémentaires
- Chat en temps réel
- Système de tournois
- Application mobile native

## 📊 Statistiques du projet

- **Langages** : TypeScript (backend + frontend)
- **Lignes de code** : ~2000+ lignes
- **Fichiers principaux** : ~20 fichiers
- **Dépendances** : ~15 packages npm
- **Temps de développement** : Session complète de développement

---

**Dernière mise à jour** : Janvier 2025
**Version** : MVP fonctionnel
**Statut** : ✅ Opérationnel
