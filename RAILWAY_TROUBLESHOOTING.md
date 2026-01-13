# Dépannage Railway - Roland Gamos

## ⚠️ Warnings courants (non bloquants)

### Warning: `glob@7.2.3` deprecated

```
npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
```

**Explication** : Ce warning est normal et non bloquant. Il provient de Jest (dépendance de développement) qui utilise une ancienne version de `glob`. Cela n'affecte pas le fonctionnement de l'application.

**Action** : Aucune action requise. Le déploiement continue normalement.

---

## 🔧 Problèmes de build

### Le build échoue à l'étape `npm ci`

**Symptômes** :
- Erreur lors de l'installation des dépendances
- Timeout pendant `npm ci`

**Solutions** :
1. Vérifier que `package-lock.json` est présent et à jour
2. Vérifier que toutes les dépendances sont valides
3. Si le problème persiste, Railway peut utiliser `npm install` au lieu de `npm ci`

### Le build échoue à l'étape `npm run build`

**Symptômes** :
- Erreur TypeScript
- Erreur lors du build frontend
- Fichiers manquants

**Solutions** :
1. **Erreur TypeScript** :
   ```bash
   # Tester localement
   npx tsc --noEmit
   ```
   Corriger les erreurs TypeScript avant de pousser

2. **Erreur build frontend** :
   ```bash
   # Tester localement
   cd frontend
   npm run build
   ```
   Vérifier que le build frontend fonctionne localement

3. **Fichiers manquants** :
   - Vérifier que tous les fichiers sont commités
   - Vérifier que `.gitignore` n'exclut pas des fichiers nécessaires

### Le build réussit mais le serveur ne démarre pas

**Symptômes** :
- Build réussi
- Erreur au démarrage : `Cannot find module` ou `ENOENT`

**Solutions** :
1. Vérifier que `dist/server/index.js` existe après le build
2. Vérifier que le script `start` dans `package.json` est correct :
   ```json
   "start": "node dist/server/index.js"
   ```
3. Vérifier que tous les fichiers nécessaires sont dans `dist/`

---

## 🌐 Problèmes de connexion

### WebSockets ne fonctionnent pas

**Symptômes** :
- Erreur CORS dans la console
- Connexion WebSocket échoue
- `ERR_CONNECTION_REFUSED`

**Solutions** :
1. Vérifier que la variable d'environnement `NODE_ENV=production` est définie
2. Vérifier que le frontend utilise bien l'URL relative en production
3. Vérifier les logs Railway pour les erreurs CORS

### Le frontend ne s'affiche pas

**Symptômes** :
- Page blanche
- 404 sur toutes les routes
- `Cannot GET /`

**Solutions** :
1. Vérifier que `frontend/dist` existe après le build
2. Vérifier que le chemin dans `src/server/index.ts` est correct :
   ```typescript
   const frontendDistPath = path.join(process.cwd(), 'frontend/dist');
   ```
3. Vérifier que `express.static` est configuré avant le catch-all route

---

## 📊 Vérification du déploiement

### Checklist de vérification

1. **Build réussi** :
   - ✅ `npm ci` terminé sans erreur
   - ✅ `npm run build` terminé sans erreur
   - ✅ `dist/` contient les fichiers compilés
   - ✅ `frontend/dist/` contient les fichiers frontend

2. **Démarrage réussi** :
   - ✅ Serveur démarre sur le port défini
   - ✅ Logs montrent "Serveur démarré sur le port X"
   - ✅ Pas d'erreur dans les logs

3. **Application accessible** :
   - ✅ URL Railway accessible
   - ✅ Frontend s'affiche
   - ✅ WebSockets se connectent
   - ✅ Pas d'erreur CORS

---

## 🔍 Commandes de diagnostic

### Vérifier localement avant de déployer

```bash
# 1. Tester la compilation TypeScript
npx tsc --noEmit

# 2. Tester le build complet
npm run build

# 3. Vérifier que les fichiers sont générés
ls dist/server/index.js
ls frontend/dist/index.html

# 4. Tester le démarrage (simulation production)
NODE_ENV=production node dist/server/index.js
```

### Vérifier dans Railway

1. **Logs de build** : Vérifier qu'il n'y a pas d'erreur
2. **Logs de runtime** : Vérifier que le serveur démarre
3. **Métriques** : Vérifier la consommation de ressources

---

## 🚨 Erreurs courantes

### `Error: Cannot find module 'dist/server/index.js'`

**Cause** : Le build n'a pas généré les fichiers ou le chemin est incorrect.

**Solution** :
1. Vérifier que `tsconfig.json` compile vers `dist/`
2. Vérifier que le script `start` pointe vers le bon fichier
3. Vérifier que le build s'est bien exécuté

### `Error: ENOENT: no such file or directory, open 'frontend/dist/index.html'`

**Cause** : Le build frontend n'a pas été exécuté ou a échoué.

**Solution** :
1. Vérifier que `npm run build:frontend` s'exécute correctement
2. Vérifier que `frontend/dist` existe après le build
3. Vérifier les logs Railway pour les erreurs de build frontend

### `CORS: Origine rejetée`

**Cause** : L'origine de la requête n'est pas autorisée.

**Solution** :
1. Vérifier que l'URL Railway est bien dans les origines autorisées
2. Vérifier que `NODE_ENV=production` est défini
3. Vérifier les logs pour voir quelle origine est rejetée

---

## 📝 Variables d'environnement recommandées

Dans Railway, définir :

```
NODE_ENV=production
PORT=3001
```

**Note** : `PORT` est automatiquement défini par Railway, mais vous pouvez le définir explicitement.

---

## 🔄 Redéploiement

Si le déploiement échoue :

1. Vérifier les logs Railway
2. Corriger les erreurs localement
3. Commiter et pousser les corrections
4. Railway redéploiera automatiquement

---

## 💡 Conseils

- ✅ Toujours tester le build localement avant de pousser
- ✅ Vérifier les logs Railway en cas de problème
- ✅ Les warnings npm sont généralement non bloquants
- ✅ Railway redéploie automatiquement à chaque push sur `main`
