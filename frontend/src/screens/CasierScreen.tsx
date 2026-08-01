import { useState, useEffect } from 'react';
import '../styles/HomeScreen.css';

import { BACKEND_URL } from '../services/backendUrl';

interface CosmeticItem {
  id: string;
  type: 'avatar' | 'aura' | 'cadre' | 'effet_entree' | 'effet_validation' | 'titre';
  name: string;
  asset_url: string | null;
  rarity: 'neutre' | 'or' | 'platine' | 'diamant' | 'plutonium';
  description: string | null;
}

interface CasierScreenProps {
  playerId: string;
  playerName: string;
  onBackToHome: () => void;
}

const RARITY_COLOR: Record<string, string> = {
  neutre: '#888888',
  or: '#ffd700',
  platine: '#b0c4de',
  diamant: '#7fffd4',
  plutonium: '#cc44ff',
};

const TYPE_ICON: Record<CosmeticItem['type'], string> = {
  avatar: '👤',
  aura: '✨',
  cadre: '🖼️',
  effet_entree: '🎬',
  effet_validation: '✅',
  titre: '📛',
};

const TYPE_LABEL: Record<CosmeticItem['type'], string> = {
  avatar: 'Avatars',
  aura: 'Auras',
  cadre: 'Cadres',
  effet_entree: "Effets d'entrée",
  effet_validation: 'Effets de validation',
  titre: 'Titres',
};

const TYPE_ORDER: CosmeticItem['type'][] = ['avatar', 'cadre', 'aura', 'effet_entree', 'effet_validation', 'titre'];

export default function CasierScreen({ playerId, playerName, onBackToHome }: CasierScreenProps) {
  const [items, setItems] = useState<CosmeticItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/players/${playerId}/profile`)
      .then(r => r.json())
      .then(d => setItems(d.unlocked || []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [playerId]);

  const grouped = TYPE_ORDER.map(type => ({
    type,
    items: items.filter(item => item.type === type),
  })).filter(group => group.items.length > 0);

  return (
    <div className="home-screen">
      <div className="container">
        <div className="game-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <button className="btn btn-secondary btn-back" onClick={onBackToHome}>← Retour</button>
          <h1 className="game-title" style={{ fontSize: '1.5rem', fontWeight: 700, flex: 1 }}>
            Casier{playerName ? ` — ${playerName}` : ''}
          </h1>
        </div>

        <div className="card fade-in">
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <p style={{ color: 'var(--text-muted)' }}>Chargement...</p>
            </div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                Casier vide pour le moment.
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                Jouez des parties pour débloquer des cosmétiques !
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
              {grouped.map(({ type, items: groupItems }) => (
                <div key={type}>
                  <p style={{
                    fontSize: 9,
                    letterSpacing: 3,
                    color: 'var(--text-muted)',
                    marginBottom: '0.75rem',
                    textTransform: 'uppercase',
                  }}>
                    {TYPE_ICON[type]} {TYPE_LABEL[type]} ({groupItems.length})
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.6rem' }}>
                    {groupItems.map(item => {
                      const color = RARITY_COLOR[item.rarity] || '#888';
                      return (
                        <div
                          key={item.id}
                          style={{
                            background: 'linear-gradient(180deg, #1c1712 0%, #100d0a 100%)',
                            boxShadow: `0 0 0 2px #0a0705, 0 0 0 4px ${color}, 4px 4px 0 0 rgba(0, 0, 0, 0.7)`,
                            padding: '0.6rem 0.5rem',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            textAlign: 'center',
                            gap: '0.4rem',
                          }}
                        >
                          {item.asset_url ? (
                            <img
                              src={item.asset_url}
                              alt={item.name}
                              style={{ width: 40, height: 40, imageRendering: 'pixelated' }}
                            />
                          ) : (
                            <div style={{
                              width: 40, height: 40,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 20,
                            }}>
                              {TYPE_ICON[item.type]}
                            </div>
                          )}
                          <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--text)', margin: 0, lineHeight: 1.3 }}>
                            {item.name}
                          </p>
                          <span style={{
                            fontSize: 7,
                            fontWeight: 700,
                            color,
                            letterSpacing: 1,
                            textTransform: 'uppercase',
                          }}>
                            {item.rarity}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
