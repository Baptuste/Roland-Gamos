# CLAUDE.md — Roland-Gamos
*Dernière mise à jour : session cosmétiques / avatars / auras — avril 2026*
Lire intégralement avant toute intervention sur le codebase.

---

## 1. Présentation du projet

**Roland-Gamos** est un jeu mobile multijoueur tour par tour centré sur la culture rap / hip-hop francophone.

### Concept central
- Un joueur propose un artiste
- Le suivant doit proposer un artiste ayant **réellement collaboré** avec l'artiste précédent (featuring, titre commun, remix crédité — logique track-level)
- Un artiste déjà cité ne peut plus être rejoué
- Si la proposition est invalide, répétée ou hors délai → le joueur est éliminé

---

## 2. Stack technique

| Couche | Technologie |
|---|---|
| Backend | Node.js + TypeScript |
| Temps réel | Socket.io / WebSocket |
| Frontend | React + TypeScript |
| Base de données | Supabase (PostgreSQL) |
| Stockage fichiers | Supabase Storage |
| Auth | Supabase Auth (non activé au lancement) |
| Déploiement backend | Render (migration depuis Railway — DÉJÀ FAITE) |
| Déploiement frontend | Vercel |
| API enrichissement | Genius API |
| Repo | https://github.com/Baptuste/Roland-Gamos |

---

## 3. Décisions techniques actées

### Auth
- Pas de connexion email au lancement
- Les joueurs utilisent un pseudo uniquement (UUID généré localement)
- La colonne `auth_id` est conservée dans le schéma pour un branchement futur
- `is_anonymous = true` par défaut

### Hébergement
- Backend déployé sur **Render** (migration Railway terminée)
- Long terme : envisager Fly.io (région Paris) pour réduire la latence WebSocket
- Frontend sur Vercel — ne pas utiliser Vercel pour le backend (incompatible WebSocket)

### Validation
- Aucun appel API externe pendant une partie (règle absolue)
- Toute validation se fait depuis le GameDataStore en RAM
- Genius API utilisée uniquement par le script ETL hors partie

### Historique de partie
- L'historique est **caché par défaut** dans tous les modes
- Seul le dernier artiste joué est visible
- L'historique complet est révélé uniquement via le joker **Archives**
- Le joker Archives ne révèle l'historique qu'au joueur qui l'active, uniquement pendant la durée de son tour

### Critère d'inclusion des artistes
- Un artiste est inclus s'il a **≥ 3 collabs** avec des artistes déjà présents dans la base FR
- Exception : les artistes de la seed list sont toujours inclus
- 2 collabs → `needs_review` (décision manuelle)
- 0-1 collab → exclu

---

## 4. Modes de jeu

### Multijoueur classique
- Tour par tour, jokers optionnels (activable par le host)
- Système de vies configurable
- Mode équipe disponible

### Arcade
- Jokers activés par défaut
- Rythme plus rapide

### Solo Infini
- Pas de fin — le joueur tient le plus longtemps possible
- Endpoints REST `/api/solo/infinite/*`
- Score cumulé + meilleur score trackés séparément

### Solo vs Bot
- Le bot pioche dans le GameDataStore
- Niveaux de difficulté à implémenter
- Streak record contre le bot tracké

### Mode équipe
- Rotation alternée entre équipes
- Réajustement automatique si élimination d'un joueur
- Score double : individuel + équipe
- Égalité tranchée par le nombre de tours joués sans erreur
- Deux modes d'élimination d'équipe au choix du host

---

## 5. Système de jokers

- **Disponibles dans** : Arcade (par défaut) + Classique (option activable par le host)
- **Stock par joueur** : 3 jokers par partie, possibilité de prendre 2× le même
- **Visibilité** : le stock de chaque joueur est visible par tous
- **Impact sur le score** : utiliser un joker n'affecte pas le score du tour

