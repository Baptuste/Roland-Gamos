import { supabase } from './supabaseClient';

export interface CosmeticItem {
  id: string;
  type: string;
  name: string;
  asset_url: string | null;
  rarity: string;
  description: string | null;
}

interface UnlockCondition {
  level?: number;
  type?: 'multiplayer_wins' | 'bot_wins' | 'solo_score' | 'chain_length';
  value?: number;
}

interface PlayerStats {
  multiplayer_wins?: number;
  bot_wins?: number;
  best_solo_score?: number;
}

// ─────────────────────────────────────────────
// checkUnlocks — retourne les items nouvellement débloqués
// ─────────────────────────────────────────────

export async function checkUnlocks(
  playerId: string,
  newLevel: number,
  stats: PlayerStats
): Promise<CosmeticItem[]> {
  if (!supabase) return [];

  // Récupérer tous les cosmétiques non encore débloqués par ce joueur
  const { data: allCosmetics } = await supabase
    .from('cosmetics_catalog')
    .select('*')
    .neq('unlock_type', 'default');

  if (!allCosmetics?.length) return [];

  const { data: alreadyUnlocked } = await supabase
    .from('cosmetics_unlocked')
    .select('cosmetic_id')
    .eq('player_id', playerId);

  const unlockedIds = new Set((alreadyUnlocked || []).map((r: any) => r.cosmetic_id));
  const newUnlocks: CosmeticItem[] = [];

  for (const cosmetic of allCosmetics) {
    if (unlockedIds.has(cosmetic.id)) continue;

    const cond = (cosmetic.unlock_condition || {}) as UnlockCondition;
    let satisfied = false;

    if (cosmetic.unlock_type === 'level' && cond.level !== undefined) {
      satisfied = newLevel >= cond.level;
    } else if (cosmetic.unlock_type === 'challenge' && cond.type) {
      switch (cond.type) {
        case 'multiplayer_wins':
          satisfied = (stats.multiplayer_wins || 0) >= (cond.value || 0);
          break;
        case 'bot_wins':
          satisfied = (stats.bot_wins || 0) >= (cond.value || 0);
          break;
        case 'solo_score':
          satisfied = (stats.best_solo_score || 0) >= (cond.value || 0);
          break;
      }
    }

    if (satisfied) {
      newUnlocks.push({
        id: cosmetic.id,
        type: cosmetic.type,
        name: cosmetic.name,
        asset_url: cosmetic.asset_url,
        rarity: cosmetic.rarity,
        description: cosmetic.description,
      });
    }
  }

  return newUnlocks;
}

// ─────────────────────────────────────────────
// triggerUnlock — persiste les nouveaux items
// ─────────────────────────────────────────────

export async function triggerUnlock(playerId: string, cosmeticId: string): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('cosmetics_unlocked')
    .insert({ player_id: playerId, cosmetic_id: cosmeticId })
    .onConflict('player_id,cosmetic_id')
    .ignore();
}

// ─────────────────────────────────────────────
// grantDefaultCosmetics — donne les items par défaut au nouveau joueur
// ─────────────────────────────────────────────

export async function grantDefaultCosmetics(playerId: string): Promise<void> {
  if (!supabase) return;

  const { data: defaults } = await supabase
    .from('cosmetics_catalog')
    .select('id')
    .eq('is_default', true);

  if (!defaults?.length) return;

  const rows = defaults.map((d: any) => ({ player_id: playerId, cosmetic_id: d.id }));
  await supabase.from('cosmetics_unlocked').upsert(rows, { onConflict: 'player_id,cosmetic_id' });
}
