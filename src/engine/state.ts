import { type Card, rng, shuffledDeck } from './cards.ts';

export interface Rules {
  nertsSize: number;      // 13
  workPiles: number;      // 4
  flipCount: number;      // 3
  nertsPenalty: number;   // 2 per card left
  houseRules: boolean;    // allow cheat moves (grandma mode)
  challengePenalty: number; // points lost by cheater when caught
  falseChallengePenalty: number; // points lost by challenger when pile is clean
  targetScore: number;    // 100
  stallRule: 'end' | 'rotate'; // rotate: everyone moves 1 stock card top→bottom and play resumes
}

export const DEFAULT_RULES: Rules = {
  nertsSize: 13, workPiles: 4, flipCount: 3, nertsPenalty: 2,
  houseRules: false, challengePenalty: 5, falseChallengePenalty: 2, targetScore: 100, stallRule: 'rotate',
};

export interface PlayerState {
  id: string;
  name: string;
  nerts: Card[];        // top = last
  work: Card[][];       // each pile: bottom..top
  stock: Card[];        // top = last (next to flip)
  waste: Card[];        // top = last (playable)
  calledNerts: boolean;
  penalty: number;      // accumulated this round (challenges)
  score: number;        // cumulative across rounds
  bot: boolean;
}

export interface Foundation {
  cards: Card[];        // bottom(A)..top
  suit: number;
  dirty: boolean;       // contains a cheat (a rank gap) — only used in houseRules
  at: number;           // ring position on the table, in seat units (placer's seat by default)
  owner: number;        // who placed the ace
  mess: number;         // 0..1 legibility damage from whoever slammed last (bots read it with error)
}

export interface GameState {
  seed: number;
  round: number;
  rules: Rules;
  players: PlayerState[];
  foundations: Foundation[];
  over: boolean;           // round over
  caller: number;          // who called nerts (-1 none)
  t: number;               // ms since round start (engine time, set by driver)
  seq: number;             // move counter
}

export type Move =
  | { k: 'N2F'; f: number; at?: number }          // nerts top → foundation (f=-1 ⇒ new ace pile, placed at ring pos `at`)
  | { k: 'N2W'; w: number }                       // nerts top → work pile
  | { k: 'W2F'; w: number; f: number; at?: number } // work top → foundation
  | { k: 'W2W'; from: number; n: number; to: number } // run of n cards
  | { k: 'S2F'; f: number; at?: number }          // waste top → foundation
  | { k: 'S2W'; w: number }                       // waste top → work
  | { k: 'FLIP'; n?: number }                     // flip stock→waste (n≠flipCount is a cheat under houseRules)
  | { k: 'NERTS' }                                // call it
  | { k: 'CHALLENGE'; f: number }                 // inspect+challenge a foundation pile
  | { k: 'ROTATE' };                              // stall resolution: each player's stock top → bottom (driver-issued)

export function deal(seed: number, players: Pick<PlayerState, 'id' | 'name' | 'bot'>[], rules = DEFAULT_RULES, round = 0, prevScores?: number[]): GameState {
  const rand = rng(seed + round * 7919);
  return {
    seed, round, rules, foundations: [], over: false, caller: -1, t: 0, seq: 0,
    players: players.map((p, i) => {
      const d = shuffledDeck(i, rand);
      const nerts = d.splice(0, rules.nertsSize);
      const work: Card[][] = [];
      for (let w = 0; w < rules.workPiles; w++) work.push([d.pop()!]);
      return { id: p.id, name: p.name, bot: p.bot, nerts, work, stock: d, waste: [], calledNerts: false, penalty: 0, score: prevScores?.[i] ?? 0 };
    }),
  };
}

export function clone(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s));
}