### Liste des jokers
| Joker | Effet | Cible |
|---|---|---|
| Timer | Ajoute du temps | Soi |
| Skip | Passe son tour sans élimination | Soi |
| Combo | Multiplie le score du tour | Soi |
| Bouclier | Protège d'une élimination | Soi |
| Archives | Révèle l'historique complet pendant son tour | Soi uniquement |
| Résurrection | Ressuscite un joueur éliminé | Autre joueur |

---

## 6. Système de score

- **Identique dans tous les modes**
- **BasePoints** : 100 pts par réponse valide
- **ScoreCap** : 280 pts maximum par tour (tous bonus inclus)
- **TimeBonus** : dégressif — plus la réponse est rapide, plus le bonus est élevé
- **ChainBonus** : bonus tous les 5 tours de chaîne consécutive
- **PairBonus** : collab rare entre deux artistes peu associés
- **DegreeBonus** : selon le degré de séparation dans le graphe de collabs
- **CategoryBonus** : selon la catégorie de l'artiste
- La popularité d'un artiste ne plafonne pas le score — une collab rare peut toujours rapporter beaucoup

---

## 7. Système de progression (XP et niveaux)

### Calcul XP
- XP gagnée = `score du tour ÷ 10`, plafonnée à **28 XP** par réponse (aligné sur ScoreCap 280)
- Seules les réponses valides rapportent de l'XP
- Aucun XP bonus pour les victoires, jokers ou streaks

### Paliers de niveau
- **40 niveaux** au total
- Courbe : rapide au début, ralentit progressivement à partir du niveau 20
- Formule : `XP_requis(n) = 80 × 1.18^(n-2)` (arrondi)

### Tiers de prestige
| Tier | Niveaux | Aura de tier |
|---|---|---|
| Rookie | 1–10 | Aucune aura |
| Street | 11–20 | Blizzard (cristaux bleus) |
| Vétéran | 21–30 | Ombre (brume violette) |
| Légende | 31–40 | Brasier (flammes rouges) |
| Lvl 40 max | — | Gold Chain (or rayonnant) |

---

## 8. Système cosmétique

### 5 catégories
1. **Avatar** — personnage affiché en jeu (tête + buste, 64×64, fond transparent)
2. **Cadre** — bordure autour de l'avatar
3. **Effet d'entrée** — mini-cinématique simultanée en début de partie (2–3s), visible par tous
4. **Aura** — effet visuel animé autour de l'avatar, généré en CSS/canvas côté frontend (pas de fichier)
5. **Titre / badge** — texte affiché sous le pseudo

### Règles d'équipement
- 1 cosmétique équipé par catégorie à la fois
- Des **combinaisons spéciales** débloquent des items exclusifs quand plusieurs conditions sont réunies
- Exemple : Avatar Street + Cadre néon + Effet Flash éclair → titre "OG" débloqué

### Disponible immédiatement (nouveau joueur)
- 10 avatars de base au choix dans le tunnel de création
- 5 avatars artistes réels iconiques : Jul, Booba, Ninho, Niska, SCH
- Cadre simple
- Effet d'entrée : Drop de micro
- Pas d'aura (tier Rookie)
- 3 titres au choix : "Rookie", "Auditeur", "Du Bled"

---

## 9. Système d'aura — architecture technique

### Principe fondamental
Les auras ne sont **pas des fichiers PNG**. Ce sont des effets visuels animés générés entièrement par le frontend (CSS animations + SVG inline). Aucun asset à stocker dans Supabase Storage pour les auras.

```tsx
<View style={styles.avatarContainer}>
  <AuraEffect type="brasier" intensity={streakLevel} />  // couche derrière l'avatar
  <Image source={{ uri: avatar_url }} />                  // PNG depuis Supabase Storage
  <FlashEffect type="blanc" visible={rareResponse} />     // couche devant, temporaire
</View>
```

