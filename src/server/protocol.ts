import type { BotEvent } from '../bots/bot.ts';
import type { Result } from '../engine/rules.ts';
import type { Foundation, GameState, Move, Rules } from '../engine/state.ts';

export interface PlayerView {
  id: string; name: string; bot: boolean;
  nerts: number[]; nertsCount: number;
  work: number[][];
  stock: number[]; stockCount: number;
  waste: number[]; wasteCount: number;
  calledNerts: boolean; penalty: number; score: number;
}
export interface GameView {
  seed: number; round: number; rules: Rules; players: PlayerView[]; foundations: Foundation[];
  over: boolean; caller: number; t: number; seq: number;
}
export interface RoundRow { round: number; scores: number[]; totals: number[]; caller: number; names: string[]; durMs: number }
export interface SeatInfo { name: string; bot: boolean; preset?: string; connected: boolean }

export type ClientMsg =
  | { t: 'join'; room: string; name: string; spectate?: boolean }
  | { t: 'addBot'; preset: string; overrides?: Record<string, number> }
  | { t: 'removeBot'; seat: number }
  | { t: 'start'; rules?: Partial<Rules>; seed?: number }
  | { t: 'move'; m: Move; clientMs?: number }
  | { t: 'next' };

export type ServerMsg =
  | { t: 'hello'; you: number; room: string }
  | { t: 'lobby'; seats: SeatInfo[]; host: number }
  | { t: 'state'; s: GameView; now: number }
  | { t: 'applied'; p: number; m: Move; r: Result; seq: number }
  | { t: 'event'; e: BotEvent }
  | { t: 'round'; roundScores: number[]; totals: number[]; caller: number; gameOver: boolean }
  | { t: 'history'; rows: RoundRow[] }
  | { t: 'error'; msg: string };

/** What player `me` is allowed to see. me=-1 ⇒ spectator (sees everything; used by the stats panel). */
export function redact(s: GameState, me: number): GameView {
  return {
    seed: s.seed, round: s.round, rules: s.rules, foundations: s.foundations, over: s.over, caller: s.caller, t: s.t, seq: s.seq,
    players: s.players.map((P, i) => {
      const mine = i === me || me === -1 || s.over;
      return {
        id: P.id, name: P.name, bot: P.bot, calledNerts: P.calledNerts, penalty: P.penalty, score: P.score,
        nerts: mine ? P.nerts : P.nerts.slice(-1), nertsCount: P.nerts.length,
        work: P.work,
        stock: mine ? P.stock : [], stockCount: P.stock.length,
        waste: mine ? P.waste : P.waste.slice(-3), wasteCount: P.waste.length,
      };
    }),
  };
}
