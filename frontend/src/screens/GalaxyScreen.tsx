import { useEffect, useRef, useState } from 'react';
import '../styles/HomeScreen.css';

import { BACKEND_URL } from '../services/backendUrl';

interface GalaxyScreenProps {
  playerId: string;
  onBackToHome: () => void;
}

// [id, name, listeners, category, degree]
type GalaxyArtist = [string, string, number | null, string, number];
// [indexA, indexB, weight]
type GalaxyEdge = [number, number, number];

interface Node {
  id: string;
  name: string;
  listeners: number | null;
  degree: number;
  discovered: boolean;
  x: number;
  y: number;
  z: number;
  radiusNorm: number;
}

/**
 * Carte des collaborations façon galaxie / codex : chaque artiste est une
 * étoile, position = connectivité (les hubs forment le noyau, les artistes
 * isolés se dispersent en bras spiraux), éclat = auditeurs Last.fm. Les
 * artistes jamais croisés en partie par ce joueur restent des points ternes
 * anonymes ("???") — ils s'allument définitivement une fois découverts
 * (voir handleGameFinish côté serveur, qui enregistre la découverte à la fin
 * de chaque partie Solo Infini/Bot).
 *
 * Rendu en Canvas 2D, pas SVG + filtres — un flou par étoile sur des
 * milliers d'éléments fait chuter le rendu (incident de conception du
 * 2026-08-01).
 */
