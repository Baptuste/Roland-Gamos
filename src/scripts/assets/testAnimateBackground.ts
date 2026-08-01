/**
 * Test du pipeline "fond animé" PixelLab : génère une image de base (Bitforge)
 * puis l'anime via /v2/animate-with-text-v3 (image de départ + description du
 * mouvement -> séquence de frames). Sert à valider format de requête, temps de
 * job, et qualité visuelle avant de généraliser aux 5 écrans.
 *
 * Usage: npx ts-node src/scripts/assets/testAnimateBackground.ts
 */
import * as dotenv from 'dotenv';
dotenv.config();
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://api.pixellab.ai/v2';
const WIDTH = 128;
const HEIGHT = 176;
const FRAME_COUNT = 6;

const SCENE_DESCRIPTION =
  "scène pixel art de podium de victoire vu de face, trois marches dorée/argent/bronze au centre, " +
  "faisceaux de lumière dorés convergents depuis le haut, confettis colorés en suspension, silhouette " +
  "de foule en bas, ambiance de célébration nocturne, ciel bleu nuit";
const ANIMATION_ACTION = "les confettis flottent doucement et les faisceaux de lumière dorés pulsent";

async function main() {
  const apiKey = process.env.PIXELLAB_API_KEY;
  if (!apiKey) {
    console.error('PIXELLAB_API_KEY manquante dans .env');
    process.exit(1);
  }
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  console.log('1/3 — Génération de la frame de base (Bitforge)...');
  const baseRes = await fetch(`${BASE_URL}/create-image-bitforge`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      description: SCENE_DESCRIPTION,
      image_size: { width: WIDTH, height: HEIGHT },
      no_background: false,
    }),
  });
  const baseText = await baseRes.text();
  if (!baseRes.ok) {
    console.error(`Échec Bitforge (HTTP ${baseRes.status}):`, baseText.slice(0, 500));
    process.exit(1);
  }
  const baseData = JSON.parse(baseText);
  const baseBase64 = baseData?.image?.base64;
  if (!baseBase64) {
    console.error('Pas d\'image de base reçue:', JSON.stringify(baseData).slice(0, 500));
    process.exit(1);
  }
  console.log('   usage:', JSON.stringify(baseData.usage));

  const outDir = path.join(__dirname, '..', '..', '..', 'tmp-pixellab-test', 'anim-test');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'base-frame.png'), Buffer.from(baseBase64, 'base64'));
  console.log('   sauvegardé -> anim-test/base-frame.png');

  console.log('2/3 — Lancement animate-with-text-v3...');
  const animRes = await fetch(`${BASE_URL}/animate-with-text-v3`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      first_frame: { type: 'base64', base64: baseBase64 },
      action: ANIMATION_ACTION,
      frame_count: FRAME_COUNT,
    }),
  });
  const animText = await animRes.text();
  if (!animRes.ok) {
    console.error(`Échec animate-with-text-v3 (HTTP ${animRes.status}):`, animText.slice(0, 1000));
    process.exit(1);
  }
  const animData = JSON.parse(animText);
  console.log('   réponse initiale:', JSON.stringify(animData).slice(0, 300));

  let images: any[] | undefined = animData.images;
  const jobId = animData.background_job_id || animData.job_id;

  if (!images && jobId) {
    console.log(`   job en arrière-plan (${jobId}), polling...`);
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise((r) => setTimeout(r, 3000));
      const pollRes = await fetch(`${BASE_URL}/background-jobs/${jobId}`, { headers });
      const pollText = await pollRes.text();
      if (!pollRes.ok) {
        console.error(`   Échec polling (HTTP ${pollRes.status}):`, pollText.slice(0, 500));
        process.exit(1);
      }
      const pollData = JSON.parse(pollText);
      console.log(`   [${attempt + 1}] status: ${pollData.status}`);
      if (pollData.status === 'completed' || pollData.status === 'success' || pollData.images) {
        images = pollData.images || pollData.result?.images;
        break;
      }
      if (pollData.status === 'failed' || pollData.status === 'error') {
        console.error('   Job échoué:', JSON.stringify(pollData).slice(0, 500));
        process.exit(1);
      }
    }
  }

  if (!images || images.length === 0) {
    console.error('3/3 — Aucune frame reçue au final.');
    process.exit(1);
  }

  console.log(`3/3 — ${images.length} frames reçues, sauvegarde...`);
  images.forEach((img: any, i: number) => {
    const b64 = img.base64 || img;
    fs.writeFileSync(path.join(outDir, `frame-${i}.png`), Buffer.from(b64, 'base64'));
  });
  console.log(`   sauvegardées -> anim-test/frame-0.png .. frame-${images.length - 1}.png`);
}

main().catch((err) => {
  console.error('Erreur:', err);
  process.exit(1);
});