### Payload envoyé par le backend au démarrage de partie
```json
{
  "joueurs": [
    {
      "pseudo": "Baptuste",
      "avatar_url": "https://xxx.supabase.co/storage/.../jul.png",
      "aura_slug": "brasier",
      "tier": "legende",
      "streak": 0
    }
  ]
}
```

Le backend envoie les mises à jour de streak via WebSocket. Le frontend ajuste l'intensité en temps réel sans aucun appel Storage.

### Règle de priorité des auras
```
Flash situationnel > Streak actif > Aura équipée > Aura de tier par défaut
```
Après un flash situationnel, l'aura revient à l'état streak ou à l'aura équipée.

---

## 10. Catalogue des auras

### Auras élémentaires

| Slug | Nom | Visuel | Condition de déblocage |
|---|---|---|---|
| `aura_brasier` | Brasier | Flammes oranges/rouges montantes | Tier Légende niv. 31+ |
| `aura_ocean` | Océan | Vagues bleues + gouttes flottantes | 50 victoires multi |
| `aura_foudre` | Foudre | Éclairs jaunes clignotants | Streak ×10 actif |
| `aura_blizzard` | Blizzard | Cristaux + flocon tournant | Tier Street niv. 11+ |
| `aura_ouragan` | Ouragan | Vagues de vent tourbillonnantes | Bouclier actif |
| `aura_seisme` | Séisme | Piliers de terre montants | 100 victoires multi |
| `aura_ombre` | Ombre | Brume violette + tentacules | Tier Vétéran niv. 21+ |
| `aura_lumiere` | Lumière | Rayons dorés rayonnants | Gagner sans joker ×10 |

### Auras fusions (deux auras parents requises)

La fusion est vérifiée par le `CosmeticsService` côté backend. Les deux slugs parents doivent être présents dans `player_cosmetics` avant que la fusion soit débloquable.

| Slug | Nom | Parents | Condition |
|---|---|---|---|
| `aura_plasma` | Plasma | Brasier + Foudre | Niv. 35+ |
| `aura_tempete` | Tempête | Blizzard + Ouragan | Streak ×15 actif |
| `aura_eclipse` | Éclipse | Ombre + Lumière | Niv. 40 uniquement |
| `aura_vapeur` | Vapeur | Brasier + Océan | 20 victoires Solo |

### Auras références rap & culture

| Slug | Nom | Visuel | Condition |
|---|---|---|---|
| `aura_cash` | Cash Money | Dollars verts flottants | 500 pts en 1 partie |
| `aura_vinyle` | Vinyle | Disque vinyle tournant | 500 artistes cités |
| `aura_graff` | Graff | Éclaboussures colorées montantes | Chaîne record ≥ 25 |
| `aura_neon` | Néon nuit | Rectangles néon rose/bleu clignotants | 1ère entrée leaderboard |
| `aura_goldchain` | Gold Chain | Chaîne dorée en orbite | Niv. 40 — Intouchable |
| `aura_booth` | Freestyle booth | Micro + ondes sonores | Chaîne record ≥ 20 |

### Auras situationnelles (automatiques, non équipables)

Ces auras s'activent seules pendant la partie selon l'état du jeu. Elles ne sont pas dans l'inventaire du joueur.

| Slug | Nom | Déclencheur | Durée |
|---|---|---|---|
| `aura_electro` | Électro | Streak ×10 actif | Jusqu'à rupture streak |
| `aura_inferno` | Inferno | Streak ×20 actif | Jusqu'à rupture streak |
| `aura_cosmos` | Cosmos | Dernier survivant en vie | Fin de partie |
| `aura_matrix` | Matrix | Joker Archives activé | Durée du tour |
| `aura_neant` | Néant | Joker Bouclier actif | Durée du tour |
| `aura_flash` | Flash blanc | Réponse rare validée | 1–2 secondes |

---

## 11. Effets d'entrée (détail)

Mini-cinématique de 2–3s, jouée **simultanément** pour tous les joueurs en début de partie.

