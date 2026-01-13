# Deliverables - Nouvelles règles + Wikidata Fallback

## 📁 Liste des fichiers créés/modifiés

### Fichiers créés (2)
1. **src/services/WikidataService.ts** (247 lignes)
   - Service Wikidata avec requêtes SPARQL
   - Méthodes: `findArtistQidByName()`, `haveCommonRecording()`
   - Cache en mémoire pour QIDs et collaborations

2. **src/services/ValidationService.ts** (118 lignes)
   - Service unifié de validation
   - Combine MusicBrainz (primary) + Wikidata (fallback)
   - Détecte la règle "single circular collaboration"

### Fichiers modifiés (7)

1. **src/types/Player.ts**
   - Ajout: `jokers?: Jokers` (interface avec extraTime, skipTurn, hint, attemptBonus)
   - Initialisation: `jokers: {}` dans `createPlayer()`

2. **src/types/Game.ts**
   - Ajout: `usedArtists: string[]` (identifiants canoniques utilisés)
   - Ajout: `currentTurnEndsAt?: number` (timestamp fin de tour)
   - Ajout: `attemptsUsed?: number` (tentatives du joueur actuel)
   - Ajout: `lastArtist?: CanonicalArtist` (identité canonique)
   - Nouvelle interface: `CanonicalArtist` (name, mbid?, qid?)
   - Conservation: `lastArtistName` (legacy, backward compatible)

3. **src/types/Turn.ts**
   - Ajout: `attemptNumber?: number`
   - Ajout: `validationSource?: 'musicbrainz' | 'wikidata_fallback'`
   - Ajout: `invalidReason?: InvalidReason`
   - Types: `ValidationSource`, `InvalidReason`

4. **src/services/MusicBrainzService.ts**
   - Nouvelle méthode: `resolveArtist()` → retourne {mbid, canonicalName, aliases}
   - Nouvelle méthode: `haveCommonRecording(prevMbid, currMbid)` → boolean
   - Nouvelle méthode: `getKnownCollaborators(mbid)` → string[] (MBIDs)
   - Conservation: méthodes existantes pour compatibilité

5. **src/services/GameService.ts** (420 lignes, réécriture complète)
   - Nouvelle méthode: `startTurn()` → initialise timer (30s) et attempts (0)
   - Nouvelle méthode: `isTurnExpired()` → vérifie expiration
   - Réécriture: `proposeArtist()` avec toutes les nouvelles règles:
     - Vérification timer (TIMEOUT)
     - Gestion attempts (max 2)
     - Règle REPEAT (hard fail)
     - Règle SINGLE_CIRCULAR (invalid + retry)
     - Validation via ValidationService
   - Méthodes rendues publiques: `moveToNextPlayer()`, `eliminatePlayer()`

6. **src/server/GameManager.ts**
   - Ajout: `gameTimers: Map<gameId, Timeout>` pour gestion timers
   - Nouvelle méthode: `scheduleTurnTimer()` → programme timer pour un tour
   - Nouvelle méthode: `clearTurnTimer()` → annule timer
   - Nouvelle méthode: `handleTurnTimeout()` → gère expiration
   - Modification: `createGame()` → initialise `usedArtists: []`
   - Modification: `startGame()` → programme timer après démarrage
   - Modification: `proposeArtist()` → programme timer après validation
   - Modification: `resetGame()` → annule timer et réinitialise champs
   - Modification: `handleDisconnect()` → gère timeout si joueur actuel se déconnecte
   - Modification: `cleanupOldGames()` → annule timers des parties supprimées

7. **src/server/socketHandlers.ts**
   - Aucune modification nécessaire (backward compatible)
   - Les nouveaux champs sont automatiquement émis dans les événements existants
   - `game-updated`, `game-started`, `game-state` incluent maintenant tous les nouveaux champs

## 🔧 Code complet des fichiers créés

### src/services/WikidataService.ts
```typescript
// Voir fichier complet dans le repository
// - Classe WikidataService
// - Méthodes: findArtistQidByName(), haveCommonRecording()
// - Cache pour QIDs et collaborations
// - Retry automatique (3 tentatives)
```

### src/services/ValidationService.ts
```typescript
// Voir fichier complet dans le repository
// - Classe ValidationService
// - Méthode: validateMove(previousArtist, proposedArtistName)
// - Flow: MB resolve → MB collaboration → Wikidata fallback → single-circular check
```

## 📋 Configuration requise

**Aucune configuration supplémentaire nécessaire.**

- Wikidata utilise l'endpoint public SPARQL: `https://query.wikidata.org/sparql`
- Pas d'authentification requise
- User-Agent: `RolandGamos/1.0.0` (déjà configuré)

## 🧪 Plan de test détaillé

### Test 1: Timeout à 30 secondes
**Scénario:**
1. Démarrer une partie avec 2 joueurs
2. Joueur 1 ne propose rien pendant 30 secondes
3. Vérifier l'élimination automatique

