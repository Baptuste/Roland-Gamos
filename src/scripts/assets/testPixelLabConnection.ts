/**
 * Test de connexion à l'API PixelLab (endpoint Bitforge), avant de construire
 * le pipeline complet de génération d'avatars (CLAUDE_3.md §3.2).
 *
 * Résolution 128×128 retenue (2026-07-31) après comparaison empirique :
 * 64×64 = correct mais peu détaillé, 128×128 = point idéal (détail net,
 * cohérent), 200×200 (max de l'endpoint) = dégradé (le modèle perd la
 * cohérence du sujet, effet de collage/têtes dupliquées).
 *
 * La doc publique (https://api.pixellab.ai/v2/openapi.json) ne détaille pas
 * tous les champs (ex: aucun paramètre "style_strength" trouvé dans le schéma
 * exposé — à vérifier empiriquement si besoin le jour où une image de style
 * de référence sera utilisée).
 *
 * Usage: npm run pixellab:test [taille]  (défaut 128)
 * Prérequis: .env avec PIXELLAB_API_KEY.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';

const PIXELLAB_API_URL = 'https://api.pixellab.ai/v2/create-image-bitforge';
const DEFAULT_SIZE = 128;

async function main() {
  const apiKey = process.env.PIXELLAB_API_KEY;
  if (!apiKey) {
    console.error('PIXELLAB_API_KEY manquante dans .env');
    process.exit(1);
  }

  const size = Number(process.argv[2]) || DEFAULT_SIZE;
  console.log(`Appel de test PixelLab Bitforge (buste pixel art ${size}x${size}, fond transparent)...`);

  const response = await fetch(PIXELLAB_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      description: 'buste pixel art d\'un rappeur avec casquette, cadrage frontal, style rétro 16 couleurs',
      image_size: { width: size, height: size },
      no_background: true,
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    console.error(`Échec (HTTP ${response.status}):`);
    console.error(text);
    process.exit(1);
  }

  const data = JSON.parse(text);
  console.log('usage:', data.usage);

  const base64 = data?.image?.base64;
  if (!base64) {
    console.error('Pas de champ image.base64 dans la réponse — forme réelle:');
    console.error(JSON.stringify(data, null, 2).slice(0, 2000));
    process.exit(1);
  }

  const outDir = path.join(__dirname, '..', '..', '..', 'tmp-pixellab-test');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `test-avatar-${size}.png`);
  const base64Data = base64.startsWith('data:') ? base64.split(',')[1] : base64;
  fs.writeFileSync(outPath, Buffer.from(base64Data, 'base64'));

  console.log(`Connexion PixelLab OK. Image sauvegardée: ${outPath}`);
}

main().catch((err) => {
  console.error('Erreur:', err);
  process.exit(1);
});
