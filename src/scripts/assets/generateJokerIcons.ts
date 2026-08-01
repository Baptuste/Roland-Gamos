/**
 * Génère un jeton/icône pixel art pour chacun des 6 jokers (CLAUDE_3.md §7.2),
 * pour remplacer les emoji/texte placeholder actuels dans l'UI (JOKER_SHORT
 * dans MultiplayerGameScreen.tsx/MultiplayerHomeScreen.tsx).
 *
 * Icônes = objets/symboles simples, pas des bustes de personnage — prompt
 * différent de celui utilisé pour les avatars (buste pixel art d'un...).
 *
 * Usage: npx ts-node src/scripts/assets/generateJokerIcons.ts [taille]
 */
import * as dotenv from 'dotenv';
dotenv.config();
import * as fs from 'fs';
import * as path from 'path';

const PIXELLAB_API_URL = 'https://api.pixellab.ai/v2/create-image-bitforge';

// Pas de palette globale partagée ici — chaque joker a sa propre couleur
// thématique définie dans son prompt (le "or" partagé précédent biaisait
// toutes les icônes vers le jaune, cf. retour utilisateur).
const ICON_STYLE_SUFFIX = ', icône de jeu vidéo style token/badge, objet seul centré qui remplit presque tout le cadre (gros plan serré, pas de petit objet perdu au milieu d\'un fond vide), cadrage carré serré, fond transparent, pixel art ~16 couleurs, contours nets, pas d\'anti-aliasing';

const JOKERS = [
  { slug: 'combo', prompt: 'icône pixel art d\'un gant de boxe rouge vu de face qui frappe vers l\'avant, avec un impact en étoile jaune derrière, style comic/pow' + ICON_STYLE_SUFFIX },
  { slug: 'bouclier', prompt: 'icône pixel art d\'un bouclier héraldique pointu en bas (forme classique de blason), bordure argentée épaisse, centre bleu acier uni' + ICON_STYLE_SUFFIX },
  { slug: 'archives', prompt: 'icône pixel art d\'un livre ancien fermé, couverture marron cuir avec fermoir en laiton' + ICON_STYLE_SUFFIX },
];

async function generate(slug: string, prompt: string, size: number, apiKey: string): Promise<void> {
  const response = await fetch(PIXELLAB_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: prompt,
      image_size: { width: size, height: size },
      no_background: true,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(`[${slug}] Échec (HTTP ${response.status}):`, text.slice(0, 500));
    return;
  }

  const data = JSON.parse(text);
  const base64 = data?.image?.base64;
  if (!base64) {
    console.error(`[${slug}] Pas d'image dans la réponse:`, JSON.stringify(data).slice(0, 500));
    return;
  }

  const outDir = path.join(__dirname, '..', '..', '..', 'tmp-pixellab-test', 'joker-icons');
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

  const size = Number(process.argv[2]) || 64;

  for (const joker of JOKERS) {
    await generate(joker.slug, joker.prompt, size, apiKey);
  }
}

main().catch((err) => {
  console.error('Erreur:', err);
  process.exit(1);
});
