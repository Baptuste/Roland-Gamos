import { useState, useEffect } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

interface ProfileData {
  player: {
    id: string;
    pseudo: string;
    level: number;
    xp: number;
    total_score: number;
  } | null;
  stats: {
    total_games: number;
    best_solo_score: number;
    bot_wins: number;
    bot_losses: number;
    multiplayer_wins?: number;
    multiplayer_losses?: number;
  } | null;
}

interface ProfileScreenProps {
  playerId: string;
  playerName: string;
  onBackToHome: () => void;
  onEditSettings?: () => void;
  readOnly?: boolean;
}

function xpForLevel(level: number): number {
  if (level <= 10) return 50;
  if (level <= 20) return 100;
  if (level <= 30) return 200;
  return 350;
}

function getPrestige(level: number): string {
  if (level <= 10) return 'Rookie';
  if (level <= 20) return 'Street';
  if (level <= 30) return 'Vétéran';
  return 'Légende';
}

function getXPIntoCurrentLevel(totalXP: number): number {
  let level = 1;
  let remaining = totalXP;
  while (level < 40) {
    const needed = xpForLevel(level);
    if (remaining < needed) break;
    remaining -= needed;
    level++;
  }
  return remaining;
}

export default function ProfileScreen({
  playerId,
  playerName,
  onBackToHome,
  onEditSettings,
  readOnly = false,
}: ProfileScreenProps) {
  const [data, setData] = useState<ProfileData>({ player: null, stats: null });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/players/${playerId}/profile`)
      .then(r => r.json())
      .then(d => {
        setData({ player: d.player || null, stats: d.stats || null });
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [playerId]);

  const player = data.player;
  const stats = data.stats;
  const level = player?.level ?? 1;
  const xp = player?.xp ?? 0;
  const prestige = getPrestige(level);
  const xpInLevel = getXPIntoCurrentLevel(xp);
  const xpNeeded = xpForLevel(level);
  const xpPct = xpNeeded > 0 ? Math.min(100, Math.round((xpInLevel / xpNeeded) * 100)) : 0;

  const totalGames = stats?.total_games ?? 0;
  const bestScore = stats?.best_solo_score ?? 0;
  const wins = (stats?.bot_wins ?? 0) + (stats?.multiplayer_wins ?? 0);
  const losses = (stats?.bot_losses ?? 0) + (stats?.multiplayer_losses ?? 0);

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
        <h1 style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: 4, margin: 0 }}>
          {readOnly ? 'PROFIL ADVERSAIRE' : 'PROFIL'}
        </h1>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', paddingTop: '3rem' }}>
          <p style={{ color: '#9b59ff', fontSize: 11, letterSpacing: 2 }}>CHARGEMENT...</p>
        </div>
      ) : (
        <>
          {/* Zone identité */}
          <div style={{
            background: '#06060f',
            border: '1px solid #1a0a3a',
            borderRadius: 8,
            padding: '1.5rem',
            textAlign: 'center',
            marginBottom: '1rem',
          }}>
            {/* Avatar placeholder */}
            <div style={{
              width: 72,
              height: 72,
              background: '#1a0040',
              borderRadius: 6,
              border: '2px solid #9b59ff',
              margin: '0 auto 0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
            }}>
              👤
            </div>

            {/* Pseudo */}
            <p style={{ fontSize: 18, fontWeight: 700, color: '#ffd700', letterSpacing: 2, margin: 0 }}>
              {player?.pseudo || playerName}
            </p>

            {/* Badge titre + prestige */}
            <div style={{
              display: 'inline-block',
              marginTop: 6,
              background: '#1a0040',
              border: '1px solid #9b59ff',
              borderRadius: 3,
              padding: '2px 8px',
              fontSize: 9,
              letterSpacing: 2,
              color: '#9b59ff',
            }}>
              {prestige.toUpperCase()}
            </div>

            <p style={{ fontSize: 11, color: '#9b59ff', margin: '6px 0 0' }}>
              NIVEAU {level}
            </p>

            {/* Barre XP (cachée en mode readOnly) */}
            {!readOnly && (
              <div style={{ marginTop: 10, textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 8, color: '#9b59ff' }}>XP</span>
                  <span style={{ fontSize: 8, color: 'rgba(155,89,255,0.6)' }}>
                    {xpInLevel} / {xpNeeded}
                  </span>
                </div>
                <div style={{ background: '#0a0020', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{
                    width: `${xpPct}%`,
                    height: '100%',
                    background: '#9b59ff',
                    borderRadius: 4,
                    transition: 'width 0.6s ease',
                  }} />
                </div>
              </div>
            )}

            {/* Bouton personnaliser (non readOnly) */}
            {!readOnly && onEditSettings && (
              <button
                onClick={onEditSettings}
                style={{
                  marginTop: 12,
                  padding: '0.4rem 1rem',
                  background: '#0d0020',
                  border: '1px solid #9b59ff',
                  borderRadius: 3,
                  color: '#9b59ff',
                  fontSize: 10,
                  letterSpacing: 2,
                  cursor: 'pointer',
                }}
              >
                PARAMÈTRES
              </button>
            )}
          </div>

          {/* Stats — 4 cartes */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            marginBottom: '1rem',
          }}>
            {[
              { label: 'PARTIES', value: totalGames, color: '#fff' },
              { label: 'MEILLEUR SCORE', value: bestScore.toLocaleString(), color: '#ffd700' },
              { label: 'VICTOIRES', value: wins, color: '#44ff88' },
              { label: 'DÉFAITES', value: losses, color: '#ff4444' },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  background: '#0d0020',
                  border: '1px solid #2a0a40',
                  borderRadius: 6,
                  padding: '0.75rem',
                  textAlign: 'center',
                }}
              >
                <p style={{ fontSize: 8, letterSpacing: 2, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>
                  {label}
                </p>
                <p style={{ fontSize: 20, fontWeight: 700, color, margin: 0 }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Total score */}
          <div style={{
            background: '#0d0020',
            border: '1px solid #2a0a40',
            borderRadius: 6,
            padding: '0.75rem 1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: 9, letterSpacing: 2, color: 'rgba(255,255,255,0.35)' }}>SCORE TOTAL</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#9b59ff' }}>
              {(player?.total_score ?? 0).toLocaleString()}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
