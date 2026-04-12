import '../styles/HomeScreen.css';

interface LeaderboardEntry {
  rank: number;
  playerName: string;
  score: number;
  turns: number;
  mode: string;
  date: string;
}

interface LeaderboardScreenProps {
  onBackToHome: () => void;
}

/**
 * Récupère le leaderboard depuis le localStorage
 */
function getLeaderboard(): LeaderboardEntry[] {
  try {
    const data = localStorage.getItem('roland-gamos-leaderboard');
    if (data) {
      return JSON.parse(data);
    }
  } catch {}
  return [];
}

export default function LeaderboardScreen({ onBackToHome }: LeaderboardScreenProps) {
  const entries = getLeaderboard();

  return (
    <div className="home-screen">
      <div className="container">
        <div className="game-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <button className="btn btn-secondary btn-back" onClick={onBackToHome}>
            ← Retour
          </button>
          <h1 className="game-title" style={{ fontSize: '1.5rem', fontWeight: 700, flex: 1 }}>Classement</h1>
        </div>

        <div className="card fade-in">
          {entries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏆</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                Aucun score enregistré pour le moment.
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                Jouez une partie solo ou vs bot pour apparaître ici !
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {entries.map((entry, index) => (
                <div
                  key={index}
                  className="player-waiting-item"
                  style={{
                    borderColor: index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? '#cd7f32' : 'var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                    <span style={{ fontSize: '1.5rem', minWidth: '2rem', textAlign: 'center' }}>
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                    </span>
                    <div>
                      <div style={{ fontWeight: 600 }}>{entry.playerName}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {entry.mode} - {entry.turns} tours - {entry.date}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--primary)' }}>
                    {entry.score}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Sauvegarde un score dans le leaderboard
 */
export function saveToLeaderboard(playerName: string, score: number, turns: number, mode: string) {
  const entries = getLeaderboard();
  const newEntry: LeaderboardEntry = {
    rank: 0,
    playerName,
    score,
    turns,
    mode,
    date: new Date().toLocaleDateString('fr-FR'),
  };

  entries.push(newEntry);
  entries.sort((a, b) => b.score - a.score);

  // Garder les 50 meilleurs
  const trimmed = entries.slice(0, 50).map((e, i) => ({ ...e, rank: i + 1 }));

  localStorage.setItem('roland-gamos-leaderboard', JSON.stringify(trimmed));
}
