/**
 * Teste le paramètre style_image de l'endpoint Bitforge : envoie une image de
 * référence (candidat 2) + une description d'un AUTRE personnage, pour
 * vérifier si le style/palette de la référence est bien appliqué (plutôt que
 * de décrire la palette en texte, qui s'est révélé peu fiable — voir
 * CLAUDE_3.md §3.2).
 *
 * Usage: npx ts-node src/scripts/assets/testStyleImage.ts
 */
import * as dotenv from 'dotenv';
dotenv.config();
import * as fs from 'fs';
import * as path from 'path';

const PIXELLAB_API_URL = 'https://api.pixellab.ai/v2/create-image-bitforge';
const SIZE = 128;

async function main() {
  const apiKey = process.env.PIXELLAB_API_KEY;
  if (!apiKey) {
    console.error('PIXELLAB_API_KEY manquante dans .env');
    process.exit(1);
  }

  const refPath = path.join(__dirname, '..', '..', '..', 'tmp-pixellab-test', 'style-candidates', 'candidat-neutre-2.png');
  const refBase64 = fs.readFileSync(refPath).toString('base64');

  const body = {
    description: "buste pixel art d'un personnage neutre stylisé, casquette et veste, cadrage frontal, coupé au sternum",
    image_size: { width: SIZE, height: SIZE },
    no_background: true,
    style_image: { type: 'base64', base64: refBase64 },
  };

  const response = await fetch(PIXELLAB_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(`Échec (HTTP ${response.status}):`);
    console.error(text.slice(0, 2000));
    process.exit(1);
  }

  const data = JSON.parse(text);
  console.log('usage:', data.usage);
  const base64 = data?.image?.base64;
  if (!base64) {
    console.error('Pas de champ image.base64:', JSON.stringify(data).slice(0, 500));
    process.exit(1);
  }

  const outDir = path.join(__dirname, '..', '..', '..', 'tmp-pixellab-test');
  const outPath = path.join(outDir, 'test-style-image-result.png');
  const base64Data = base64.startsWith('data:') ? base64.split(',')[1] : base64;
  fs.writeFileSync(outPath, Buffer.from(base64Data, 'base64'));
  console.log(`Sauvegardé: ${outPath}`);
}

main().catch((err) => {
  console.error('Erreur:', err);
  process.exit(1);
});
