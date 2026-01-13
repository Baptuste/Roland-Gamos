# 🚀 Déploiement Railway - Guide Rapide

## ⚡ Déploiement en 5 minutes

### 1. Préparer le code (si pas déjà fait)

```bash
# Commiter les changements
git add .
git commit -m "Préparation déploiement Railway"
git push
```

### 2. Créer le projet sur Railway

1. Aller sur [railway.app](https://railway.app)
2. **"Start a New Project"** → **"Login with GitHub"**
3. **"New Project"** → **"Deploy from GitHub repo"**
4. Sélectionner **`Baptuste/Roland-Gamos`**

### 3. Configuration automatique

Railway détecte automatiquement :
- ✅ Node.js
- ✅ Build command : `npm install && npm run build`
- ✅ Start command : `npm start`

**Aucune configuration supplémentaire nécessaire !**

### 4. Variables d'environnement

Dans **Settings** → **Variables**, ajouter :

```
NODE_ENV=production
```

**Note** : `PORT` est automatiquement défini par Railway.

### 5. Générer l'URL publique

1. **Settings** → **Networking**
2. Cliquer sur **"Generate Domain"**
3. Copier l'URL (ex: `roland-gamos-production.up.railway.app`)

### 6. C'est tout ! 🎉

L'application est déployée et accessible à l'URL Railway.

---

## ✅ Vérification

1. Ouvrir l'URL Railway dans le navigateur
2. Tester :
   - Créer une partie
   - Rejoindre avec le code
   - Vérifier que les WebSockets fonctionnent

---

## 🔧 Si problème

### Build échoue
- Vérifier les logs dans Railway
- S'assurer que tous les fichiers sont commités

### Frontend ne s'affiche pas
- Vérifier que `frontend/dist` existe après le build
- Vérifier les logs pour les erreurs de chemin

### WebSockets ne fonctionnent pas
- Vérifier les logs Railway
- S'assurer que l'URL est correcte

---

## 📝 Notes importantes

- ✅ Railway déploie automatiquement à chaque push sur `main`
- ✅ Les logs sont disponibles en temps réel
- ✅ Le plan gratuit ($5 crédit/mois) est suffisant pour commencer

---

**Temps total : ~5 minutes** ⚡
