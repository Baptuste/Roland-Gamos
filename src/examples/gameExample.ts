/**
 * Exemple complet d'utilisation du système de jeu
 * Montre comment créer une partie, gérer les tours et valider les propositions
 */

import { createPlayer } from '../types/Player';
import { createGame, GameStatus } from '../types/Game';
import { GameService } from '../services/GameService';

/**
 * Exemple de partie complète
 */
export async function runGameExample() {
  console.log('=== Exemple de partie Roland Gamos ===\n');

  // 1. Créer les joueurs
  const players = [
    createPlayer('p1', 'Alice'),
    createPlayer('p2', 'Bob'),
    createPlayer('p3', 'Charlie'),
  ];

  console.log('Joueurs créés:');
  players.forEach((p) => console.log(`  - ${p.name} (${p.id})`));

  // 2. Créer une partie
  const game = createGame('game1', players);
  console.log(`\nPartie créée: ${game.id}`);

  // 3. Créer le service de jeu
  const gameService = new GameService();

  // 4. Démarrer la partie
  let currentGame = gameService.startGame(game);
  console.log('Partie démarrée !\n');

  // 5. Simuler plusieurs tours
  const artistes = [
    'Booba',
    'Kaaris', // Collaboration avec Booba
    'Damso', // Vérifier la collaboration
    'Ninho', // Vérifier la collaboration
  ];

  for (let i = 0; i < artistes.length && currentGame.status === GameStatus.IN_PROGRESS; i++) {
    const currentPlayer = gameService.getCurrentPlayer(currentGame);
    if (!currentPlayer) {
      console.log('Aucun joueur actif');
      break;
    }

    console.log(`--- Tour ${i + 1} ---`);
    console.log(`Joueur actuel: ${currentPlayer.name}`);
    console.log(`Artiste proposé: "${artistes[i]}"`);

    const result = await gameService.proposeArtist(
      currentGame,
      currentPlayer.id,
      artistes[i]
    );

    console.log(`Résultat: ${result.message}`);
    console.log(`Valide: ${result.isValid ? 'Oui' : 'Non'}`);

    currentGame = result.game;

    // Afficher l'état
    const activePlayers = gameService.getActivePlayers(currentGame);
    console.log(`Joueurs actifs: ${activePlayers.map((p) => p.name).join(', ')}`);
    console.log(`Statut: ${currentGame.status}\n`);

    // Petite pause pour la lisibilité
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // 6. Afficher le résumé final
  console.log('=== Résumé de la partie ===');
  console.log(`Statut final: ${currentGame.status}`);
  console.log(`Nombre de tours: ${currentGame.turns.length}`);
  console.log(`Joueurs actifs: ${gameService.getActivePlayers(currentGame).map((p) => p.name).join(', ')}`);
  console.log('\nHistorique des tours:');
  currentGame.turns.forEach((turn, index) => {
    const player = currentGame.players.find((p) => p.id === turn.playerId);
    console.log(
      `  ${index + 1}. ${player?.name} -> "${turn.artistName}" ${turn.isValid ? '✓' : '✗'}`
    );
  });
}

// Exécuter l'exemple si le fichier est exécuté directement
if (require.main === module) {
  runGameExample().catch(console.error);
}
