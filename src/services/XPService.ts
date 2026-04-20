import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────
// Constantes système XP / niveaux
// ─────────────────────────────────────────────

const XP_CAP_PER_GAME = 28;

// XP requis pour passer du niveau N au niveau N+1
function xpForLevel(level: number): number {
  if (level <= 10)  return 50;
  if (level <= 20)  return 100;
  if (level <= 30)  return 200;
  return 350; // niveaux 31-40
}

export function getLevelFromXP(totalXP: number): number {
  let level = 1;
  let remaining = totalXP;
  while (level < 40) {
    const needed = xpForLevel(level);
    if (remaining < needed) break;
    remaining -= needed;
    level++;
  }
  return level;
}

export function getXPForNextLevel(level: number): number {
  if (level >= 40) return 0;
  return xpForLevel(level);
}

export function getXPIntoCurrentLevel(totalXP: number): number {
  let level = 1;
  let remaining = totalXP;
  while (level < 40) {
    const needed = xpForLevel(level);
    if (remaining < needed) break;
    remaining -= needed;
    level++;
  }
  return remaining;
}

export function getPrestige(level: number): string {
  if (level <= 10) return 'Rookie';
  if (level <= 20) return 'Street';
  if (level <= 30) return 'Vétéran';
  return 'Légende';
}

// ─────────────────────────────────────────────
// addXP — persiste en base + retourne résultat
// ─────────────────────────────────────────────

export interface XPResult {
  xpGained: number;
  newXP: number;
  newLevel: number;
  leveledUp: boolean;
  prestige: string;
}

export async function addXP(playerId: string, score: number): Promise<XPResult> {
  const xpGained = Math.min(Math.floor(score / 10), XP_CAP_PER_GAME);

  if (!supabase) {
    // Pas de Supabase : retourner un résultat vide
    return { xpGained, newXP: xpGained, newLevel: 1, leveledUp: false, prestige: 'Rookie' };
  }

  const { data: player, error } = await supabase
    .from('players')
    .select('xp, level')
    .eq('id', playerId)
    .single();

  if (error || !player) {
    return { xpGained, newXP: xpGained, newLevel: 1, leveledUp: false, prestige: 'Rookie' };
  }

  const previousLevel = player.level as number;
  const newXP = (player.xp as number) + xpGained;
  const newLevel = getLevelFromXP(newXP);
  const leveledUp = newLevel > previousLevel;

  await supabase
    .from('players')
    .update({ xp: newXP, level: newLevel, last_seen_at: new Date().toISOString() })
    .eq('id', playerId);

  return {
    xpGained,
    newXP,
    newLevel,
    leveledUp,
    prestige: getPrestige(newLevel),
  };
}