### Effets rap
| Effet | Condition |
|---|---|
| Drop de micro | Défaut — tous |
| Vinyle qui tourne | Lvl 11 |
| Tag graffiti | Lvl 15 |
| Freestyle en booth | Chaîne record ≥ 20 |
| Cassette VHS | 50 victoires |

### Effets spectaculaires
| Effet | Condition |
|---|---|
| Flash éclair | Lvl 21 |
| Fumée urbaine | Lvl 25 |
| Explosion de lumière | Lvl 31 ou chaîne record ≥ 25 |
| Entrée royale | Lvl 40 |

### Effets exclusifs exploits
| Effet | Condition |
|---|---|
| Encyclopédiste | 500 artistes uniques cités |
| Sans filet | Gagner sans joker ×10 |
| Vinyle géant exclusif Solo | 50 parties Solo Infini |

---

## 12. Axes de déblocage cosmétiques

### Axe niveau
- Lvl 11 : Avatars Street ×3, Aura Blizzard, Vinyle qui tourne
- Lvl 15 : Tag graffiti, Titre "Taggeur", Avatar artiste Nekfeu
- Lvl 21 : Avatars Vétéran ×3, Aura Ombre, Flash éclair, Avatar artiste Freeze Corleone
- Lvl 25 : Fumée urbaine, Titre "Vétéran", Avatar artiste Hamza
- Lvl 31 : Avatars Légende ×3, Aura Brasier, Explosion de lumière, Avatar artiste Kaaris
- Lvl 35 : Aura Plasma (fusion Brasier + Foudre)
- Lvl 40 : Entrée royale, Cadre légendaire, Titre "Intouchable", Aura Gold Chain, Aura Éclipse, Avatar artiste PNL singe

### Axe victoires (multijoueur)
- 5 wins : Titre "Winner", Cadre néon
- 20 wins : Avatar "Champion", Titre "En série", Avatar artiste Lacrim
- 50 wins : Cassette VHS, Cadre doré, Titre "50 wins", Avatar artiste Sofiane, Aura Océan
- 100 wins : Titre "Centenaire", Avatar artiste Rohff, Aura Séisme

### Axe défis
- Chaîne record ≥ 20 : Effet "Freestyle en booth", Aura Booth
- Chaîne record ≥ 25 : Effet "Explosion de lumière", Aura Graff
- Gagner sans joker ×10 : Effet "Sans filet", Aura Lumière
- 500 artistes uniques cités : Effet "Encyclopédiste", Titre "Encyclopédie", Aura Vinyle

### Axe Solo Infini
- 10 parties jouées : Titre "Solitaire"
- Meilleur score ≥ 1000 pts : Avatar exclusif "Infini", Titre "Sans limite"
- Score cumulé ≥ 10 000 pts : Cadre exclusif "Infini", Titre "Grinder"
- 20 victoires Solo : Aura Vapeur (fusion Brasier + Océan)
- 50 parties jouées : Effet "Vinyle géant" exclusif Solo

### Axe Solo vs Bot
- 1ère victoire vs bot : Titre "Terminator"
- 10 victoires vs bot : Avatar "Bot Slayer", Cadre exclusif
- Streak ≥ 20 vs bot : Titre "Hors catégorie"

### Axe leaderboard + stats
- 1ère entrée leaderboard : Titre "Sur la carte", Cadre leaderboard, Aura Néon nuit
- 100 parties tous modes : Titre "Accro", Avatar exclusif vétéran
- Taux de victoire ≥ 60% : Titre "Implacable"
- Temps de jeu ≥ 10h : Titre "Dans la zone"
- 500 pts en 1 partie : Aura Cash Money

---

## 13. Catalogue avatars — structure de données

