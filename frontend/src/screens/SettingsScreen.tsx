import { useState } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

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
      color: 'rgba(255,255,255,0.3)',
      marginBottom: 8,
      marginTop: 20,
    }}>
      {title}
    </p>
  );

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{
      background: '#0d0020',
      border: '1px solid #2a0a40',
      borderRadius: 6,
      padding: '0.75rem 1rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
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
        height: 24,
        borderRadius: 12,
        border: 'none',
        background: disabled ? '#1a0a3a' : value ? '#9b59ff' : '#2a0a40',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        opacity: disabled ? 0.4 : 1,
        transition: 'background 0.2s',
      }}
    >
      <div style={{
        position: 'absolute',
        top: 3,
        left: value && !disabled ? 22 : 3,
        width: 18,
        height: 18,
        borderRadius: 9,
        background: '#fff',
        transition: 'left 0.2s',
      }} />
    </button>
  );

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
          PARAMÈTRES
        </h1>
      </div>

      {/* COMPTE */}
      <Section title="COMPTE" />
      <div style={{
        background: '#0d0020',
        border: '1px solid #2a0a40',
        borderRadius: 6,
        padding: '0.75rem 1rem',
        marginBottom: 6,
      }}>
        <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 6, letterSpacing: 2 }}>
          PSEUDO
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={pseudo}
            onChange={e => setPseudo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSavePseudo()}
            style={{
              flex: 1,
              background: '#06000f',
              border: '1px solid #9b59ff',
              borderRadius: 3,
              padding: '0.4rem 0.6rem',
              color: '#ffd700',
              fontSize: 13,
              outline: 'none',
            }}
          />
          <button
            onClick={handleSavePseudo}
            disabled={isSavingPseudo || !pseudo.trim() || pseudo.trim() === currentPseudo}
            style={{
              padding: '0.4rem 0.8rem',
              background: '#0d0020',
              border: '1px solid #9b59ff',
              borderRadius: 3,
              color: '#9b59ff',
              fontSize: 10,
              cursor: 'pointer',
              opacity: isSavingPseudo ? 0.5 : 1,
            }}
          >
            {isSavingPseudo ? '...' : 'OK'}
          </button>
        </div>
        {pseudoMessage && (
          <p style={{ fontSize: 10, color: '#44ff88', marginTop: 6 }}>{pseudoMessage}</p>
        )}
      </div>

      {/* AUDIO */}
      <Section title="AUDIO" />
      <Row label="Son (effets)">
        <Toggle value={soundEnabled} onChange={handleSoundToggle} />
      </Row>
      <Row label="Musique (bande son)">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>bientôt</span>
          <Toggle value={false} onChange={() => {}} disabled />
        </div>
      </Row>

      {/* NOTIFICATIONS */}
      <Section title="NOTIFICATIONS" />
      <Row label="Notifications">
        <Toggle value={notifEnabled} onChange={handleNotifToggle} />
      </Row>
      <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: -2, marginBottom: 0, paddingLeft: 4 }}>
        Invitations de parties, tours de jeu
      </p>

      {/* INFORMATIONS */}
      <Section title="INFORMATIONS" />
      <Row label="Mentions légales">
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>›</span>
      </Row>
      <Row label="Version">
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>v1.0.0</span>
      </Row>

      {/* ZONE DANGEREUSE */}
      <p style={{ fontSize: 8, letterSpacing: 3, color: '#880020', marginBottom: 8, marginTop: 20 }}>
        ZONE DANGEREUSE
      </p>
      <div style={{
        background: '#1a0008',
        border: '1px solid #3a0010',
        borderRadius: 6,
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
            <p style={{ fontSize: 12, color: '#ff4444', margin: 0, fontWeight: 600 }}>
              Supprimer le compte
            </p>
            <p style={{ fontSize: 9, color: '#880020', margin: '4px 0 0' }}>
              Action irréversible — toutes les données seront perdues
            </p>
          </button>
        ) : (
          <>
            <p style={{ fontSize: 11, color: '#ff4444', marginBottom: 10, fontWeight: 600 }}>
              Confirmer la suppression ?
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  background: '#0d0020',
                  border: '1px solid #2a0a40',
                  borderRadius: 3,
                  color: '#fff',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteAccount}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  background: '#3a0010',
                  border: '1px solid #ff4444',
                  borderRadius: 3,
                  color: '#ff4444',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Supprimer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
