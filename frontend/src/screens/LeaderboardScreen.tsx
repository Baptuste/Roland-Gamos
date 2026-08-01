import { useState, useEffect, type CSSProperties } from 'react';
import '../styles/HomeScreen.css';

import { BACKEND_URL } from '../services/backendUrl';

type Mode = 'all' | 'Solo Infini' | 'Solo Bot' | 'Multijoueur';
type Period = 'all' | 'week';

interface LeaderboardEntry {
  id?: number;
  score: number;
  turns: number;
  mode: string;
  created_at?: string;
  players?: { id: string; pseudo: string; level: number };
  // Fallback (ancienne API)
  player_name?: string;
}

interface LeaderboardScreenProps {
  onBackToHome: () => void;
}

export default function LeaderboardScreen({ onBackToHome }: LeaderboardScreenProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('all');
  const [period, setPeriod] = useState<Period>('all');

  useEffect(() => {
    fetchLeaderboard();
  }, [mode, period]);

  async function fetchLeaderboard() {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (mode !== 'all') params.set('mode', mode);
      if (period !== 'all') params.set('period', period);
      const res = await fetch(`${BACKEND_URL}/api/leaderboard?${params}`);
      if (!res.ok) throw new Error('Erreur serveur');
      const data = await res.json();
      setEntries(data.entries || []);
    } catch {
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  }

  const getName = (e: LeaderboardEntry) =>
    e.players?.pseudo || e.player_name || '—';

  const getDate = (e: LeaderboardEntry) =>
    e.created_at ? new Date(e.created_at).toLocaleDateString('fr-FR') : '';

  const RANK_ICON = ['🥇', '🥈', '🥉'];
  const RANK_COLOR = ['#ffd700', '#c0c0c0', '#cd7f32'];
  const MODE_COLOR: Record<Mode, string> = {
    'all': '#9b59ff',
    'Solo Infini': '#9b59ff',
    'Solo Bot': '#ffd700',
    'Multijoueur': '#ff4444',
  };

  const pixelTab = (active: boolean, color: string): CSSProperties => ({
    padding: '0.4rem 0.8rem',
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: 700,
    fontFamily: "'Silkscreen', monospace",
    border: 'none',
    background: active ? 'linear-gradient(180deg, #4a3319 0% 55%, #2a1c0d 55% 100%)' : 'linear-gradient(180deg, #2b2620 0% 55%, #15120e 55% 100%)',
    color: active ? '#ffe9b8' : 'rgba(255,255,255,0.4)',
    boxShadow: active
      ? `0 0 0 2px #0a0705, 0 0 0 4px ${color}, 3px 3px 0 0 rgba(0,0,0,0.75)`
      : '0 0 0 2px #0a0705, 0 0 0 4px #5a4a38, 3px 3px 0 0 rgba(0,0,0,0.7)',
    cursor: 'pointer',
  });

  return (
    <div className="home-screen">
      <div className="container">
        <div className="game-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <button className="btn btn-secondary btn-back" onClick={onBackToHome}>← Retour</button>
          <h1 className="game-title" style={{ fontSize: '1.5rem', fontWeight: 700, flex: 1 }}>
            Classement
          </h1>
        </div>

        {/* Filtres mode */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {(['all', 'Solo Infini', 'Solo Bot', 'Multijoueur'] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} style={pixelTab(mode === m, MODE_COLOR[m])}>
              {m === 'all' ? 'TOUS' : m.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Filtres période */}
        <div style={{ display: 'flex', gap: 8, marginBottom: '1.75rem' }}>
          {([['all', 'ALL TIME'], ['week', 'CETTE SEMAINE']] as [Period, string][]).map(([p, label]) => (
            <button key={p} onClick={() => setPeriod(p)} style={pixelTab(period === p, '#ffd700')}>
              {label}
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div className="card fade-in">
          {isLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--primary)', fontSize: 11, letterSpacing: 2 }}>CHARGEMENT...</p>
            </div>
          ) : entries.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <p style={{ fontSize: 32, marginBottom: 8 }}>🏆</p>
              <p style={{ color: 'var(--text-muted)', fontSize: 11, letterSpacing: 1 }}>
                Aucun score enregistré.
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 4 }}>
                Jouez une partie pour apparaître ici !
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {entries.map((entry, index) => (
                <div
                  key={entry.id || index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '0.75rem 1rem',
                    background: index === 0 ? 'linear-gradient(180deg, #2b1f08 0%, #1a1204 100%)' : 'linear-gradient(180deg, #1c1712 0%, #100d0a 100%)',
                    boxShadow: `0 0 0 2px #0a0705, 0 0 0 4px ${index < 3 ? RANK_COLOR[index] : '#5a4a38'}, 4px 4px 0 0 rgba(0,0,0,0.7)`,
                  }}
                >
                  {/* Rang */}
                  <span style={{
                    fontSize: index < 3 ? 20 : 12,
                    minWidth: 32,
                    textAlign: 'center',
                    color: index < 3 ? RANK_COLOR[index] : 'var(--text-muted)',
                    fontWeight: 700,
                  }}>
                    {index < 3 ? RANK_ICON[index] : `#${index + 1}`}
                  </span>

                  {/* Infos joueur */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontWeight: 600,
                      fontSize: 13,
                      color: index === 0 ? 'var(--accent)' : '#fff',
                      margin: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {getName(entry)}
                      {entry.players?.level && (
                        <span style={{ fontSize: 9, color: 'var(--primary)', marginLeft: 6 }}>
                          Nv.{entry.players.level}
                        </span>
                      )}
                    </p>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                      {entry.mode} · {entry.turns} manches · {getDate(entry)}
                    </p>
                  </div>

                  {/* Score */}
                  <span style={{
                    fontWeight: 700,
                    fontSize: 16,
                    color: index === 0 ? 'var(--accent)' : 'var(--primary)',
                  }}>
                    {entry.score.toLocaleString()}
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

// Supprimé : saveToLeaderboard (maintenant géré par /api/solo/*/finish via GameOverScreen)
