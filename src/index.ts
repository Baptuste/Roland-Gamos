/**
 * Point d'entrée principal
 * Exemple d'utilisation du système de jeu
 */

import { createPlayer } from './types/Player';
import { createGame } from './types/Game';
import { GameService } from './services/GameService';
import { GameStatus } from './types/Game';

/**
 * Exemple d'utilisation du système de jeu
 */
async function example() {
  console.log('=== Exemple de partie Roland Gamos ===\n');

  // Créer les joueurs
  const player1 = createPlayer('p1', 'Alice');
  const player2 = createPlayer('p2', 'Bob');
  const player3 = createPlayer('p3', 'Charlie');

  // Créer une partie
  const game = createGame('game1', [player1, player2, player3]);
  console.log('Partie créée avec 3 joueurs:', game.players.map((p) => p.name).join(', '));

  // Créer le service de jeu
  const gameService = new GameService();

  // Démarrer la partie
  let currentGame = gameService.startGame(game);
  console.log('\nPartie démarrée !');

  // Simuler quelques tours
  console.log('\n--- Tour 1 ---');
  const currentPlayer1 = gameService.getCurrentPlayer(currentGame);
  console.log(`Joueur actuel: ${currentPlayer1?.name}`);

  // Premier tour : n'importe quel artiste
  const result1 = await gameService.proposeArtist(
    currentGame,
    currentPlayer1!.id,
    'Booba'
  );
  console.log(`Proposition: "${result1.turn.artistName}"`);
  console.log(`Résultat: ${result1.message}`);
  currentGame = result1.game;

  // Tour suivant
  if (currentGame.status === GameStatus.IN_PROGRESS) {
    console.log('\n--- Tour 2 ---');
    const currentPlayer2 = gameService.getCurrentPlayer(currentGame);
    console.log(`Joueur actuel: ${currentPlayer2?.name}`);

    const result2 = await gameService.proposeArtist(
      currentGame,
      currentPlayer2!.id,
      'Kaaris'
    );
    console.log(`Proposition: "${result2.turn.artistName}"`);
    console.log(`Résultat: ${result2.message}`);
    currentGame = result2.game;
  }

  // Afficher l'état final
  console.log('\n--- État de la partie ---');
  console.log(`Statut: ${currentGame.status}`);
  console.log(`Joueurs actifs: ${gameService.getActivePlayers(currentGame).map((p) => p.name).join(', ')}`);
  console.log(`Nombre de tours: ${currentGame.turns.length}`);
}

// Exécuter l'exemple si le fichier est exécuté directement
if (require.main === module) {
  example().catch(console.error);
}

// Exports pour utilisation externe
export { example };
export { createPlayer } from './types/Player';
export { createGame, GameStatus } from './types/Game';
export { GameService } from './services/GameService';
export { MusicBrainzService } from './services/MusicBrainzService';
export type { Player } from './types/Player';
export type { Turn } from './types/Turn';
export type { Game } from './types/Game';
export type { ProposalResult } from './services/GameService';