export default function GalaxyScreen({ playerId, onBackToHome }: GalaxyScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ artists: number; edges: number; avgDegree: number; discovered: number } | null>(null);
  const [galaxyData, setGalaxyData] = useState<{ artists: GalaxyArtist[]; edges: GalaxyEdge[]; discoveredIds: Set<string> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${BACKEND_URL}/api/artists/galaxy`).then((r) => {
        if (!r.ok) throw new Error('Erreur serveur');
        return r.json() as Promise<{ artists: GalaxyArtist[]; edges: GalaxyEdge[] }>;
      }),
      fetch(`${BACKEND_URL}/api/players/${playerId}/discoveries`).then((r) => {
        if (!r.ok) return { discoveredIds: [] as string[] };
        return r.json() as Promise<{ discoveredIds: string[] }>;
      }).catch(() => ({ discoveredIds: [] as string[] })),
    ])
      .then(([galaxy, discoveries]) => {
        if (cancelled) return;
        const discoveredIds = new Set(discoveries.discoveredIds);
        const avgDegree = galaxy.artists.reduce((s, a) => s + a[4], 0) / galaxy.artists.length;
        setStats({
          artists: galaxy.artists.length,
          edges: galaxy.edges.length,
          avgDegree: Math.round(avgDegree * 10) / 10,
          discovered: discoveredIds.size,
        });
        setGalaxyData({ artists: galaxy.artists, edges: galaxy.edges, discoveredIds });
        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoading(false);
          setError('Impossible de charger la carte pour le moment.');
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  // Démarre le rendu Canvas une fois que le <canvas> est réellement visible
  // dans le DOM (display:block) — le lancer depuis le .then() du fetch le
  // fait pendant que le canvas est encore display:none (isLoading pas encore
  // reflété par React), ce qui donne un getBoundingClientRect() à 0×0 et donc
  // une galaxie invisible pour toujours.
  useEffect(() => {
    if (!galaxyData) return;
    const cleanup = startRender(galaxyData.artists, galaxyData.edges, galaxyData.discoveredIds);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galaxyData]);

  function startRender(
    rawArtists: GalaxyArtist[],
    rawEdges: GalaxyEdge[],
    discoveredIds: Set<string>
  ): (() => void) | undefined {
    const canvas = canvasRef.current;
    const tooltip = tooltipRef.current;
    if (!canvas || !tooltip) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const n = rawArtists.length;
    const maxDegree = Math.max(1, ...rawArtists.map((a) => a[4]));
    const maxListeners = Math.max(1, ...rawArtists.filter((a) => a[2] != null).map((a) => a[2] as number));

    // --- Layout : spirale, rayon piloté par la connectivité (hubs = noyau) ---
    const nodes: Node[] = rawArtists.map((a, i) => {
      const [id, name, listeners, , degree] = a;
      const discovered = discoveredIds.has(id);
      const degNorm = Math.log10(degree + 2) / Math.log10(maxDegree + 2);
      const radiusNorm = Math.pow(1 - degNorm, 1.4);
      const R = 60 + radiusNorm * 560;
      const seed = (i * 9301 + 49297) % 233280;
      const rnd = seed / 233280;
      const arm = i % 3;
      const angle = radiusNorm * 9.5 + arm * ((2 * Math.PI) / 3) + (rnd - 0.5) * 0.9;
      const rJit = R * (1 + (rnd - 0.5) * 0.18);
      const x = rJit * Math.cos(angle);
      const z = rJit * Math.sin(angle);
      const thickness = 40 * (1 - radiusNorm * 0.6);
      const y = (((seed * 7) % 1000) / 1000 - 0.5) * thickness;
      return { id, name, listeners, degree, discovered, x, y, z, radiusNorm };
    });

    let W = 0, H = 0, DPR = 1;
    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      DPR = Math.min(2, window.devicePixelRatio || 1);
      W = rect.width;
      H = rect.height;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      ctx!.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    window.addEventListener('resize', resize);

    let thetaY = 0.4;
    let thetaX = -0.55;
    let zoom = 1;
    let autoRotate = true;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      autoRotate = false;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerUp = () => { dragging = false; };
    const onPointerMoveDrag = (e: PointerEvent) => {
      if (!dragging) return;
      thetaY += (e.clientX - lastX) * 0.005;
      thetaX += (e.clientY - lastY) * 0.005;
      thetaX = Math.max(-1.4, Math.min(1.4, thetaX));
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom = Math.max(0.4, Math.min(3, zoom * (1 - e.deltaY * 0.001)));
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointermove', onPointerMoveDrag);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const focal = 900;
    let projected: [number, number, number, number][] = new Array(n);

    function project() {
      const cosY = Math.cos(thetaY), sinY = Math.sin(thetaY);
      const cosX = Math.cos(thetaX), sinX = Math.sin(thetaX);
      const cx = W / 2, cy = H / 2;
      for (let i = 0; i < n; i++) {
        const { x, y, z } = nodes[i];
        const x1 = x * cosY + z * sinY;
        const z1 = -x * sinY + z * cosY;
        const y2 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;
        const scale = (focal / (focal + z2)) * zoom;
        projected[i] = [cx + x1 * scale, cy + y2 * scale, scale, z2];
      }
    }

    function starColor(radiusNorm: number): [number, number, number] {
      const core: [number, number, number] = [255, 246, 216];
      const edge: [number, number, number] = [130, 110, 220];
      const t = Math.max(0, Math.min(1, radiusNorm));
      return [core[0] + (edge[0] - core[0]) * t, core[1] + (edge[1] - core[1]) * t, core[2] + (edge[2] - core[2]) * t];
    }

    let raf = 0;
    function draw() {
      if (autoRotate) thetaY += 0.0018;
      project();

      ctx!.fillStyle = 'rgba(2,2,8,0.35)';
      ctx!.fillRect(0, 0, W, H);

      ctx!.lineCap = 'round';
      for (const [i, j, w] of rawEdges) {
        const pi = projected[i], pj = projected[j];
        if (!pi || !pj) continue;
        // Un fil ne "s'allume" en doré que si au moins une des deux étoiles
        // a déjà été découverte — sinon ça donnerait un indice gratuit sur
        // l'existence d'une grosse connexion avant même la première rencontre.
        const bothUnknown = !nodes[i].discovered && !nodes[j].discovered;
        const big = w >= 30 && !bothUnknown;
        ctx!.beginPath();
        ctx!.moveTo(pi[0], pi[1]);
        ctx!.lineTo(pj[0], pj[1]);
        if (big) {
          ctx!.strokeStyle = 'rgba(255,215,0,0.55)';
          ctx!.lineWidth = Math.min(2.2, 0.5 + Math.sqrt(w) * 0.14);
        } else {
          ctx!.strokeStyle = 'rgba(180,190,230,0.05)';
          ctx!.lineWidth = 0.4;
        }
        ctx!.stroke();
      }

      const order = projected.map((_, i) => i).sort((a, b) => projected[b][3] - projected[a][3]);
      for (const i of order) {
        const p = projected[i];
        if (!p) continue;
        const node = nodes[i];

        if (!node.discovered) {
          // Étoile pas encore rencontrée en partie : point terne uniforme,
          // aucune info (taille/couleur) qui trahirait qui c'est.
          const r = 1.6 * p[2];
          if (r < 0.1 || p[0] < -20 || p[0] > W + 20 || p[1] < -20 || p[1] > H + 20) continue;
          ctx!.beginPath();
          ctx!.arc(p[0], p[1], r, 0, Math.PI * 2);
          ctx!.fillStyle = 'rgba(90,96,120,0.5)';
          ctx!.fill();
          continue;
        }

        const v = node.listeners == null ? 0.15 : Math.log10(node.listeners + 1) / Math.log10(maxListeners + 1);
        const r = (1.1 + v * 3.6) * p[2];
        if (r < 0.15 || p[0] < -20 || p[0] > W + 20 || p[1] < -20 || p[1] > H + 20) continue;
        const [cr, cg, cb] = starColor(node.radiusNorm);

        if (v > 0.3) {
          ctx!.beginPath();
          ctx!.arc(p[0], p[1], r * 2.4, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${(v * 0.18).toFixed(2)})`;
          ctx!.fill();
        }
        ctx!.beginPath();
        ctx!.arc(p[0], p[1], r, 0, Math.PI * 2);
        ctx!.fillStyle = node.listeners == null ? 'rgba(120,128,160,0.55)' : `rgba(${cr | 0},${cg | 0},${cb | 0},0.95)`;
        ctx!.fill();
      }

      raf = requestAnimationFrame(draw);
    }

    const onPointerMoveTooltip = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      let best = -1, bestD = 12;
      for (let i = 0; i < projected.length; i++) {
        const p = projected[i];
        if (!p) continue;
        const d = Math.hypot(p[0] - mx, p[1] - my);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best >= 0) {
        const node = nodes[best];
        tooltip.style.display = 'block';
        tooltip.style.left = mx + 14 + 'px';
        tooltip.style.top = my + 10 + 'px';
        if (node.discovered) {
          tooltip.innerHTML = `<b>${node.name}</b><br>${node.listeners == null ? 'pas de donnée' : node.listeners.toLocaleString('fr-FR') + ' auditeurs'} · ${node.degree} collaborateurs`;
        } else {
          tooltip.innerHTML = `<b>???</b><br>Pas encore croisé en partie`;
        }
      } else {
        tooltip.style.display = 'none';
      }
    };
    canvas.addEventListener('pointermove', onPointerMoveTooltip);
    const onPointerLeave = () => { tooltip.style.display = 'none'; };
    canvas.addEventListener('pointerleave', onPointerLeave);

    resize();
    draw();

    // Nettoyage si le composant démonte pendant l'animation
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMoveDrag);
      canvas.removeEventListener('pointermove', onPointerMoveTooltip);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('wheel', onWheel);
    };
  }

  return (
    <div className="home-screen">
      <div className="container">
        <div className="game-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <button className="btn btn-secondary btn-back" onClick={onBackToHome}>← Retour</button>
          <h1 className="game-title" style={{ fontSize: '1.3rem', fontWeight: 700, flex: 1 }}>
            Galaxie des artistes
          </h1>
        </div>

        {stats && (
          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{
              flex: '1 1 140px',
              background: 'linear-gradient(180deg, #1c1712 0%, #100d0a 100%)',
              boxShadow: '0 0 0 2px #0a0705, 0 0 0 4px var(--accent), 3px 3px 0 0 rgba(0,0,0,0.7)',
              padding: '0.6rem 0.8rem',
            }}>
              <p style={{ fontSize: 8, letterSpacing: 2, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Découvertes</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', margin: 0 }}>
                {stats.discovered.toLocaleString('fr-FR')} <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>/ {stats.artists.toLocaleString('fr-FR')}</span>
              </p>
            </div>
            <div style={{
              flex: '1 1 140px',
              background: 'linear-gradient(180deg, #1c1712 0%, #100d0a 100%)',
              boxShadow: '0 0 0 2px #0a0705, 0 0 0 4px #5a4a38, 3px 3px 0 0 rgba(0,0,0,0.7)',
              padding: '0.6rem 0.8rem',
            }}>
              <p style={{ fontSize: 8, letterSpacing: 2, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Fils affichés</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>{stats.edges.toLocaleString('fr-FR')}</p>
            </div>
            <div style={{
              flex: '1 1 140px',
              background: 'linear-gradient(180deg, #1c1712 0%, #100d0a 100%)',
              boxShadow: '0 0 0 2px #0a0705, 0 0 0 4px #5a4a38, 3px 3px 0 0 rgba(0,0,0,0.7)',
              padding: '0.6rem 0.8rem',
            }}>
              <p style={{ fontSize: 8, letterSpacing: 2, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Degré moyen</p>
              <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{stats.avgDegree}</p>
            </div>
          </div>
        )}

        <div className="card fade-in" style={{ padding: '0.5rem', position: 'relative' }}>
          {isLoading && (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <p style={{ color: 'var(--primary)', fontSize: 11, letterSpacing: 2 }}>CHARGEMENT DE LA GALAXIE...</p>
            </div>
          )}
          {error && (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <p style={{ color: 'var(--secondary)', fontSize: 12 }}>{error}</p>
            </div>
          )}
          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              height: 520,
              display: isLoading || error ? 'none' : 'block',
              borderRadius: 6,
              touchAction: 'none',
              cursor: 'grab',
            }}
          />
          <div
            ref={tooltipRef}
            style={{
              position: 'absolute',
              display: 'none',
              pointerEvents: 'none',
              background: 'rgba(13,0,32,0.95)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '0.4rem 0.6rem',
              fontSize: 11,
              color: 'var(--text)',
              whiteSpace: 'nowrap',
              zIndex: 2,
            }}
          />
          {!isLoading && !error && (
            <p style={{ position: 'absolute', bottom: '0.6rem', left: '1.2rem', fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>
              glisser = tourner · molette = zoom · survol = détail
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
