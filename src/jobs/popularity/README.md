# Système de Popularité des Artistes

## Vue d'ensemble

Système de calcul de popularité des artistes **strictement offline** via des jobs background. La popularité est calculée hors jeu, stockée en base de données, et utilisée directement par le système de scoring sans aucun appel API externe.

## Architecture

### Pipeline en 3 étapes

1. **Ingestion** (`PopularityIngestJob`) : Récupère les données brutes depuis les sources externes
2. **Scoring** (`PopularityScoreJob`) : Calcule les scores de popularité [0..1]
3. **Quantiles** (`PopularityQuantilesJob`) : Calcule les quantiles et assigne les tiers

### Sources de données autorisées (uniquement pour les jobs)

- **ListenBrainz** : Volume d'écoutes sur 365 jours
- **Wikipedia/Wikidata** : Nombre de sitelinks et pageviews
- **MusicBrainz** : Nombre d'enregistrements, releases, relations

## Modèle de données

### Tables

- `artist_popularity_raw` : Données brutes récupérées
- `artist_popularity_score` : Scores calculés [0..1]
- `artist_popularity_tier` : Tiers assignés (UNDERGROUND, NICHE, POPULAR, MAINSTREAM, ULTRA_MAINSTREAM)
- `popularity_quantiles` : Seuils de quantiles pour chaque version

## Utilisation

### Scripts npm

```bash
# Ingérer les données brutes
npm run popularity:ingest

# Calculer les scores
npm run popularity:score

# Calculer les quantiles et assigner les tiers
npm run popularity:quantiles

# Exécuter tout le pipeline
npm run popularity:all
```

### Intégration Railway

Les jobs peuvent être exécutés via des cron jobs Railway :

```yaml
# railway.json (exemple)
{
  "cron": [
    {
      "command": "npm run popularity:all",
      "schedule": "0 2 * * *"  # Tous les jours à 2h du matin
    }
  ]
}
```

## Calcul du score (v1)

### Normalisation

Toutes les métriques sont transformées via `log1p(x)` puis normalisées [0..1] avec min/max calculés offline.

### Pondérations fixes

```
score = clamp01(
  0.50 * ListenBrainz +
  0.30 * Wikipedia/Wikidata +
  0.20 * MusicBrainz
)
```

### Wikipedia/Wikidata

- 70% sitelinks
- 30% pageviews
- Si pageviews absent, renormaliser à 100% sitelinks

### MusicBrainz

- Moyenne des métriques disponibles (recordings, releases, relations)
- Ignorer les valeurs nulles

## Conversion Score → Tier

Les tiers sont assignés par **quantiles**, pas par seuils fixes :

- `score < q20` → UNDERGROUND
- `q20 ≤ score < q40` → NICHE
- `q40 ≤ score < q60` → POPULAR
- `q60 ≤ score < q80` → MAINSTREAM
- `score ≥ q80` → ULTRA_MAINSTREAM

## Intégration avec le jeu

### Runtime (pendant une partie)

Le système lit **UNIQUEMENT** depuis `artist_popularity_tier` :

```typescript
import { popularityCategoryProvider } from './services/providers/PopularityCategoryProvider';

// Précharger depuis la base de données AVANT le jeu
const tiers = await repository.getAllTiers();
const tierMap = new Map(tiers.map(t => [t.artist_id, t.tier]));
popularityCategoryProvider.preloadCategoriesFromTiers(tierMap);

// Utiliser pendant le jeu (aucun appel API)
const category = popularityCategoryProvider.getCategory(mbid);
```

### Fallback

Si un artiste n'a pas de tier en base, le fallback est `'niche'` (pas de calcul dynamique).

## Contraintes absolues

1. **AUCUN appel API externe** dans :
   - Socket.io handlers
   - Endpoints REST de jeu
   - Moteur de score

2. **TOUTE la logique de popularité** doit être :
   - Centralisée dans des jobs background
   - Déterministe
   - Idempotente
   - Relançable sans effet de bord

3. **La popularité est** :
   - Calculée via des données agrégées
   - Transformée en score [0..1]
   - Convertie en catégories par quantiles
   - Versionnée
   - Persistée en base

## Implémentation de la base de données

Le `PopularityRepository` est actuellement implémenté en mémoire (`InMemoryPopularityRepository`). 

**Pour la production**, implémentez une version PostgreSQL :

```typescript
// src/jobs/popularity/PostgresPopularityRepository.ts
export class PostgresPopularityRepository implements IPopularityRepository {
  // Implémenter toutes les méthodes avec pg (PostgreSQL)
}
```

Puis modifiez `createPopularityRepository()` pour utiliser PostgreSQL si `DATABASE_URL` est défini.

## Logs

Tous les logs sont au format JSON pour compatibilité Railway :

```json
{
  "level": "info",
  "job": "popularity_ingest",
  "step": "starting",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Versioning

- `SCORING_MODEL_VERSION = 'v1'` : Version du modèle de scoring
- `TIER_VERSION = 'v1'` : Version des tiers de popularité

Si le modèle change, incrémentez les versions pour maintenir la compatibilité.
