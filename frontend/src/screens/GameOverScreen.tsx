import { useState, useEffect, type CSSProperties } from 'react';
import { useFrameCycle } from '../hooks/useFrameCycle';
import '../styles/HomeScreen.css';

const FIN_DE_PARTIE_FRAMES = Array.from(
  { length: 6 },
  (_, i) => `/assets/backgrounds-animated/fin-de-partie/frame-${i}.png`
);

import { BACKEND_URL } from '../services/backendUrl';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface CosmeticItem {
  id: string;
  type: string;
  name: string;
  asset_url: string | null;
  rarity: 'neutre' | 'or' | 'platine' | 'diamant' | 'plutonium';
  description: string | null;
}

interface GameOverData {
  score: number;
  turns: number;
  mode: 'Solo Infini' | 'Solo Bot' | 'Multijoueur';
  playerName: string;
  endReason?: string;
  winner?: 'player' | 'bot'; // pour Solo Bot
  // Résultat complet fin de partie (chargé async)
  leaderboard?: { rank: number; score: number } | null;
  xp?: { gained: number; total: number; level: number; leveledUp: boolean; prestige: string } | null;
  unlocks?: CosmeticItem[];
}

export interface GameOverScreenProps {
  data: GameOverData;
  runId: string;
  playerId: string;
  onReplay: () => void;
  onBackToHome: () => void;
}

// ─────────────────────────────────────────────
// Helpers visuels
// ─────────────────────────────────────────────

const RARITY_COLOR: Record<string, string> = {
  neutre:    '#888888',
  or:        '#ffd700',
  platine:   '#b0c4de',
  diamant:   '#7fffd4',
  plutonium: '#cc44ff',
};

const END_REASON_LABEL: Record<string, string> = {
  TIMEOUT:      'Temps écoulé',
  REPEAT:       'Artiste déjà utilisé',
  INVALID_FEAT: 'Aucune collaboration trouvée',
  OTHER:        'Erreur',
};

function XPBar({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
  return (
    <div style={{
      background: '#0a0705',
      boxShadow: '0 0 0 2px #0a0705, 0 0 0 3px #5a4a38',
      height: 10,
      overflow: 'hidden',
      width: '100%',
    }}>
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: 'linear-gradient(90deg, var(--primary-dark), var(--primary))',
          transition: 'width 0.8s steps(10)',
        }}
      />
    </div>
  );
}

/** Panneau pixel-brut réutilisable : plaque sombre + anneau dur, sans flou. */
function pixelPanel(color = '#5a4a38'): CSSProperties {
  return {
    background: 'linear-gradient(180deg, #1c1712 0%, #100d0a 100%)',
    boxShadow: `0 0 0 2px #0a0705, 0 0 0 4px ${color}, 4px 4px 0 0 rgba(0, 0, 0, 0.7)`,
  };
}

