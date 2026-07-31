/**
 * Les 6 jokers du mode Multijoueur — voir CLAUDE_3.md §7.2 / BRIEF_SESSION_1.md §5.
 */
export type JokerType = 'timer' | 'skip' | 'combo' | 'bouclier' | 'archives' | 'resurrection';

/**
 * Représente un joueur dans une partie
 */
export interface Player {
  id: string;
  name: string;
  isEliminated: boolean;
  livesRemaining: number;
  /**
   * Stock de jokers restants par type. Pendant le lobby (settings.jokerSelectionMode
   * === 'manuelle'), représente la sélection en cours (doit sommer à 3, max 2/type
   * avant le lancement) ; en jeu, décrémenté à chaque utilisation.
   */
  jokerStock?: Partial<Record<JokerType, number>>;
  teamId?: string; // pertinent seulement si settings.teamsEnabled (voir types/Game.ts)
}

/**
 * Crée un nouveau joueur
 * @param maxLives Nombre de vies de départ (défaut 1 = comportement historique : 1 erreur = élimination)
 */
export function createPlayer(id: string, name: string, maxLives: number = 1): Player {
  return {
    id,
    name,
    isEliminated: false,
    livesRemaining: maxLives,
  };
}
