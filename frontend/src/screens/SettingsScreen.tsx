import { useState } from 'react';
import '../styles/HomeScreen.css';

import { BACKEND_URL } from '../services/backendUrl';

interface SettingsScreenProps {
  playerId: string;
  currentPseudo: string;
  onBackToHome: () => void;
  onPseudoChange?: (newPseudo: string) => void;
}

export default function SettingsScreen({
  playerId,
  currentPseudo,
  onBackToHome,
  onPseudoChange,
}: SettingsScreenProps) {
  const [pseudo, setPseudo] = useState(currentPseudo);
  const [isSavingPseudo, setIsSavingPseudo] = useState(false);
  const [pseudoMessage, setPseudoMessage] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('roland-gamos-sound') !== 'false';
  });
  const [notifEnabled, setNotifEnabled] = useState(() => {
    return localStorage.getItem('roland-gamos-notif') === 'true';
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSavePseudo = async () => {
    const trimmed = pseudo.trim();
    if (!trimmed || trimmed === currentPseudo) return;
    setIsSavingPseudo(true);
    setPseudoMessage(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/players/${playerId}/pseudo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pseudo: trimmed }),
      });
      if (!res.ok) throw new Error('Erreur serveur');
      onPseudoChange?.(trimmed);
      setPseudoMessage('Pseudo mis à jour !');
      setTimeout(() => setPseudoMessage(null), 3000);
    } catch {
      setPseudoMessage('Erreur lors de la mise à jour.');
      setTimeout(() => setPseudoMessage(null), 3000);
    } finally {
      setIsSavingPseudo(false);
    }
  };

  const handleSoundToggle = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('roland-gamos-sound', String(next));
  };

  const handleNotifToggle = () => {
    const next = !notifEnabled;
    setNotifEnabled(next);
    localStorage.setItem('roland-gamos-notif', String(next));
  };

  const handleDeleteAccount = async () => {
    try {
      await fetch(`${BACKEND_URL}/api/players/${playerId}`, { method: 'DELETE' });
      // Nettoyer le localStorage
      localStorage.removeItem('roland-gamos-solo-uuid');
      localStorage.removeItem('roland-gamos-stats');
      localStorage.removeItem('roland-gamos-leaderboard');
      onBackToHome();
    } catch {
      alert('Erreur lors de la suppression.');
    }
  };

  const Section = ({ title }: { title: string }) => (
    <p style={{
      fontSize: 8,
      letterSpacing: 3,
      color: 'var(--text-muted)',
      marginBottom: 8,
      marginTop: 20,
      textTransform: 'uppercase',
    }}>
      {title}
    </p>
  );

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{
      background: 'linear-gradient(180deg, #1c1712 0%, #100d0a 100%)',
      boxShadow: '0 0 0 2px #0a0705, 0 0 0 4px #5a4a38, 3px 3px 0 0 rgba(0, 0, 0, 0.7)',
      padding: '0.75rem 1rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    }}>
      <span style={{ fontSize: 12, color: '#fff' }}>{label}</span>
      {children}
    </div>
  );

  const Toggle = ({ value, onChange, disabled }: { value: boolean; onChange: () => void; disabled?: boolean }) => (
    <button
      onClick={onChange}
      disabled={disabled}
      style={{
        width: 44,
        height: 22,
        border: 'none',
        background: disabled ? '#2a2620' : value ? 'var(--primary)' : '#3a332a',
        boxShadow: '0 0 0 2px #0a0705',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        opacity: disabled ? 0.4 : 1,
        transition: 'background 0.15s steps(2)',
      }}
    >
      <div style={{
        position: 'absolute',
        top: 3,
        left: value && !disabled ? 24 : 3,
        width: 16,
        height: 16,
        background: '#fff',
        boxShadow: '0 0 0 1px #0a0705',
        transition: 'left 0.15s steps(3)',
      }} />
    </button>
  );

  return (
    <div className="home-screen">
      <div className="container">
        <div className="game-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <button className="btn btn-secondary btn-back" onClick={onBackToHome}>← Retour</button>
          <h1 className="game-title" style={{ fontSize: '1.3rem', fontWeight: 700, flex: 1 }}>
            Paramètres
          </h1>
        </div>

        <div className="card fade-in">
          {/* COMPTE */}
          <Section title="Compte" />
          <div style={{
            background: 'linear-gradient(180deg, #1c1712 0%, #100d0a 100%)',
            boxShadow: '0 0 0 2px #0a0705, 0 0 0 4px #5a4a38, 3px 3px 0 0 rgba(0, 0, 0, 0.7)',
            padding: '0.75rem 1rem',
            marginBottom: 8,
          }}>
            <p style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: 2 }}>
              PSEUDO
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                value={pseudo}
                onChange={e => setPseudo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSavePseudo()}
                style={{ flex: 1, fontSize: 13, padding: '0.4rem 0.6rem' }}
              />
              <button
                className="btn btn-secondary"
                onClick={handleSavePseudo}
                disabled={isSavingPseudo || !pseudo.trim() || pseudo.trim() === currentPseudo}
                style={{ fontSize: 10, padding: '0.4rem 0.8rem', minHeight: 'auto' }}
              >
                {isSavingPseudo ? '...' : 'OK'}
              </button>
            </div>
            {pseudoMessage && (
              <p style={{ fontSize: 10, color: 'var(--success)', marginTop: 8 }}>{pseudoMessage}</p>
            )}
          </div>

          {/* AUDIO */}
          <Section title="Audio" />
          <Row label="Son (effets)">
            <Toggle value={soundEnabled} onChange={handleSoundToggle} />
          </Row>
          <Row label="Musique (bande son)">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 1 }}>bientôt</span>
              <Toggle value={false} onChange={() => {}} disabled />
            </div>
          </Row>

          {/* NOTIFICATIONS */}
          <Section title="Notifications" />
          <Row label="Notifications">
            <Toggle value={notifEnabled} onChange={handleNotifToggle} />
          </Row>
          <p style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: -2, marginBottom: 0, paddingLeft: 4 }}>
            Invitations de parties, tours de jeu
          </p>

          {/* INFORMATIONS */}
          <Section title="Informations" />
          <Row label="Mentions légales">
            <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>›</span>
          </Row>
          <Row label="Version">
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>v1.0.0</span>
          </Row>

          {/* ZONE DANGEREUSE */}
          <p style={{ fontSize: 8, letterSpacing: 3, color: 'var(--secondary)', marginBottom: 8, marginTop: 20, textTransform: 'uppercase' }}>
            Zone dangereuse
          </p>
          <div style={{
            background: 'linear-gradient(180deg, #2a0f0f 0%, #1a0808 100%)',
            boxShadow: '0 0 0 2px #0a0705, 0 0 0 4px var(--secondary), 3px 3px 0 0 rgba(0, 0, 0, 0.7)',
            padding: '0.75rem 1rem',
          }}>
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <p style={{ fontSize: 12, color: 'var(--secondary)', margin: 0, fontWeight: 600 }}>
                  Supprimer le compte
                </p>
                <p style={{ fontSize: 9, color: '#c47070', margin: '4px 0 0' }}>
                  Action irréversible — toutes les données seront perdues
                </p>
              </button>
            ) : (
              <>
                <p style={{ fontSize: 11, color: 'var(--secondary)', marginBottom: 10, fontWeight: 600 }}>
                  Confirmer la suppression ?
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowDeleteConfirm(false)}
                    style={{ flex: 1, fontSize: 11, minHeight: 'auto', padding: '0.5rem' }}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      background: 'linear-gradient(180deg, #4a1919 0% 55%, #2a0d0d 55% 100%)',
                      boxShadow: '0 0 0 2px #0a0705, 0 0 0 4px var(--secondary), 3px 3px 0 0 rgba(0, 0, 0, 0.75)',
                      border: 'none',
                      color: '#ffb8b8',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textShadow: '2px 2px 0 rgba(0,0,0,0.7)',
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
