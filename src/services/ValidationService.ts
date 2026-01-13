import { MusicBrainzService } from './MusicBrainzService';
import { WikidataService } from './WikidataService';
import { CanonicalArtist } from '../types/Game';

/**
 * Résultat de validation d'un mouvement
 */
export interface ValidationResult {
  exists: boolean;
  validRelation: boolean;
  source?: 'musicbrainz' | 'wikidata_fallback';
  canonical: CanonicalArtist;
  flags?: {
    singleCircularCollab?: boolean;
  };
  reason?: string;
}

/**
 * Service unifié de validation
 * Combine MusicBrainz (primary) et Wikidata (fallback)
 */
export class ValidationService {
  private musicBrainzService: MusicBrainzService;
  private wikidataService: WikidataService;

  constructor(
    musicBrainzService?: MusicBrainzService,
    wikidataService?: WikidataService
  ) {
    this.musicBrainzService = musicBrainzService || new MusicBrainzService();
    this.wikidataService = wikidataService || new WikidataService();
  }

  /**
   * Valide un mouvement (proposition d'artiste)
   */
  async validateMove(
    previousArtist: CanonicalArtist | null,
    proposedArtistName: string
  ): Promise<ValidationResult> {
    const normalizedName = proposedArtistName.trim();

    // 1) Résoudre l'artiste proposé via MusicBrainz (obligatoire)
    const resolved = await this.musicBrainzService.resolveArtist(normalizedName);
    
    if (!resolved) {
      return {
        exists: false,
        validRelation: false,
        canonical: { name: normalizedName },
        reason: 'NOT_FOUND',
      };
    }

    const canonical: CanonicalArtist = {
      name: resolved.canonicalName,
      mbid: resolved.mbid,
    };

    // 2) Si c'est le premier tour (pas d'artiste précédent), accepter l'existence
    if (!previousArtist) {
      return {
        exists: true,
        validRelation: true, // Premier tour, pas de relation à vérifier
        source: 'musicbrainz',
        canonical,
      };
    }

    // 3) Vérifier la collaboration via MusicBrainz (primary)
    let validRelation = false;
    let source: 'musicbrainz' | 'wikidata_fallback' | undefined;
    
    if (previousArtist.mbid && canonical.mbid) {
      // Essayer avec les MBIDs
      const mbCollab = await this.musicBrainzService.haveCommonRecording(
        previousArtist.mbid,
        canonical.mbid
      );
      
      if (mbCollab) {
        validRelation = true;
        source = 'musicbrainz';
      }
    }

    // 4) Si MusicBrainz échoue, essayer Wikidata (fallback)
    if (!validRelation) {
      const wikidataCollab = await this.wikidataService.haveCommonRecording(
        previousArtist.name,
        canonical.name
      );
      
      if (wikidataCollab) {
        validRelation = true;
        source = 'wikidata_fallback';
        // Ajouter le QID Wikidata si disponible
        const qid = await this.wikidataService.findArtistQidByName(canonical.name);
        if (qid) {
          canonical.qid = qid;
        }
      }
    }

    if (!validRelation) {
      return {
        exists: true,
        validRelation: false,
        canonical,
        reason: 'NO_RELATION',
      };
    }

    // 5) Vérifier la règle "single circular collaboration"
    let singleCircularCollab = false;
    if (canonical.mbid && previousArtist.mbid) {
      const collaborators = await this.musicBrainzService.getKnownCollaborators(canonical.mbid);
      
      // Si l'artiste n'a qu'un seul collaborateur connu et que c'est l'artiste précédent
      if (collaborators.length === 1 && collaborators[0] === previousArtist.mbid) {
        singleCircularCollab = true;
      }
    }

    return {
      exists: true,
      validRelation: true,
      source,
      canonical,
      flags: {
        singleCircularCollab,
      },
    };
  }
}
