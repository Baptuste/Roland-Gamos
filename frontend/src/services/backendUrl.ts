// En production (Railway), le frontend est servi par le même serveur Express
// que l'API/WebSocket — donc une URL relative (même origine) suffit. En dev,
// le frontend (Vite, port 5173/3000) et le backend (port 3001) sont deux
// process distincts, donc il faut l'URL explicite.
export const BACKEND_URL: string =
  import.meta.env.VITE_BACKEND_URL ||
  (import.meta.env.PROD || window.location.hostname !== 'localhost'
    ? window.location.origin
    : 'http://localhost:3001');
