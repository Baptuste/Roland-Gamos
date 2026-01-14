/**
 * Version de la normalisation des familles de titres
 * À incrémenter si les règles changent
 */
export const TITLE_FAMILY_NORM_VERSION = "v1";

/**
 * Suffixes à supprimer pour normaliser une famille de titre
 * Ces suffixes peuvent apparaître dans des parenthèses OU après des tirets
 */
const TITLE_SUFFIXES = [
  'remix',
  'edit',
  'version',
  'live',
  'radio edit',
  'radio',
  'extended',
  'extended version',
  'acoustic',
  'acoustic version',
  'instrumental',
  'instrumental version',
  'demo',
  'demo version',
];

/**
 * Normalise un titre en famille de titre
 * 
 * Règles :
 * - minuscules
 * - suppression ponctuation
 * - suppression des suffixes (remix, edit, version, live, radio edit)
 *   (parenthèses OU après tirets)
 * - suppression espaces multiples
 * 
 * @param title Titre original
 * @returns Famille de titre normalisée
 */
export function normalizeTitleToFamily(title: string): string {
  if (!title || typeof title !== 'string') {
    return '';
  }

  let normalized = title.trim();

  // Convertir en minuscules
  normalized = normalized.toLowerCase();

  // Supprimer la ponctuation (garder seulement lettres, chiffres et espaces)
  normalized = normalized.replace(/[^\w\s]/g, ' ');

  // Supprimer les suffixes dans les parenthèses
  // Exemple: "Song (Remix)" -> "Song"
  normalized = normalized.replace(/\s*\([^)]*\)/g, '');

  // Supprimer les suffixes après des tirets
  // Exemple: "Song - Remix" -> "Song"
  // Exemple: "Song - Radio Edit" -> "Song"
  for (const suffix of TITLE_SUFFIXES) {
    // Pattern: " - suffix" ou " suffix" à la fin
    const regex1 = new RegExp(`\\s*-\\s*${suffix}\\s*$`, 'i');
    normalized = normalized.replace(regex1, '');
    
    // Pattern: " suffix" à la fin (sans tiret)
    const regex2 = new RegExp(`\\s+${suffix}\\s*$`, 'i');
    normalized = normalized.replace(regex2, '');
  }

  // Supprimer les espaces multiples
  normalized = normalized.replace(/\s+/g, ' ');

  // Supprimer les espaces en début et fin
  normalized = normalized.trim();

  return normalized;
}

/**
 * Exemples de normalisation pour tests
 */
export const NORMALIZATION_EXAMPLES = {
  'Song (Remix)': 'song',
  'Song - Remix': 'song',
  'Song - Radio Edit': 'song',
  'Song (Live)': 'song',
  'Song - Live Version': 'song',
  'Song (Edit)': 'song',
  'Song - Extended Version': 'song',
  'Song (Acoustic)': 'song',
  'Song - Instrumental': 'song',
  'Song (Demo)': 'song',
  'Song - Demo Version': 'song',
  'Song (Remix) (Edit)': 'song',
  'Song - Remix - Radio Edit': 'song',
  'Song (feat. Artist)': 'song feat artist',
  'Song, Song': 'song song',
  'Song   Song': 'song song',
};
