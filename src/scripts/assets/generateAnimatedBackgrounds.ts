/**
 * Génère les fonds d'écran ANIMÉS (PixelLab Bitforge -> animate-with-text-v3)
 * pour les 4 écrans restants (Accueil, Solo Infini, Multijoueur/Lobby, Solo vs
 * Bot). "Fin de partie" est déjà généré (tmp-pixellab-test/anim-test/).
 *
 * Usage: npx ts-node src/scripts/assets/generateAnimatedBackgrounds.ts [scene]
 * (scene optionnel : accueil | solo-infini | multijoueur | solo-bot ; sinon les 4)
 */
import * as dotenv from 'dotenv';
dotenv.config();
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://api.pixellab.ai/v2';
const WIDTH = 128;
const HEIGHT = 176;
const FRAME_COUNT = 6;

const SCENES = [
  {
    slug: 'accueil',
    description:
      "vue nocturne pixel art d'une rue de Paris la nuit, immeubles haussmanniens de chaque côté avec fenêtres éclairées orange, tour Eiffel illuminée au loin au centre, lune brillante en haut à droite, ciel étoilé, deux néons verticaux violets encadrant la rue, ambiance jeu vidéo rétro",
    action: 'les étoiles scintillent doucement dans le ciel et les néons violets pulsent',
  },
  {
    slug: 'solo-infini',
    description:
      "studio d'enregistrement pixel art bleu nuit vu de face, micro sur pied éclairé par un spot jaune au centre, cabine insonorisée en fond, console de mixage avec boutons et curseurs lumineux orange au premier plan, voyant REC rouge allumé en haut à droite",
    action: 'le voyant REC clignote et les boutons lumineux de la console scintillent',
  },
  {
    slug: 'multijoueur',
    description:
      "salle de studio hip-hop pixel art vue de face, mur de briques avec enseigne néon rouge orangé 'PLANETE RAP' et logo planète, spots de plafond orange, console de mixage lumineuse en dessous, sol en parquet sombre",
    action: "l'enseigne néon grésille et clignote légèrement, les spots de plafond vacillent doucement",
  },
  {
    slug: 'solo-bot',
    description:
      "scène de battle rap pixel art façon jeu de combat, grand écran lumineux 'VS' rouge et bleu au centre en hauteur, spots de scène rouges et blancs de chaque côté, rideaux de théâtre rouges, deux pupitres en bois de chaque côté de la scène, silhouette de foule en bas",
    action: "les spots de scène balaient doucement l'écran et l'écran VS scintille légèrement",
  },
];

async function generateScene(scene: typeof SCENES[number], apiKey: string) {
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  console.log(`\n=== ${scene.slug} ===`);
  console.log('1/3 — Bitforge (frame de base)...');

  const baseRes = await fetch(`${BASE_URL}/create-image-bitforge`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      description: scene.description,
      image_size: { width: WIDTH, height: HEIGHT },
      no_background: false,
    }),
  });
  const baseText = await baseRes.text();
  if (!baseRes.ok) {
    console.error(`[${scene.slug}] Échec Bitforge (HTTP ${baseRes.status}):`, baseText.slice(0, 500));
    return;
  }
  const baseData = JSON.parse(baseText);
  const baseBase64 = baseData?.image?.base64;
  if (!baseBase64) {
    console.error(`[${scene.slug}] Pas d'image de base:`, JSON.stringify(baseData).slice(0, 500));
    return;
  }
  console.log('   usage:', JSON.stringify(baseData.usage));

  console.log('2/3 — animate-with-text-v3...');
  const animRes = await fetch(`${BASE_URL}/animate-with-text-v3`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      first_frame: { type: 'base64', base64: baseBase64 },
      action: scene.action,
      frame_count: FRAME_COUNT,
    }),
  });
  const animText = await animRes.text();
  if (!animRes.ok) {
    console.error(`[${scene.slug}] Échec animate-with-text-v3 (HTTP ${animRes.status}):`, animText.slice(0, 1000));
    return;
  }
  const animData = JSON.parse(animText);
  const jobId = animData.background_job_id;
  if (!jobId) {
    console.error(`[${scene.slug}] Pas de background_job_id:`, JSON.stringify(animData).slice(0, 500));
    return;
  }

  console.log(`   job ${jobId}, polling...`);
  let images: any[] | undefined;
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));
    const pollRes = await fetch(`${BASE_URL}/background-jobs/${jobId}`, { headers });
    const pollData = JSON.parse(await pollRes.text());
    if (pollData.status === 'completed') {
      images = pollData.last_response?.images;
      break;
    }
    if (pollData.status === 'failed' || pollData.status === 'error') {
      console.error(`[${scene.slug}] Job échoué:`, JSON.stringify(pollData).slice(0, 500));
      return;
    }
  }

  if (!images || images.length === 0) {
    console.error(`[${scene.slug}] Aucune frame reçue.`);
    return;
  }

  const outDir = path.join(__dirname, '..', '..', '..', 'tmp-pixellab-test', 'anim-' + scene.slug);
  fs.mkdirSync(outDir, { recursive: true });
  images.forEach((img: any, i: number) => {
    fs.writeFileSync(path.join(outDir, `frame-${i}.png`), Buffer.from(img.base64, 'base64'));
  });
  console.log(`3/3 — ${images.length} frames sauvegardées -> tmp-pixellab-test/anim-${scene.slug}/`);
}

async function main() {
  const apiKey = process.env.PIXELLAB_API_KEY;
  if (!apiKey) {
    console.error('PIXELLAB_API_KEY manquante dans .env');
    process.exit(1);
  }
  const filter = process.argv[2];
  const scenes = filter ? SCENES.filter((s) => s.slug === filter) : SCENES;
  for (const scene of scenes) {
    await generateScene(scene, apiKey);
  }
}

main().catch((err) => {
  console.error('Erreur:', err);
  process.exit(1);
});
