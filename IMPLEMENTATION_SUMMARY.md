# Résumé de l'implémentation - Nouvelles règles + Wikidata Fallback

## 📋 Fichiers créés/modifiés

### Fichiers créés
1. **src/services/WikidataService.ts** - Service Wikidata avec SPARQL pour fallback
2. **src/services/ValidationService.ts** - Service unifié de validation (MB + Wikidata)

### Fichiers modifiés
1. **src/types/Player.ts** - Ajout de `jokers` (future-proof)
2. **src/types/Game.ts** - Ajout de `usedArtists`, `currentTurnEndsAt`, `attemptsUsed`, `lastArtist`
3. **src/types/Turn.ts** - Ajout de `attemptNumber`, `validationSource`, `invalidReason`
4. **src/services/MusicBrainzService.ts** - Ajout de `resolveArtist`, `haveCommonRecording`, `getKnownCollaborators`
5. **src/services/GameService.ts** - Réécriture complète avec nouvelles règles
6. **src/server/GameManager.ts** - Ajout gestion des timers par partie
7. **src/server/socketHandlers.ts** - Compatible (les nouveaux champs sont automatiquement émis)

## 🎯 Nouvelles règles implémentées

### B1) Timer de 30 secondes par tour
- ✅ Timer initialisé à `currentTurnEndsAt = now + 30000ms` au début de chaque tour
- ✅ Vérification serveur-side à chaque proposition
- ✅ Timer automatique via `setTimeout` dans `GameManager`
- ✅ Élimination automatique si temps écoulé (reason: `TIMEOUT`)

### B2) 2 tentatives maximum par tour
- ✅ `attemptsUsed` remis à 0 au début de chaque tour
- ✅ Incrémenté à chaque proposition invalide
- ✅ Élimination si `attemptsUsed >= MAX_ATTEMPTS_PER_TURN` (2)
- ✅ Les tentatives ne réinitialisent pas le timer

### B3) Règle REPEAT (HARD FAIL)
- ✅ Vérification immédiate si artiste déjà dans `usedArtists`
- ✅ Élimination immédiate, pas de retry
- ✅ Reason: `REPEAT`

### B4) Collaboration uniquement sur enregistrements
- ✅ MusicBrainz: recherche uniquement dans `/recording` (pas `/release`)
- ✅ Wikidata: recherche uniquement des tracks partagés (pas albums)
- ✅ Validation via `haveCommonRecording` dans les deux services

### B5) Règle SINGLE_CIRCULAR (invalid + retry)
- ✅ Détection: artiste n'a qu'un seul collaborateur = l'artiste précédent
- ✅ Traité comme invalide mais retry autorisé (consomme une tentative)
- ✅ `lastArtist` et `usedArtists` ne sont PAS mis à jour
- ✅ Reason: `SINGLE_CIRCULAR`

### B6) Fin de partie
- ✅ Partie se termine quand `activePlayers.length <= 1`
- ✅ Vérification après chaque élimination (timer, repeat, attempts)
- ✅ Statut `FINISHED` correctement géré

### B7) Structure jokers (future-proof)
- ✅ Interface `Jokers` dans `Player.ts`
- ✅ Champs: `extraTime`, `skipTurn`, `hint`, `attemptBonus`
- ✅ Pas de logique implémentée (pour plus tard)

## 🔄 Stratégie de validation (MB + Wikidata)

### Flow de validation
1. **Résolution d'artiste** (obligatoire via MusicBrainz)
   - Si non trouvé → `exists: false`, reason: `NOT_FOUND`

2. **Vérification collaboration** (si artiste précédent existe)
   - Essai MusicBrainz d'abord (primary)
   - Si échec → Essai Wikidata (fallback)
   - Si les deux échouent → `validRelation: false`, reason: `NO_RELATION`

3. **Détection single-circular**
   - Si `validRelation: true` → Vérifier collaborateurs via `getKnownCollaborators`
   - Si 1 seul collaborateur = précédent → Flag `singleCircularCollab: true`

### Caching
- ✅ MusicBrainz: cache des collaborations et résolutions d'artistes
- ✅ Wikidata: cache des QIDs et validations de collaborations
- ✅ Cache en mémoire (Map)

## ⏱️ Gestion des timers

### GameManager
- ✅ `gameTimers: Map<gameId, Timeout>` pour stocker les timers actifs
- ✅ `scheduleTurnTimer()`: programme un timer pour le tour actuel
- ✅ `clearTurnTimer()`: annule le timer d'une partie
- ✅ `handleTurnTimeout()`: gère l'expiration (élimination + passage au suivant)

