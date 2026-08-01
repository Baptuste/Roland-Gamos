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
  /**
   * Score individuel cumulé sur la partie (formule ScoringService, un coup
   * validé = un score ajouté — même mécanique que Solo Infini/vs Bot).
   */
  score: number;
  /**
   * UUID persistant du joueur humain (même valeur que soloPlayerId côté
   * frontend, localStorage), utilisé pour rattacher les stats/leaderboard
   * Multijoueur à un profil durable. Absent = joueur anonyme (client non à
   * jour) : les stats par pseudo (player_stats) restent alimentées, mais le
   * classement (table leaderboard, liée à players.id) ne sera pas rattaché
   * à un profil existant.
   */
  persistentId?: string;
}

/**
 * Crée un nouveau joueur
 * @param maxLives Nombre de vies de départ (défaut 1 = comportement historique : 1 erreur = élimination)
 */
export function createPlayer(id: string, name: string, maxLives: number = 1, persistentId?: string): Player {
  return {
    id,
    name,
    isEliminated: false,
    livesRemaining: maxLives,
    score: 0,
    persistentId,
  };
}
