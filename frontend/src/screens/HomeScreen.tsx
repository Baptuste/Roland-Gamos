import { useState } from 'react';
import { Player, createPlayer } from '../shared/types';
import '../styles/HomeScreen.css';

interface HomeScreenProps {
  onStartGame: (players: Player[]) => void;
}

export default function HomeScreen({ onStartGame }: HomeScreenProps) {
  const [players, setPlayers] = useState<Player[]>([
    createPlayer('p1', ''),
    createPlayer('p2', ''),
  ]);
  const [errors, setErrors] = useState<string[]>([]);

  const handlePlayerNameChange = (id: string, name: string) => {
    setPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name } : p))
    );
    setErrors([]);
  };

  const handleAddPlayer = () => {
    const newId = `p${Date.now()}`;
    setPlayers([...players, createPlayer(newId, '')]);
  };

  const handleRemovePlayer = (id: string) => {
    if (players.length <= 2) {
      setErrors(['Il faut au moins 2 joueurs']);
      return;
    }
    setPlayers(players.filter((p) => p.id !== id));
  };

  const handleStart = () => {
    const validationErrors: string[] = [];

    // Vérifier que tous les joueurs ont un nom
    players.forEach((player, index) => {
      if (!player.name.trim()) {
        validationErrors.push(`Le joueur ${index + 1} doit avoir un nom`);
      }
    });

    // Vérifier qu'il y a au moins 2 joueurs
    if (players.length < 2) {
      validationErrors.push('Il faut au moins 2 joueurs');
    }

    // Vérifier les noms uniques
    const names = players.map((p) => p.name.trim().toLowerCase());
    const uniqueNames = new Set(names);
    if (uniqueNames.size !== names.length) {
      validationErrors.push('Les noms des joueurs doivent être uniques');
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    // Créer les joueurs avec des IDs uniques
    const playersWithIds = players.map((p, index) =>
      createPlayer(`player-${index}-${Date.now()}`, p.name.trim())
    );

    onStartGame(playersWithIds);
  };

  return (
    <div className="home-screen">
      <div className="container">
        <div className="home-header fade-in">
          <h1 className="title">🎤 Roland Gamos</h1>
          <p className="subtitle">Jeu multijoueur sur le rap français</p>
        </div>

        <div className="card fade-in">
          <h2 className="card-title">Créer une partie</h2>
          <p className="card-description">
            Ajoutez au moins 2 joueurs pour commencer
          </p>

          {errors.length > 0 && (
            <div className="error-box">
              {errors.map((error, index) => (
                <p key={index} className="error-text">
                  {error}
                </p>
              ))}
            </div>
          )}

          <div className="players-list">
            {players.map((player, index) => (
              <div key={player.id} className="player-input-group">
                <label className="player-label">
                  Joueur {index + 1}
                </label>
                <div className="player-input-row">
                  <input
                    type="text"
                    className="input player-input"
                    placeholder={`Nom du joueur ${index + 1}`}
                    value={player.name}
                    onChange={(e) =>
                      handlePlayerNameChange(player.id, e.target.value)
                    }
                    maxLength={20}
                  />
                  {players.length > 2 && (
                    <button
                      className="btn btn-remove"
                      onClick={() => handleRemovePlayer(player.id)}
                      aria-label="Supprimer le joueur"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="actions">
            <button
              className="btn btn-secondary w-full"
              onClick={handleAddPlayer}
            >
              + Ajouter un joueur
            </button>

            <button
              className="btn btn-primary w-full mt-2"
              onClick={handleStart}
              disabled={players.length < 2}
            >
              Démarrer la partie
            </button>
          </div>
        </div>

        <div className="rules-card card fade-in">
          <h3 className="rules-title">📋 Règles du jeu</h3>
          <ul className="rules-list">
            <li>Les joueurs jouent à tour de rôle</li>
            <li>Le premier joueur propose n'importe quel artiste</li>
            <li>
              Les joueurs suivants doivent proposer un artiste ayant collaboré
              avec l'artiste précédent
            </li>
            <li>Un artiste ne peut être proposé qu'une seule fois</li>
            <li>
              Si la proposition est invalide, le joueur est éliminé
            </li>
            <li>Le dernier joueur actif gagne !</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