function xpForLevel(level: number): number {
  if (level <= 10) return 50;
  if (level <= 20) return 100;
  if (level <= 30) return 200;
  return 350;
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

// ─────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────

export default function GameOverScreen({ data, runId, playerId, onReplay, onBackToHome }: GameOverScreenProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [finishData, setFinishData] = useState<{
    leaderboard: { rank: number; score: number } | null;
    xp: { gained: number; total: number; level: number; leveledUp: boolean; prestige: string } | null;
    unlocks: CosmeticItem[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const bgFrame = useFrameCycle(FIN_DE_PARTIE_FRAMES, 220);

  const endpointPath = data.mode === 'Solo Infini'
    ? '/api/solo/infinite/finish'
    : '/api/solo/bot/finish';

  useEffect(() => {
    // Appeler l'endpoint finish dès le montage (fire, affichage en étape 2)
    setIsLoading(true);
    fetch(`${BACKEND_URL}${endpointPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, playerId, playerName: data.playerName }),
    })
      .then(r => r.json())
      .then(d => {
        setFinishData({
          leaderboard: d.leaderboard || null,
          xp: d.xp || null,
          unlocks: d.unlocks || [],
        });
      })
      .catch(() => {
        setFinishData({ leaderboard: null, xp: null, unlocks: [] });
      })
      .finally(() => setIsLoading(false));
  }, []);

  // ── ÉTAPE 1 — Résultats ────────────────────
  if (step === 1) {
    const isVictory = data.mode !== 'Solo Bot' || data.winner === 'player';

    return (
      <div style={{
        minHeight: '100vh',
        position: 'relative',
        isolation: 'isolate',
        backgroundColor: '#06060f',
        backgroundImage: `linear-gradient(180deg, rgba(6,6,15,0.55) 0%, rgba(6,6,15,0.8) 100%), url(${bgFrame})`,
        backgroundSize: '384px 528px',
        backgroundPosition: 'center top',
        backgroundRepeat: 'no-repeat',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        gap: '1.5rem',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 9, letterSpacing: 4, color: 'var(--primary)', marginBottom: 4 }}>FIN DE PARTIE</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2, margin: 0, textShadow: '2px 2px 0 rgba(0,0,0,0.7)' }}>
            RÉSULTATS
          </h1>
        </div>

        {/* Podium simplifié */}
        <div style={{ ...pixelPanel(), padding: '1.5rem', width: '100%', maxWidth: 400, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>
            {isVictory ? '🏆' : '💀'}
          </div>
          <p style={{ fontSize: 13, color: 'var(--primary)', letterSpacing: 2, marginBottom: 4 }}>
            {data.playerName}
          </p>
          <p style={{ fontSize: 36, fontWeight: 700, color: 'var(--accent)', margin: '0.25rem 0', textShadow: '2px 2px 0 rgba(0,0,0,0.7)' }}>
            {data.score.toLocaleString()}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            pts
          </p>
        </div>

        {/* Stats rapides */}
        <div style={{ ...pixelPanel(), width: '100%', maxWidth: 400, display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <div style={{ padding: '0.75rem', textAlign: 'center', borderRight: '2px solid #0a0705' }}>
            <p style={{ fontSize: 8, letterSpacing: 2, color: 'var(--text-muted)', marginBottom: 4 }}>MODE</p>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>{data.mode}</p>
          </div>
          <div style={{ padding: '0.75rem', textAlign: 'center' }}>
            <p style={{ fontSize: 8, letterSpacing: 2, color: 'var(--text-muted)', marginBottom: 4 }}>MANCHES</p>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>{data.turns}</p>
          </div>
          {data.endReason && (
            <div style={{ padding: '0.75rem', textAlign: 'center', gridColumn: '1 / -1', borderTop: '2px solid #0a0705' }}>
              <p style={{ fontSize: 8, letterSpacing: 2, color: 'var(--text-muted)', marginBottom: 4 }}>FIN</p>
              <p style={{ fontSize: 11, color: 'var(--secondary)' }}>
                {END_REASON_LABEL[data.endReason] || data.endReason}
              </p>
            </div>
          )}
        </div>

        {/* Bouton continuer */}
        <button
          className="btn btn-primary"
          onClick={() => setStep(2)}
          style={{ width: '100%', maxWidth: 400, fontSize: 14, letterSpacing: 4 }}
        >
          CONTINUER →
        </button>
      </div>
    );
  }

  // ── ÉTAPE 2 — XP + Unlocks ────────────────
  const xpData = finishData?.xp;
  const unlocks = finishData?.unlocks || [];
  const lbData = finishData?.leaderboard;

  const xpGained = xpData?.gained ?? 0;
  const xpTotal = xpData?.total ?? 0;
  const xpLevel = xpData?.level ?? 1;
  const leveledUp = xpData?.leveledUp ?? false;
  const prestige = xpData?.prestige ?? 'Rookie';

  const xpInLevel = getXPIntoCurrentLevel(xpTotal);
  const xpNeeded = xpForLevel(xpLevel);

  return (
    <div style={{
      minHeight: '100vh',
      position: 'relative',
      isolation: 'isolate',
      backgroundColor: '#06060f',
      backgroundImage: `linear-gradient(180deg, rgba(6,6,15,0.6) 0%, rgba(6,6,15,0.85) 100%), url(${bgFrame})`,
      backgroundSize: '384px 528px',
      backgroundPosition: 'center top',
      backgroundRepeat: 'no-repeat',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '1.5rem',
      gap: '1rem',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginTop: '1rem' }}>
        <p style={{ fontSize: 9, letterSpacing: 4, color: 'var(--primary)', marginBottom: 4 }}>FIN DE PARTIE</p>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2, margin: 0, textShadow: '2px 2px 0 rgba(0,0,0,0.7)' }}>
          XP & RÉCOMPENSES
        </h1>
      </div>

      {/* Classement */}
      {lbData && (
        <div style={{ ...pixelPanel(), padding: '0.75rem 1rem', width: '100%', maxWidth: 400, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9, letterSpacing: 3, color: 'var(--text-muted)' }}>
            CLASSEMENT {data.mode.toUpperCase()}
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>
            #{lbData.rank}
          </span>
        </div>
      )}

      {/* Section XP */}
      {isLoading ? (
        <div style={{ ...pixelPanel(), padding: '1.25rem', width: '100%', maxWidth: 400, textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: 'var(--primary)' }}>Calcul XP...</p>
        </div>
      ) : (
        <div style={{ ...pixelPanel('var(--primary)'), padding: '1.25rem', width: '100%', maxWidth: 400 }}>
          {/* XP gagné */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 10, letterSpacing: 2, color: 'var(--text-muted)' }}>XP GAGNÉ</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>
              {data.score} ÷ 10 = +{xpGained}
              {xpGained >= 28 && (
                <span style={{ fontSize: 9, marginLeft: 6, color: 'var(--accent)' }}>CAP ATTEINT</span>
              )}
            </span>
          </div>

          {/* Barre XP */}
          <XPBar current={xpInLevel} max={xpNeeded} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 9, color: 'var(--primary)', fontWeight: 700 }}>
              NIVEAU {xpLevel} · {prestige.toUpperCase()}
            </span>
            <span style={{ fontSize: 9, color: 'rgba(155,89,255,0.6)' }}>
              {xpInLevel} / {xpNeeded} XP
            </span>
          </div>

          {/* Level up */}
          {leveledUp && (
            <div style={{
              ...pixelPanel('var(--accent)'),
              marginTop: 10,
              padding: '0.5rem 0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>⬆️</span>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>LEVEL UP !</p>
                <p style={{ fontSize: 10, color: 'rgba(255,215,0,0.7)', margin: 0 }}>
                  Niveau {xpLevel} débloqué
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Unlocks */}
      {unlocks.length > 0 && (
        <div style={{ width: '100%', maxWidth: 400 }}>
          <p style={{ fontSize: 8, letterSpacing: 3, color: 'var(--text-muted)', marginBottom: 8 }}>
            NOUVEAUX ITEMS DÉBLOQUÉS
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {unlocks.map(item => (
              <div key={item.id} style={{ ...pixelPanel(RARITY_COLOR[item.rarity] || '#888'), padding: '0.75rem', display: 'flex', alignItems: 'center', gap: 12 }}>
                {item.asset_url ? (
                  <img src={item.asset_url} alt={item.name} style={{ width: 44, height: 44, imageRendering: 'pixelated' }} />
                ) : (
                  <div style={{
                    width: 44, height: 44,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18,
                  }}>
                    {item.type === 'avatar' ? '👤' : item.type === 'aura' ? '✨' : item.type === 'titre' ? '📛' : '🎨'}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#fff', margin: 0 }}>{item.name}</p>
                  <p style={{ fontSize: 9, color: RARITY_COLOR[item.rarity], margin: '2px 0 0' }}>
                    {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                  </p>
                </div>
                <span style={{
                  fontSize: 8,
                  fontWeight: 700,
                  color: RARITY_COLOR[item.rarity],
                  background: `${RARITY_COLOR[item.rarity]}22`,
                  boxShadow: `0 0 0 1px ${RARITY_COLOR[item.rarity]}`,
                  padding: '2px 6px',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}>
                  {item.rarity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Boutons bas */}
      <div style={{ width: '100%', maxWidth: 400, display: 'flex', gap: 8, marginTop: 'auto', paddingTop: '1rem' }}>
        <button className="btn btn-secondary" onClick={onReplay} style={{ flex: 1, fontSize: 12, letterSpacing: 2 }}>
          REJOUER
        </button>
        <button className="btn btn-primary" onClick={onBackToHome} style={{ flex: 1, fontSize: 12, letterSpacing: 2 }}>
          ACCUEIL
        </button>
      </div>
    </div>
  );
}