### Lifecycle
- Timer créé: `startGame()`, `proposeArtist()` (si valide), `handleTurnTimeout()`
- Timer annulé: `resetGame()`, `handleDisconnect()`, fin de partie, `cleanupOldGames()`

## 📡 Compatibilité WebSocket

### Événements existants (inchangés)
- `create-game`, `join-game`, `start-game`, `reset-game`, `propose-artist`, `get-game-state`, `get-game-code`

### Nouveaux champs dans les payloads
- `game.currentTurnEndsAt` (number, epoch ms)
- `game.attemptsUsed` (number)
- `game.lastArtist` (object: `{name, mbid?, qid?}`)
- `game.usedArtists` (string[])
- `game.players[].jokers` (object)
- `turn.attemptNumber` (number)
- `turn.validationSource` ('musicbrainz' | 'wikidata_fallback')
- `turn.invalidReason` ('REPEAT' | 'TIMEOUT' | 'NO_RELATION' | 'NOT_FOUND' | 'SINGLE_CIRCULAR' | 'OTHER')

## 🧪 Plan de test

### Test 1: Timeout à 30s
1. Démarrer une partie
2. Attendre 30 secondes sans proposer d'artiste
3. ✅ Vérifier: joueur éliminé avec reason `TIMEOUT`, tour passe au suivant

### Test 2: Invalid puis retry puis valid
1. Proposer un artiste invalide (pas de collaboration)
2. ✅ Vérifier: `attemptsUsed = 1`, message indique retry possible
3. Proposer un autre artiste invalide
4. ✅ Vérifier: `attemptsUsed = 2`, joueur éliminé
5. OU proposer un artiste valide après tentative 1
6. ✅ Vérifier: accepté, tour suivant démarre

### Test 3: Repeat artist → élimination immédiate
1. Proposer un artiste valide (ex: "Booba")
2. ✅ Vérifier: accepté, ajouté à `usedArtists`
3. Proposer à nouveau "Booba" (ou même MBID)
4. ✅ Vérifier: élimination immédiate, reason `REPEAT`, pas de retry

### Test 4: Single circular → invalid mais retry
1. Trouver un artiste qui n'a qu'une seule collaboration (avec l'artiste précédent)
2. Proposer cet artiste
3. ✅ Vérifier: invalide, reason `SINGLE_CIRCULAR`, retry autorisé
4. ✅ Vérifier: `lastArtist` et `usedArtists` non mis à jour
5. Proposer un autre artiste valide
6. ✅ Vérifier: accepté normalement

### Test 5: MB fails mais Wikidata valide
1. Trouver deux artistes qui ont une collaboration sur Wikidata mais pas sur MB
2. Proposer le second artiste
3. ✅ Vérifier: accepté avec `validationSource: 'wikidata_fallback'`
4. ✅ Vérifier: `turn.validationSource = 'wikidata_fallback'`

### Test 6: Reset-game conserve code et nettoie timers
1. Terminer une partie
2. Cliquer "Recommencer"
3. ✅ Vérifier: `gameCode` conservé et affiché
4. ✅ Vérifier: `usedArtists = []`, `currentTurnEndsAt = undefined`, `attemptsUsed = 0`
5. ✅ Vérifier: Timer précédent annulé (pas de timeout après reset)

## 🔧 Configuration requise

Aucune configuration supplémentaire nécessaire. Wikidata utilise l'endpoint public SPARQL sans authentification.

## 📝 Notes importantes

1. **Compatibilité backward**: Les champs existants (`lastArtistName`) sont conservés pour compatibilité
2. **Identités canoniques**: Stockage préfère MBID, fallback sur nom normalisé
3. **Timer precision**: Les timers sont gérés côté serveur pour éviter les problèmes de synchronisation client
4. **Cache**: Les caches sont en mémoire, vidés au redémarrage du serveur
5. **Error handling**: Retry automatique (3 tentatives) pour erreurs réseau dans MB et Wikidata

## ✅ Checklist de validation

- [x] Types modifiés avec nouveaux champs
- [x] WikidataService créé avec SPARQL
- [x] MusicBrainzService étendu (resolveArtist, getKnownCollaborators)
- [x] ValidationService créé (unifié MB + Wikidata)
- [x] GameService réécrit avec toutes les règles
- [x] GameManager gère les timers
- [x] socketHandlers compatible (nouveaux champs émis automatiquement)
- [x] Compilation TypeScript sans erreurs
- [x] Backward compatibility maintenue

## 🚀 Prochaines étapes (non implémentées)

- Implémentation des jokers (extraTime, skipTurn, hint, attemptBonus)
- Tests unitaires pour chaque règle
- Interface frontend pour afficher timer et attempts
- Logs détaillés pour débogage
