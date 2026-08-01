import { useState, useEffect, type CSSProperties } from 'react';
import '../styles/HomeScreen.css';

import { BACKEND_URL } from '../services/backendUrl';

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

  const tile = (color: string): CSSProperties => ({
    background: 'linear-gradient(180deg, #1c1712 0%, #100d0a 100%)',
    boxShadow: `0 0 0 2px #0a0705, 0 0 0 4px ${color}, 4px 4px 0 0 rgba(0, 0, 0, 0.7)`,
    padding: '0.75rem',
    textAlign: 'center' as const,
  });

  return (
    <div className="home-screen">
      <div className="container">
        <div className="game-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <button className="btn btn-secondary btn-back" onClick={onBackToHome}>← Retour</button>
          <h1 className="game-title" style={{ fontSize: '1.3rem', fontWeight: 700, flex: 1 }}>
            {readOnly ? 'Profil adversaire' : 'Profil'}
          </h1>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', paddingTop: '3rem' }}>
            <p style={{ color: 'var(--primary)', fontSize: 11, letterSpacing: 2 }}>CHARGEMENT...</p>
          </div>
        ) : (
          <>
            {/* Zone identité */}
            <div className="card fade-in" style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              {/* Avatar placeholder */}
              <div style={{
                width: 72,
                height: 72,
                background: 'linear-gradient(180deg, #2b2620 0% 55%, #15120e 55% 100%)',
                boxShadow: '0 0 0 2px #0a0705, 0 0 0 4px var(--primary), 3px 3px 0 0 rgba(0, 0, 0, 0.7)',
                margin: '0 auto 0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 32,
              }}>
                👤
              </div>

              {/* Pseudo */}
              <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2, margin: 0, textShadow: '2px 2px 0 rgba(0,0,0,0.7)' }}>
                {player?.pseudo || playerName}
              </p>

              {/* Badge titre + prestige */}
              <div style={{
                display: 'inline-block',
                marginTop: 8,
                background: 'linear-gradient(180deg, #4a3319 0% 55%, #2a1c0d 55% 100%)',
                boxShadow: '0 0 0 2px #0a0705, 0 0 0 3px var(--primary)',
                padding: '3px 10px',
                fontSize: 9,
                letterSpacing: 2,
                color: '#ffe9b8',
                fontWeight: 700,
              }}>
                {prestige.toUpperCase()}
              </div>

              <p style={{ fontSize: 11, color: 'var(--primary)', margin: '8px 0 0' }}>
                NIVEAU {level}
              </p>

              {/* Barre XP (cachée en mode readOnly) */}
              {!readOnly && (
                <div style={{ marginTop: 12, textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 8, color: 'var(--primary)' }}>XP</span>
                    <span style={{ fontSize: 8, color: 'rgba(155,89,255,0.6)' }}>
                      {xpInLevel} / {xpNeeded}
                    </span>
                  </div>
                  <div style={{
                    background: '#0a0705',
                    boxShadow: '0 0 0 2px #0a0705, 0 0 0 3px #5a4a38',
                    height: 10,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${xpPct}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, var(--primary-dark), var(--primary))',
                      transition: 'width 0.6s steps(10)',
                    }} />
                  </div>
                </div>
              )}

              {/* Bouton personnaliser (non readOnly) */}
              {!readOnly && onEditSettings && (
                <button
                  className="btn btn-secondary"
                  onClick={onEditSettings}
                  style={{ marginTop: 14, fontSize: 10 }}
                >
                  PARAMÈTRES
                </button>
              )}
            </div>

            {/* Stats — 4 cartes */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.6rem',
              marginBottom: '1rem',
            }}>
              {[
                { label: 'PARTIES', value: totalGames, color: '#b0c4de' },
                { label: 'MEILLEUR SCORE', value: bestScore.toLocaleString(), color: '#ffd700' },
                { label: 'VICTOIRES', value: wins, color: '#44ff88' },
                { label: 'DÉFAITES', value: losses, color: '#ff4444' },
              ].map(({ label, value, color }) => (
                <div key={label} style={tile(color)}>
                  <p style={{ fontSize: 8, letterSpacing: 2, color: 'var(--text-muted)', marginBottom: 4 }}>
                    {label}
                  </p>
                  <p style={{ fontSize: 20, fontWeight: 700, color, margin: 0 }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Total score */}
            <div style={{
              ...tile('var(--accent)'),
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              textAlign: 'left',
            }}>
              <span style={{ fontSize: 9, letterSpacing: 2, color: 'var(--text-muted)' }}>SCORE TOTAL</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>
                {(player?.total_score ?? 0).toLocaleString()}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
