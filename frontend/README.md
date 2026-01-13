# Roland Gamos - Interface Utilisateur

Interface utilisateur React pour le jeu Roland Gamos.

## Technologies

- **React 18** : Bibliothèque UI
- **TypeScript** : Typage statique
- **Vite** : Build tool moderne et rapide
- **CSS** : Styles personnalisés avec design mobile-first

## Installation

```bash
npm install
```

## Développement

```bash
npm run dev
```

L'application sera accessible sur `http://localhost:3000` avec rechargement automatique.

## Build

```bash
npm run build
```

Les fichiers compilés seront dans le dossier `dist/`.

## Structure

```
src/
├── screens/          # Écrans principaux
│   ├── HomeScreen.tsx    # Écran d'accueil et création de partie
│   └── GameScreen.tsx    # Écran de jeu principal
├── styles/           # Styles CSS
│   ├── HomeScreen.css
│   └── GameScreen.css
├── shared/          # Code partagé avec le backend
│   ├── types/       # Types TypeScript
│   └── services/    # Services (GameService, MusicBrainzService)
├── App.tsx          # Composant racine
├── main.tsx         # Point d'entrée
└── index.css        # Styles globaux
```

## Fonctionnalités

### Écran d'accueil (HomeScreen)

- Création de joueurs avec noms personnalisés
- Ajout/suppression de joueurs (minimum 2)
- Validation des noms (uniques, non vides)
- Affichage des règles du jeu

### Écran de jeu (GameScreen)

- Affichage du joueur actuel
- Formulaire de proposition d'artiste
- Validation en temps réel via MusicBrainz
- Affichage des résultats (valide/invalide)
- Liste des joueurs avec statut (actif/éliminé)
- Historique des tours
- Écran de fin de partie avec gagnant

## Design

L'interface utilise un design moderne avec :
- Thème sombre adapté au mobile
- Animations fluides
- Responsive design (mobile-first)
- Tailles tactiles adaptées (minimum 44px)
- Feedback visuel clair pour les actions

## Intégration avec le backend

L'interface utilise les mêmes types et services que le backend pour garantir la cohérence. Les services sont adaptés pour fonctionner dans le navigateur (utilisation de `fetch` au lieu d'`axios`).
