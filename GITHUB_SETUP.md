# Guide pour publier sur GitHub

## 📋 Prérequis

1. Avoir un compte GitHub (créer un compte sur https://github.com)
2. Avoir Git installé sur votre machine
3. Vérifier l'installation : `git --version`

## 🚀 Étapes pour publier sur GitHub

### 1. Initialiser le dépôt Git local

```bash
# Depuis la racine du projet
cd "C:\Users\batma\OneDrive\Documents\Roland-Gamos"

# Initialiser Git
git init

# Ajouter tous les fichiers
git add .

# Créer le premier commit
git commit -m "Initial commit: MVP Roland Gamos - Jeu multijoueur rap français"
```

### 2. Créer un dépôt sur GitHub

1. Aller sur https://github.com
2. Cliquer sur le bouton **"+"** en haut à droite → **"New repository"**
3. Remplir les informations :
   - **Repository name** : `Roland-Gamos` (ou le nom de votre choix)
   - **Description** : "Jeu multijoueur tour par tour sur le rap français avec validation MusicBrainz"
   - **Visibilité** : Public ou Private (selon votre préférence)
   - **NE PAS** cocher "Initialize this repository with a README" (on a déjà un README)
4. Cliquer sur **"Create repository"**

### 3. Connecter le dépôt local à GitHub

Après avoir créé le dépôt, GitHub vous donnera des commandes. Utilisez celles-ci :

```bash
# Ajouter le dépôt distant (remplacez USERNAME par votre nom d'utilisateur GitHub)
git remote add origin https://github.com/USERNAME/Roland-Gamos.git

# Renommer la branche principale en 'main' (si nécessaire)
git branch -M main

# Pousser le code sur GitHub
git push -u origin main
```

### 4. Authentification GitHub

Si c'est la première fois, GitHub vous demandera de vous authentifier :

**Option A - Token d'accès personnel (Recommandé)** :
1. Aller dans GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Générer un nouveau token avec les permissions `repo`
3. Utiliser ce token comme mot de passe lors du `git push`

**Option B - GitHub CLI** :
```bash
# Installer GitHub CLI
# Puis :
gh auth login
```

## 📝 Commandes Git utiles

### Vérifier l'état
```bash
git status
```

### Ajouter des fichiers modifiés
```bash
git add .
git commit -m "Description des modifications"
git push
```

### Voir l'historique
```bash
git log --oneline
```

### Créer une branche
```bash
git checkout -b nom-de-la-branche
git push -u origin nom-de-la-branche
```

## 🔒 Fichiers sensibles à ne PAS commiter

Le fichier `.gitignore` est déjà configuré pour exclure :
- `node_modules/` (dépendances)
- `dist/` (fichiers compilés)
- `.env` (variables d'environnement sensibles)
- Logs et fichiers temporaires

## 📦 Structure recommandée du README sur GitHub

Votre README.md est déjà bien structuré ! Assurez-vous qu'il contient :
- Description du projet
- Instructions d'installation
- Guide de démarrage
- Architecture du projet

## ✅ Vérification finale

Après le push, vérifiez que :
1. Tous les fichiers sont présents sur GitHub
2. Le README s'affiche correctement
3. Le `.gitignore` fonctionne (pas de `node_modules` visible)

## 🎯 Prochaines étapes

Une fois sur GitHub, vous pouvez :
- Ajouter des collaborateurs
- Créer des issues pour suivre les bugs/améliorations
- Utiliser GitHub Actions pour CI/CD
- Créer des releases pour les versions
