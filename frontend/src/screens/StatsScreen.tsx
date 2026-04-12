import '../styles/HomeScreen.css';

interface PlayerStats {
  totalGames: number;
  totalSoloGames: number;
  totalBotGames: number;
  totalMultiplayerGames: number;
  bestSoloScore: number;
  bestSoloTurns: number;
  bestBotScore: number;
  totalScore: number;
  botWins: number;
  botLosses: number;
}

interface StatsScreenProps {
  onBackToHome: () => void;
}

function getStats(): PlayerStats {
  try {
    const data = localStorage.getItem('roland-gamos-stats');
    if (data) {
      return JSON.parse(data);
    }
  } catch {}
  return {
    totalGames: 0,
    totalSoloGames: 0,
    totalBotGames: 0,
    totalMultiplayerGames: 0,
    bestSoloScore: 0,
    bestSoloTurns: 0,
    bestBotScore: 0,
    totalScore: 0,
    botWins: 0,
    botLosses: 0,
  };
}

export default function StatsScreen({ onBackToHome }: StatsScreenProps) {
  const stats = getStats();

  const statItems = [
    { label: 'Parties jouées', value: stats.totalGames, icon: '🎮' },
    { label: 'Parties solo', value: stats.totalSoloGames, icon: '🎯' },
    { label: 'Parties vs Bot', value: stats.totalBotGames, icon: '🤖' },
    { label: 'Parties multijoueur', value: stats.totalMultiplayerGames, icon: '👥' },
    { label: 'Meilleur score solo', value: stats.bestSoloScore, icon: '⭐' },
    { label: 'Meilleur tour solo', value: stats.bestSoloTurns, icon: '🔥' },
    { label: 'Meilleur score vs Bot', value: stats.bestBotScore, icon: '🏆' },
    { label: 'Score total', value: stats.totalScore, icon: '💎' },
    { label: 'Victoires vs Bot', value: stats.botWins, icon: '✅' },
    { label: 'Défaites vs Bot', value: stats.botLosses, icon: '❌' },
  ];

  return (
    <div className="home-screen">
      <div className="container">
        <div className="game-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <button className="btn btn-secondary btn-back" onClick={onBackToHome}>
            ← Retour
          </button>
          <h1 className="game-title" style={{ fontSize: '1.5rem', fontWeight: 700, flex: 1 }}>Statistiques</h1>
        </div>

        <div className="card fade-in">
          {stats.totalGames === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                Aucune statistique pour le moment.
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                Jouez des parties pour commencer à accumuler des stats !
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {statItems.map((item, index) => (
                <div
                  key={index}
                  className="player-waiting-item"
                  style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '1.25rem' }}
                >
                  <span style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{item.icon}</span>
                  <span style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--primary)' }}>
                    {item.value}
                  </span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {stats.totalGames > 0 && (
          <div className="card fade-in" style={{ marginTop: '1rem' }}>
            <button
              className="btn btn-secondary w-full"
              onClick={() => {
                if (confirm('Voulez-vous vraiment réinitialiser toutes vos statistiques ?')) {
                  localStorage.removeItem('roland-gamos-stats');
                  window.location.reload();
                }
              }}
            >
              Réinitialiser les statistiques
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Met à jour les statistiques après une partie
 */
export function updateStats(update: {
  mode: 'solo' | 'bot' | 'multiplayer';
  score: number;
  turns: number;
  botWin?: boolean;
}) {
  const stats = getStats();

  stats.totalGames++;
  stats.totalScore += update.score;

  if (update.mode === 'solo') {
    stats.totalSoloGames++;
    if (update.score > stats.bestSoloScore) stats.bestSoloScore = update.score;
    if (update.turns > stats.bestSoloTurns) stats.bestSoloTurns = update.turns;
  } else if (update.mode === 'bot') {
    stats.totalBotGames++;
    if (update.score > stats.bestBotScore) stats.bestBotScore = update.score;
    if (update.botWin) stats.botWins++;
    else stats.botLosses++;
  } else {
    stats.totalMultiplayerGames++;
  }

  localStorage.setItem('roland-gamos-stats', JSON.stringify(stats));
}