### Format obligatoire pour tous les avatars
- 64×64 pixels
- Tête + buste uniquement, vue de face
- Fond transparent (PNG)
- Style pixel art — palette limitée (~16 couleurs)
- Pas d'anti-aliasing, couleurs plates
- Traits distinctifs exagérés pour lisibilité à petite taille
- **Statiques au lancement** — aucune animation sur les avatars, feature reportée

### Stockage Supabase Storage
```
avatars/
├── personnage/    → le_rappeur.png, tony_montana.png, naruto.png...
├── artiste_reel/  → jul.png, sch_fourrure.png, sch_street.png...
└── animal/        → la_fouine.png, le_lion.png...
```

### 3 catégories validées

**`personnage`** — famille la plus grande, extensible à l'infini
- Archétypes rap : Le Rappeur, Le Beatmaker, La Rappeuse, Le DJ, Le Producteur, Le Freestyler, Le Collectionneur, Le Graffeur, Le Danseur, Le Fan
- Gangsters / icônes ciné : Tony Montana, Le Parrain, Omar Little, Pablo Escobar, Le Joker...
- Anime : Naruto, Vegeta, Afro Samurai, Spike Spiegel (Cowboy Bebop), Guts (Berserk), Luffy...
- Icônes pop culture : Ali, Jordan...

**`artiste_reel`** — artistes rap FR avec déclinaisons possibles
- Chaque déclinaison = avatar indépendant lié par `nom_reference`
- SCH (`nom_reference = "SCH"`) : SCH Fourrure / SCH Street / SCH Sombre
- PNL (`nom_reference = "PNL"`) : Ademo / N.O.S / Le Singe
- Booba (`nom_reference = "Booba"`) : Lunatic / Pirate / UFC
- Règle design : visage en priorité, sauf si symbole iconique plus fort (Freeze → cagoule, PNL → singe)

**`animal`** — animaux anthropomorphisés style rap
- Format : tête de l'animal + buste humanoïde habillé style rap
- Traits distinctifs exagérés pour lisibilité à 64×64
- Exemples : La Fouine (hoodie, chaîne), Le Lion (crinière, grillz), L'Aigle (bomber), Le Rat, Le Loup, Le Gorille, Le Serpent...

### Table SQL `avatars`

```sql
CREATE TABLE avatars (
  avatar_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom              TEXT NOT NULL,
  nom_reference    TEXT,                   -- ex: "SCH" — null si pas de famille
  categorie        TEXT NOT NULL
                   CHECK (categorie IN ('personnage', 'artiste_reel', 'animal')),
  is_default       BOOLEAN NOT NULL DEFAULT false,
  unlock_type      TEXT NOT NULL DEFAULT 'default'
                   CHECK (unlock_type IN ('default','niveau','victoires','defi','solo','leaderboard')),
  unlock_condition JSONB,                  -- ex: {"level": 15} ou {"wins": 50}
  image_url        TEXT NOT NULL,          -- URL Supabase Storage
  created_at       TIMESTAMPTZ DEFAULT now()
);
```

### Table SQL `cosmetics_catalog` (toutes catégories)

```sql
CREATE TABLE cosmetics_catalog (
  cosmetic_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type             TEXT NOT NULL
                   CHECK (type IN ('avatar','cadre','effet_entree','aura','titre')),
  nom              TEXT NOT NULL,
  slug             TEXT UNIQUE NOT NULL,   -- identifiant technique ex: "aura_brasier"
  is_default       BOOLEAN NOT NULL DEFAULT false,
  unlock_type      TEXT NOT NULL DEFAULT 'default',
  unlock_condition JSONB,
  fusion_requires  UUID[],                 -- [aura_id_1, aura_id_2] pour les fusions uniquement
  categorie        TEXT,                   -- pour les avatars uniquement
  nom_reference    TEXT,                   -- pour les déclinaisons artistes uniquement
  image_url        TEXT,                   -- null pour les auras (générées par code)
  created_at       TIMESTAMPTZ DEFAULT now()
);
```

### Table SQL `player_cosmetics`

