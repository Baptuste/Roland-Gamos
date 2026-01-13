# Guide de démarrage rapide - Roland Gamos

## 🚀 Démarrage rapide - Mode Multijoueur

### 1. Installation des dépendances

**Depuis la racine du projet** :
```bash
npm install
cd frontend
npm install
cd ..
```

### 2. Lancement de l'application

**Option 1 - Une seule commande (Recommandé)** :
```bash
npm run dev:all
```

Cette commande lance automatiquement :
- Le serveur backend sur **http://localhost:3001**
- Le frontend sur **http://localhost:3000**

**Option 2 - Lancement séparé** :

**Terminal 1 - Serveur backend** :
```bash
npm run dev
```
Le serveur démarre sur **http://localhost:3001**

**Terminal 2 - Interface utilisateur** :
```bash
npm run dev:frontend
```
L'application sera accessible sur **http://localhost:3000**

### 3. Utilisation - Mode Multijoueur

#### Créer une partie

1. Ouvrez l'application sur votre appareil
2. Entrez votre nom
3. Cliquez sur "Créer une partie"
4. Partagez le **code à 6 chiffres** avec les autres joueurs (ex: 123456)

#### Rejoindre une partie

1. Ouvrez l'application sur votre appareil
2. Entrez votre nom
3. Entrez le **code à 6 chiffres** de la partie
4. Cliquez sur "Rejoindre la partie"

#### Jouer

1. L'hôte démarre la partie quand au moins 2 joueurs sont connectés
2. Les joueurs jouent à tour de rôle
3. Le premier joueur peut proposer n'importe quel artiste
4. Les joueurs suivants doivent proposer un artiste ayant collaboré avec l'artiste précédent
5. Un artiste ne peut être proposé qu'une seule fois
6. Si la proposition est invalide, le joueur est éliminé
7. Le dernier joueur actif gagne !

## 📱 Interface mobile

L'interface est optimisée pour mobile avec :
- Design responsive
- Tailles tactiles adaptées
- Animations fluides
- Thème sombre moderne

## 🔧 Développement

### Architecture

Le projet utilise une architecture client-serveur avec WebSocket :

- **Backend** : Serveur Node.js avec Express et Socket.io (port 3001)
- **Frontend** : Application React avec Vite (port 3000)
- **Communication** : WebSocket en temps réel pour la synchronisation

### Backend

```bash
# Démarrer le serveur WebSocket
npm run dev
```

### Frontend

```bash
cd frontend
npm run dev
```

### Configuration

Pour changer l'URL du serveur, créez un fichier `.env` dans `frontend/` :
```
VITE_SERVER_URL=http://localhost:3001
```

## 📦 Build de production

### Frontend

```bash
cd frontend
npm run build
```

Les fichiers compilés seront dans `frontend/dist/`

### Backend

```bash
npm run build
```

Les fichiers compilés seront dans `dist/`

## 🎯 Fonctionnalités

✅ **Mode multijoueur en temps réel** : Plusieurs appareils peuvent jouer ensemble  
✅ **Création/Rejoindre des parties** : Système de salle avec code à 6 chiffres facile à partager  
✅ **Synchronisation en temps réel** : Tous les joueurs voient les mises à jour instantanément  
✅ **Gestion des tours** : Tour par tour avec validation  
✅ **Validation des collaborations** : Via API MusicBrainz  
✅ **Affichage en temps réel** : Résultats et historique synchronisés  
✅ **Gestion des éliminations** : Élimination automatique en cas d'erreur  
✅ **Gestion des déconnexions** : Reconnexion possible  
✅ **Écran de fin de partie** : Affichage du gagnant  

## 🐛 Dépannage

### Le serveur ne démarre pas

- Vérifiez que Node.js est installé (version 18+)
- Vérifiez que les dépendances sont installées : `npm install`
- Vérifiez que le port 3001 n'est pas utilisé
- Vérifiez les logs du serveur pour les erreurs

### L'interface ne se connecte pas au serveur

- Vérifiez que le serveur backend est démarré
- Vérifiez l'URL du serveur dans `.env` (par défaut `http://localhost:3001`)
- Vérifiez la console du navigateur pour les erreurs de connexion
- Vérifiez que CORS est configuré correctement

### Les joueurs ne voient pas les mises à jour

- Vérifiez que tous les joueurs sont dans la même partie (même code à 6 chiffres)
- Vérifiez la connexion WebSocket (indicateur de statut en haut à droite)
- Rechargez la page si nécessaire

### Impossible de rejoindre une partie

- Vérifiez que le code à 6 chiffres est correct
- Vérifiez que la partie n'a pas déjà commencé
- Vérifiez les logs du serveur pour plus de détails

### Les validations ne fonctionnent pas

- Vérifiez votre connexion internet (MusicBrainz nécessite une connexion)
- Les appels API peuvent prendre quelques secondes
- Un cache est utilisé pour éviter les appels répétés
