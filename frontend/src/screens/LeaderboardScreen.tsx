import { useState, useEffect } from 'react';
import '../styles/HomeScreen.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

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
  const RANK_COLOR = ['#ffd700', '#aaaacc', '#cd7f32'];
  const MODE_COLOR: Record<Mode, string> = {
    'all': '#9b59ff',
    'Solo Infini': '#9b59ff',
    'Solo Bot': '#ffd700',
    'Multijoueur': '#ff4444',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #06060f 0%, #0d0020 100%)',
      padding: '1.5rem',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button
          onClick={onBackToHome}
          style={{
            background: 'none',
            border: '1px solid #2a0a40',
            borderRadius: 4,
            color: '#ffd700',
            padding: '0.4rem 0.8rem',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          ←
        </button>
        <div>
          <p style={{ fontSize: 9, letterSpacing: 4, color: '#9b59ff', margin: 0 }}>ROLAND-GAMOS</p>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#ffd700', letterSpacing: 2, margin: 0 }}>
            CLASSEMENT
          </h1>
        </div>
      </div>

      {/* Filtres mode */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {(['all', 'Solo Infini', 'Solo Bot', 'Multijoueur'] as Mode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: '0.3rem 0.8rem',
              fontSize: 9,
              letterSpacing: 2,
              fontWeight: 700,
              borderRadius: 3,
              border: `1px solid ${mode === m ? MODE_COLOR[m] : '#2a0a40'}`,
              background: mode === m ? `${MODE_COLOR[m]}22` : '#0d0020',
              color: mode === m ? MODE_COLOR[m] : 'rgba(255,255,255,0.4)',
              cursor: 'pointer',
            }}
          >
            {m === 'all' ? 'TOUS' : m.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Filtres période */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '1.5rem' }}>
        {([['all', 'ALL TIME'], ['week', 'CETTE SEMAINE']] as [Period, string][]).map(([p, label]) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              padding: '0.25rem 0.7rem',
              fontSize: 8,
              letterSpacing: 2,
              borderRadius: 3,
              border: `1px solid ${period === p ? '#ffd700' : '#1a0a3a'}`,
              background: period === p ? '#ffd70022' : 'transparent',
              color: period === p ? '#ffd700' : 'rgba(255,255,255,0.3)',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      <div style={{
        background: '#06060f',
        border: '1px solid #1a0a3a',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        {isLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <p style={{ color: '#9b59ff', fontSize: 11, letterSpacing: 2 }}>CHARGEMENT...</p>
          </div>
        ) : entries.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <p style={{ fontSize: 32, marginBottom: 8 }}>🏆</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, letterSpacing: 1 }}>
              Aucun score enregistré.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, marginTop: 4 }}>
              Jouez une partie pour apparaître ici !
            </p>
          </div>
        ) : (
          entries.map((entry, index) => (
            <div
              key={entry.id || index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '0.75rem 1rem',
                borderBottom: index < entries.length - 1 ? '1px solid #1a0a3a' : 'none',
                background: index === 0 ? '#1a1000' : 'transparent',
              }}
            >
              {/* Rang */}
              <span style={{
                fontSize: index < 3 ? 20 : 12,
                minWidth: 32,
                textAlign: 'center',
                color: index < 3 ? RANK_COLOR[index] : 'rgba(255,255,255,0.3)',
                fontWeight: 700,
              }}>
                {index < 3 ? RANK_ICON[index] : `#${index + 1}`}
              </span>

              {/* Infos joueur */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontWeight: 600,
                  fontSize: 13,
                  color: index === 0 ? '#ffd700' : '#fff',
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {getName(entry)}
                  {entry.players?.level && (
                    <span style={{ fontSize: 9, color: '#9b59ff', marginLeft: 6 }}>
                      Nv.{entry.players.level}
                    </span>
                  )}
                </p>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', margin: '2px 0 0' }}>
                  {entry.mode} · {entry.turns} manches · {getDate(entry)}
                </p>
              </div>

              {/* Score */}
              <span style={{
                fontWeight: 700,
                fontSize: 16,
                color: index === 0 ? '#ffd700' : '#9b59ff',
              }}>
                {entry.score.toLocaleString()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Supprimé : saveToLeaderboard (maintenant géré par /api/solo/*/finish via GameOverScreen)
