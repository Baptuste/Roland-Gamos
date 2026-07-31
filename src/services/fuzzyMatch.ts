/**
 * Distance de Levenshtein classique (DP a deux lignes), avec sortie
 * anticipee au-dela de maxDistance pour rester rapide sur de gros volumes
 * de candidats.
 */
export function levenshtein(a: string, b: string, maxDistance: number): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > maxDistance) return maxDistance + 1;

  let prevRow = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const currRow = [i];
    let rowMin = currRow[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        prevRow[j] + 1,      // suppression
        currRow[j - 1] + 1,  // insertion
        prevRow[j - 1] + cost // substitution
      );
      currRow.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > maxDistance) return maxDistance + 1; // sortie anticipee
    prevRow = currRow;
  }
  return prevRow[n];
}

/**
 * Distance maximale toleree selon la longueur du texte saisi.
 * Noms tres courts (<=3 caracteres) : aucune tolerance, trop ambigu.
 */
export function maxDistanceForLength(length: number): number {
  return length <= 3 ? 0 : length <= 6 ? 1 : 2;
}

/**
 * Cherche le meilleur candidat par distance de Levenshtein parmi les cles
 * d'une Map. N'accepte la correction que si un seul candidat atteint la
 * distance minimale (evite de corriger vers le mauvais element en cas
 * d'ambiguite entre deux candidats a egale distance).
 */
export function fuzzyMatch<T>(query: string, candidates: Map<string, T>): T | null {
  const maxDistance = maxDistanceForLength(query.length);
  if (maxDistance === 0) return null;

  let bestDistance = Infinity;
  let bestValue: T | null = null;
  let bestIsUnique = true;

  for (const [candidateName, value] of candidates) {
    if (Math.abs(candidateName.length - query.length) > maxDistance) continue;

    const distance = levenshtein(query, candidateName, maxDistance);
    if (distance > maxDistance) continue;

    if (distance < bestDistance) {
      bestDistance = distance;
      bestValue = value;
      bestIsUnique = true;
    } else if (distance === bestDistance && value !== bestValue) {
      bestIsUnique = false;
    }
  }

  return bestIsUnique ? bestValue : null;
}
