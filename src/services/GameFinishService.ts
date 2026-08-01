import { supabase } from './supabaseClient';
import { addXP } from './XPService';
import { checkUnlocks, triggerUnlock } from './UnlockService';

/**
 * Traite la fin d'une run/partie pour un joueur : upsert leaderboard, mise à
 * jour player_stats (par pseudo) + players.total_score, calcul XP + unlocks.
 * Partagé entre les endpoints de fin de partie Solo (appelés par
 * GameOverScreen) et le Multijoueur (appelé directement côté serveur par
 * GameManager dès que game.status passe à FINISHED — pas de round-trip
 * HTTP nécessaire, la donnée est déjà connue côté serveur).
 */
export async function handleGameFinish(params: {
  playerId: string;
  playerName: string;
  score: number;
  turns: number;
  mode: 'Solo Infini' | 'Solo Bot' | 'Multijoueur';
  botWin?: boolean;
  multiWin?: boolean;
  overflowCount?: number;
  overflowXpBonus?: number;
}): Promise<{
  leaderboard: { rank: number; score: number } | null;
  xp: { gained: number; total: number; level: number; leveledUp: boolean; prestige: string } | null;
  unlocks: any[];
}> {
  if (!supabase) return { leaderboard: null, xp: null, unlocks: [] };

  // 1. Leaderboard upsert
  let rank = 0;
  try {
    const { data: existing } = await supabase
      .from('leaderboard')
      .select('id, score')
      .eq('player_id', params.playerId)
      .eq('mode', params.mode)
      .single();

    if (!existing) {
      await supabase.from('leaderboard').insert({
        player_id: params.playerId,
        score: params.score,
        turns: params.turns,
        mode: params.mode,
      });
    } else if (params.score > existing.score) {
      await supabase.from('leaderboard')
        .update({ score: params.score, turns: params.turns, created_at: new Date().toISOString() })
        .eq('id', existing.id);
    }

    const { count } = await supabase
      .from('leaderboard')
      .select('*', { count: 'exact', head: true })
      .eq('mode', params.mode)
      .gt('score', params.score);
    rank = (count || 0) + 1;
  } catch { /* leaderboard non critique */ }

  // 2. Stats
  try {
    const { data: existing } = await supabase
      .from('player_stats').select('*').eq('player_name', params.playerName).single();

    const s: Record<string, any> = existing || {
      player_name: params.playerName,
      total_games: 0, total_solo_games: 0, total_bot_games: 0, total_multiplayer_games: 0,
      best_solo_score: 0, best_solo_turns: 0, best_bot_score: 0,
      total_score: 0, bot_wins: 0, bot_losses: 0,
      xp: 0, multiplayer_wins: 0, multiplayer_losses: 0, best_multiplayer_score: 0,
      overflow_count: 0,
    };

    s.total_games = (s.total_games || 0) + 1;
    s.total_score = (s.total_score || 0) + params.score;
    s.overflow_count = (s.overflow_count || 0) + (params.overflowCount || 0);

    if (params.mode === 'Solo Infini') {
      s.total_solo_games = (s.total_solo_games || 0) + 1;
      if (params.score > (s.best_solo_score || 0)) s.best_solo_score = params.score;
      if (params.turns > (s.best_solo_turns || 0)) s.best_solo_turns = params.turns;
    } else if (params.mode === 'Solo Bot') {
      s.total_bot_games = (s.total_bot_games || 0) + 1;
      if (params.score > (s.best_bot_score || 0)) s.best_bot_score = params.score;
      if (!params.botWin) s.bot_wins = (s.bot_wins || 0) + 1;
      else s.bot_losses = (s.bot_losses || 0) + 1;
    } else {
      s.total_multiplayer_games = (s.total_multiplayer_games || 0) + 1;
      if (params.score > (s.best_multiplayer_score || 0)) s.best_multiplayer_score = params.score;
      if (params.multiWin) s.multiplayer_wins = (s.multiplayer_wins || 0) + 1;
      else s.multiplayer_losses = (s.multiplayer_losses || 0) + 1;
    }

    s.updated_at = new Date().toISOString();
    await supabase.from('player_stats')
      .upsert({ ...s, player_name: params.playerName }, { onConflict: 'player_name' });
  } catch { /* stats non critique */ }

  // 3. XP (+ bonus XP non cappé si dépassement du plafond de score — CLAUDE_3.md §2.3)
  const xpResult = await addXP(params.playerId, params.score, params.overflowXpBonus || 0);

  // 4. Unlocks
  const { data: statsRow } = await supabase
    .from('player_stats')
    .select('multiplayer_wins, bot_wins, best_solo_score, overflow_count')
    .eq('player_name', params.playerName)
    .single();

  const newUnlocks = await checkUnlocks(params.playerId, xpResult.newLevel, statsRow || {});
  for (const item of newUnlocks) {
    await triggerUnlock(params.playerId, item.id);
  }

  // 5. Incrémenter total_score dans players
  const { data: pRow } = await supabase.from('players').select('total_score').eq('id', params.playerId).single();
  if (pRow) {
    try {
      await supabase.from('players')
        .update({ total_score: (pRow.total_score || 0) + params.score })
        .eq('id', params.playerId);
    } catch { /* non critique */ }
  }

  return {
    leaderboard: { rank, score: params.score },
    xp: {
      gained: xpResult.xpGained,
      total: xpResult.newXP,
      level: xpResult.newLevel,
      leveledUp: xpResult.leveledUp,
      prestige: xpResult.prestige,
    },
    unlocks: newUnlocks,
  };
}
