/**
 * Génère plusieurs candidats pour l'image de style de référence PixelLab
 * (CLAUDE_3.md §3.2) — étape critique avant toute génération en série
 * d'avatars, pour verrouiller une cohérence visuelle (palette, niveau de
 * détail, traitement des contours) entre tous les avatars futurs.
 *
 * Usage: npx ts-node src/scripts/assets/generateStyleCandidates.ts
 */
import * as dotenv from 'dotenv';
dotenv.config();
import * as fs from 'fs';
import * as path from 'path';

const PIXELLAB_API_URL = 'https://api.pixellab.ai/v2/create-image-bitforge';
const SIZE = 128;

// "buste" en tête de prompt (pas en suffixe) — c'est la structure qui a
// respecté la contrainte de cadrage lors du premier test réussi.
const STYLE_SUFFIX = ', cadrage frontal, coupé au sternum, fond transparent, palette ~16 couleurs, pas d\'anti-aliasing, contours nets, style rétro jeu vidéo 16-bit';

// Identité visuelle déjà actée (CLAUDE_1.md §7.6) : dark navy #06060f,
// or #ffd700, violet #9b59ff, rouge #ff4444 — à utiliser comme ancrage de
// palette plutôt que de laisser le modèle inventer des tons au hasard.
const PALETTE_HINT = ', palette dominante dark navy/violet/or, accents rouge et or, PAS de tons pastel ni délavés, couleurs saturées et contrastées type néon rétro';

const CANDIDATES = [
  { slug: 'candidat-neutre-2', prompt: 'buste pixel art d\'un personnage neutre stylisé, bonnet, lunettes de soleil' + STYLE_SUFFIX + PALETTE_HINT },
  { slug: 'candidat-neutre-3', prompt: 'buste pixel art d\'un personnage neutre stylisé, capuche de sweat, expression neutre' + STYLE_SUFFIX + PALETTE_HINT },
];

async function generate(slug: string, prompt: string, apiKey: string): Promise<void> {
  const response = await fetch(PIXELLAB_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: prompt,
      image_size: { width: SIZE, height: SIZE },
      no_background: true,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(`[${slug}] Échec (HTTP ${response.status}):`, text);
    return;
  }

  const data = JSON.parse(text);
  const base64 = data?.image?.base64;
  if (!base64) {
    console.error(`[${slug}] Pas d'image dans la réponse:`, JSON.stringify(data).slice(0, 500));
    return;
  }

  const outDir = path.join(__dirname, '..', '..', '..', 'tmp-pixellab-test', 'style-candidates');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${slug}.png`);
  const base64Data = base64.startsWith('data:') ? base64.split(',')[1] : base64;
  fs.writeFileSync(outPath, Buffer.from(base64Data, 'base64'));
  console.log(`[${slug}] sauvegardé -> ${outPath} (usage: ${JSON.stringify(data.usage)})`);
}

async function main() {
  const apiKey = process.env.PIXELLAB_API_KEY;
  if (!apiKey) {
    console.error('PIXELLAB_API_KEY manquante dans .env');
    process.exit(1);
  }

  for (const candidate of CANDIDATES) {
    await generate(candidate.slug, candidate.prompt, apiKey);
  }
}

main().catch((err) => {
  console.error('Erreur:', err);
  process.exit(1);
});
