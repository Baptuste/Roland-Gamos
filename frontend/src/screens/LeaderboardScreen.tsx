import { useState, useEffect } from 'react';
import '../styles/HomeScreen.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

interface LeaderboardEntry {
  id?: number;
  rank?: number;
  playerName?: string;
  player_name?: string;
  score: number;
  turns: number;
  mode: string;
  date?: string;
  created_at?: string;
}

interface LeaderboardScreenProps {
  onBackToHome: () => void;
}

export default function LeaderboardScreen({ onBackToHome }: LeaderboardScreenProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'Solo Infini' | 'Solo vs Bot'>('all');

  useEffect(() => {
    fetchLeaderboard();
  }, [filter]);

  async function fetchLeaderboard() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (filter !== 'all') params.set('mode', filter);
      const res = await fetch(`${BACKEND_URL}/api/leaderboard?${params}`);
      if (!res.ok) throw new Error('Erreur serveur');
      const data = await res.json();
      setEntries(data.entries || []);
    } catch {
      // Fallback localStorage
      const local = getLocalLeaderboard().filter(e => filter === 'all' || e.mode === filter);
      setEntries(local);
    } finally {
      setIsLoading(false);
    }
  }

  const getName = (e: LeaderboardEntry) => e.playerName || e.player_name || '?';
  const getDate = (e: LeaderboardEntry) => {
    if (e.created_at) return new Date(e.created_at).toLocaleDateString('fr-FR');
    return e.date || '';
  };

  return (
    <div className="home-screen">
      <div className="container">
        <div className="game-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <button className="btn btn-secondary btn-back" onClick={onBackToHome}>← Retour</button>
          <h1 className="game-title" style={{ fontSize: '1.5rem', fontWeight: 700, flex: 1 }}>Classement</h1>
        </div>

        {/* Filtres */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {(['all', 'Solo Infini', 'Solo vs Bot'] as const).map(f => (
            <button
              key={f}
              className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.8rem' }}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'Tous' : f}
            </button>
          ))}
        </div>

        <div className="card fade-in">
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <p style={{ color: 'var(--text-muted)' }}>Chargement...</p>
            </div>
          ) : entries.length === 0 ? (
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
                  key={entry.id || index}
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
                      <div style={{ fontWeight: 600 }}>{getName(entry)}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {entry.mode} — {entry.turns} tours — {getDate(entry)}
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

// ============================================================
// Helpers localStorage (fallback)
// ============================================================

function getLocalLeaderboard(): LeaderboardEntry[] {
  try {
    const data = localStorage.getItem('roland-gamos-leaderboard');
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

/**
 * Sauvegarde un score — backend Supabase + fallback localStorage
 */
export function saveToLeaderboard(playerName: string, score: number, turns: number, mode: string) {
  // Backend (fire and forget)
  fetch(`${BACKEND_URL}/api/leaderboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerName, score, turns, mode }),
  }).catch(() => {}); // silencieux si hors ligne

  // Fallback localStorage
  const entries = getLocalLeaderboard();
  entries.push({ playerName, score, turns, mode, date: new Date().toLocaleDateString('fr-FR') });
  entries.sort((a, b) => b.score - a.score);
  localStorage.setItem('roland-gamos-leaderboard', JSON.stringify(entries.slice(0, 50)));
}