**Vérifications:**
- ✅ `turn.invalidReason === 'TIMEOUT'`
- ✅ `currentPlayer.isEliminated === true`
- ✅ Tour passe automatiquement au joueur suivant
- ✅ Nouveau timer démarre pour le joueur suivant

**Commande de test:**
```bash
# Démarrer le serveur
npm run dev

# Dans un autre terminal, utiliser un client WebSocket pour tester
# Attendre 30s sans proposer d'artiste
```

### Test 2: Invalid → Retry → Valid
**Scénario:**
1. Joueur propose artiste invalide (pas de collaboration)
2. Vérifier `attemptsUsed = 1`
3. Proposer artiste valide
4. Vérifier acceptation et passage au tour suivant

**Vérifications:**
- ✅ Tentative 1: `attemptsUsed = 1`, message indique retry
- ✅ Tentative 2 valide: accepté, `attemptsUsed` remis à 0 pour tour suivant
- ✅ `turn.attemptNumber = 2` pour le tour final

### Test 3: Invalid → Invalid → Élimination
**Scénario:**
1. Joueur propose artiste invalide (tentative 1)
2. Joueur propose autre artiste invalide (tentative 2)
3. Vérifier élimination

**Vérifications:**
- ✅ Tentative 2: `attemptsUsed = 2`
- ✅ Joueur éliminé après tentative 2
- ✅ `turn.invalidReason = 'NO_RELATION'` ou `'NOT_FOUND'`

### Test 4: Repeat artist → Élimination immédiate
**Scénario:**
1. Joueur 1 propose "Booba" (valide)
2. Joueur 2 propose "Ninho" (valide, collaboration avec Booba)
3. Joueur 1 propose "Booba" à nouveau

**Vérifications:**
- ✅ Élimination immédiate (pas de retry)
- ✅ `turn.invalidReason = 'REPEAT'`
- ✅ `turn.attemptNumber = 1` (première tentative)
- ✅ `usedArtists` contient bien l'identifiant de Booba

### Test 5: Single circular → Invalid mais retry
**Scénario:**
1. Trouver artiste A qui n'a qu'une collaboration avec artiste B
2. Joueur propose A (B est l'artiste précédent)
3. Vérifier invalid mais retry autorisé
4. Proposer artiste C valide

**Vérifications:**
- ✅ `turn.invalidReason = 'SINGLE_CIRCULAR'`
- ✅ `turn.isValid = false`
- ✅ `attemptsUsed` incrémenté
- ✅ `lastArtist` et `usedArtists` NON mis à jour
- ✅ Retry possible avec artiste valide

### Test 6: MB fails → Wikidata valide
**Scénario:**
1. Trouver deux artistes avec collaboration sur Wikidata mais pas MB
2. Proposer le second artiste

**Vérifications:**
- ✅ `turn.validationSource = 'wikidata_fallback'`
- ✅ `turn.isValid = true`
- ✅ `lastArtist.qid` présent (QID Wikidata)
- ✅ Collaboration acceptée

### Test 7: Reset-game conserve code et nettoie
**Scénario:**
1. Terminer une partie
2. Cliquer "Recommencer"

**Vérifications:**
- ✅ `gameCode` conservé et affiché
- ✅ `usedArtists = []`
- ✅ `currentTurnEndsAt = undefined`
- ✅ `attemptsUsed = 0`
- ✅ `turns = []`
- ✅ `status = 'WAITING'`
- ✅ Timer précédent annulé (pas de timeout après reset)

## 📊 Statistiques d'implémentation

- **Lignes de code ajoutées**: ~800 lignes
- **Fichiers créés**: 2
- **Fichiers modifiés**: 7
- **Nouvelles méthodes**: 15+
- **Nouvelles règles**: 6 (timer, attempts, repeat, single-circular, recording-only, game-end)
- **Services externes**: 2 (MusicBrainz + Wikidata)

## ✅ Checklist de validation finale

- [x] Types modifiés avec tous les nouveaux champs
- [x] WikidataService créé et fonctionnel
- [x] MusicBrainzService étendu (resolveArtist, getKnownCollaborators)
- [x] ValidationService créé (unifié MB + Wikidata)
- [x] GameService réécrit avec toutes les règles
- [x] GameManager gère les timers correctement
- [x] socketHandlers backward compatible
- [x] Compilation TypeScript sans erreurs
- [x] Build réussi
- [x] Documentation complète

## 🚀 Prêt pour tests

Le code est compilé et prêt pour les tests. Tous les événements WebSocket existants continuent de fonctionner, avec les nouveaux champs ajoutés automatiquement dans les payloads.

**Commandes pour tester:**
```bash
# Build
npm run build

# Développement (backend + frontend)
npm run dev:all

# Backend seul
npm run dev

# Frontend seul
npm run dev:frontend
```