```sql
CREATE TABLE player_cosmetics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    UUID NOT NULL REFERENCES players(player_id),
  cosmetic_id  UUID NOT NULL REFERENCES cosmetics_catalog(cosmetic_id),
  unlocked_at  TIMESTAMPTZ DEFAULT now(),
  is_equipped  BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (player_id, cosmetic_id)
);
```

---

## 14. Direction artistique

### Visuels de modes validés (générés DALL-E)
- **Solo Infini** : pixel art bleu nuit + or, vitre régie/cabine, REC rouge
- **Planète Rap** : tons chauds rouges/oranges + nuances bleu nuit dans les ombres, néon mural Planète Rap avec Saturne, table ronde, console, câbles, enceintes
- **Ring de battle** : salle concert parisienne, deux tables avec nameplates, écran LED VS, foule, arches — retouches mineures à prévoir

### Palette générale
- Fond : béton `#1A1A1A`
- Bleu néon : `#4488FF`
- Rouge néon : `#FF4444`
- Or (jokers, scores) : `#FFB800`
- Vert (réponse valide) : `#44CC44`

### Typographie
- Press Start 2P → titres et éléments clés
- Inter → texte courant
- Share Tech Mono → infos techniques

### Références visuelles
- Pixel art moderne urbain
- Affiches Fast & Furious (béton éclaté, ferraille, fumée, lumières qui percent)
- Borne d'arcade (INSERT COIN, Hi-Score, 1P/2P, scanlines)
- Grille de sélection style Street Fighter / Smash Bros pour l'écran de sélection d'avatars

---

## 15. Architecture backend

### Services à implémenter
```
GameDataStore (RAM)
├── ArtistGraph — graphe de collabs pré-calculé
├── ValidationService — vérifie collab valide + artiste non répété
├── ScoringService — calcule BasePoints + tous les bonus
├── TitleFamilyNormalizer — normalise les titres (feat., ft., remix...)
├── SoloManager — gère les sessions Solo Infini et Solo vs Bot
├── GameManager — gère les sessions multijoueur
└── CosmeticsService — vérifie et attribue les déblocages après chaque partie
```

### CosmeticsService — règles importantes
- Vérification des déblocages côté backend uniquement — jamais côté client
- Flux : fin de partie → vérifie toutes les conditions → écrit dans `player_cosmetics` → notifie le frontend
- Pour les fusions : vérifier que les deux `fusion_requires` sont présents dans `player_cosmetics` avant d'attribuer
- Les auras situationnelles ne sont jamais écrites en base — gérées uniquement en mémoire pendant la partie

### Règles absolues
- Backend autoritaire : toute validation côté serveur, jamais côté client
- Aucun appel API externe pendant une partie
- Pré-calcul de tout ce qui peut l'être (scoring, popularité, catégories)
- Services isolés et injectables pour faciliter les tests

### Tests attendus
- Unitaires : ScoringService, ValidationService, ArtistResolver, TitleFamilyNormalizer, CosmeticsService
- Intégration : SoloManager, GameManager

---

## 16. Ce qu'il ne faut pas toucher sans validation

- La logique de validation des collaborations (cœur du jeu)
- Le système de scoring une fois implémenté
- Les WebSocket handlers existants (risque de casser le multijoueur)
- La navigation frontend (risque de régression UX)

---

## 17. Sujets encore ouverts (à définir)

- Leaderboard : structure, périodes, quelles stats afficher
- Bot Solo vs Bot : niveaux de difficulté, comportement exact
- Schéma SQL complet : fichier `.sql` prêt pour Supabase
- Cas limites de validation : artiste "trop fermé" (seuil exact), homonymes, featurings non crédités
- Stats personnelles : quelles métriques afficher sur le profil
- Écran de sélection avatars : maquette style Street Fighter à finaliser
- Catalogue complet des cadres

---

*Ce fichier doit être maintenu à jour à chaque évolution majeure du projet.*