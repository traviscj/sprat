import { type Card, deckOf, isRed, rankOf, suitOf } from './cards.ts';
import type { Foundation, GameState, Move, PlayerState } from './state.ts';

export type Reject = { ok: false; why: string };
export type Applied = {
  ok: true;
  cheat?: 'skip' | 'miscount';   // only under houseRules
  challenge?: { f: number; caught: boolean; returned: Card[] };
  roundOver?: boolean;
};
export type Result = Reject | Applied;

const top = <T>(a: T[]): T | undefined => a[a.length - 1];

export function canFoundation(c: Card, f: Foundation | undefined): boolean {
  if (!f) return rankOf(c) === 1;
  if (f.cards.length >= 13) return false;
  const t = top(f.cards)!;
  return suitOf(c) === f.suit && rankOf(c) === rankOf(t) + 1;
}
/** house-rules variant: same suit, higher rank, gap ≤ 2 (grandma skips the 2, maybe the 3). */
export function canFoundationCheat(c: Card, f: Foundation | undefined): boolean {
  if (!f || f.cards.length >= 13) return false;
  const t = top(f.cards)!;
  const gap = rankOf(c) - rankOf(t);
  return suitOf(c) === f.suit && gap >= 2 && gap <= 3;
}
export function canWork(c: Card, pile: Card[]): boolean {
  if (pile.length === 0) return true;
  const t = top(pile)!;
  return isRed(c) !== isRed(t) && rankOf(c) === rankOf(t) - 1;
}

/** Find a foundation index that accepts c; -1 if an ace (new pile); undefined if none. */
export function findFoundation(s: GameState, c: Card): number | -1 | undefined {
  if (rankOf(c) === 1) return -1;
  for (let i = 0; i < s.foundations.length; i++) if (canFoundation(c, s.foundations[i])) return i;
  return undefined;
}

export function legalMoves(s: GameState, p: number): Move[] {
  const P = s.players[p];
  const out: Move[] = [];
  if (s.over) return out;
  const foundationTargets = (c: Card): number[] => {
    if (rankOf(c) === 1) return [-1];
    const r: number[] = [];
    s.foundations.forEach((f, i) => { if (canFoundation(c, f)) r.push(i); });
    return r;
  };
  const n = top(P.nerts);
  if (n !== undefined) {
    for (const f of foundationTargets(n)) out.push({ k: 'N2F', f });
    P.work.forEach((w, i) => { if (canWork(n, w)) out.push({ k: 'N2W', w: i }); });
  }
  const w0 = top(P.waste);
  if (w0 !== undefined) {
    for (const f of foundationTargets(w0)) out.push({ k: 'S2F', f });
    P.work.forEach((w, i) => { if (canWork(w0, w)) out.push({ k: 'S2W', w: i }); });
  }
  P.work.forEach((w, i) => {
    const t = top(w);
    if (t === undefined) return;
    for (const f of foundationTargets(t)) out.push({ k: 'W2F', w: i, f });
    for (let n = 1; n <= w.length; n++) {
      const bottom = w[w.length - n];
      P.work.forEach((w2, j) => {
        if (j === i) return;
        if (n === w.length && w2.length === 0) return; // pointless whole-pile shuffle
        if (canWork(bottom, w2)) out.push({ k: 'W2W', from: i, n, to: j });
      });
    }
  });
  if (P.stock.length || P.waste.length) out.push({ k: 'FLIP' });
  if (P.nerts.length === 0 && !P.calledNerts) out.push({ k: 'NERTS' });
  return out;
}

function pushFoundation(s: GameState, c: Card, f: number, p: number, at?: number): number {
  if (f === -1) { s.foundations.push({ cards: [c], suit: suitOf(c), dirty: false, mess: 0, at: at ?? p, owner: p }); return s.foundations.length - 1; }
  s.foundations[f].cards.push(c);
  return f;
}

/** Mutating apply. Validates; on reject state is untouched. */
export function apply(s: GameState, p: number, m: Move): Result {
  if (s.over) return { ok: false, why: 'round over' };
  const P = s.players[p];
  const house = s.rules.houseRules;
  const F = (f: number) => (f === -1 ? undefined : s.foundations[f]);
  const fCheck = (c: Card, f: number): { ok: boolean; cheat?: 'skip' } => {
    if (f !== -1 && !s.foundations[f]) return { ok: false };
    if (canFoundation(c, F(f))) return { ok: true };
    if (house && canFoundationCheat(c, F(f))) return { ok: true, cheat: 'skip' };
    return { ok: false };
  };
  let cheat: Applied['cheat'];
  switch (m.k) {
    case 'N2F': {
      const c = top(P.nerts); if (c === undefined) return { ok: false, why: 'nerts empty' };
      const r = fCheck(c, m.f); if (!r.ok) return { ok: false, why: 'foundation refuses' };
      P.nerts.pop(); const fi = pushFoundation(s, c, m.f, p, m.at); if (r.cheat) { cheat = r.cheat; s.foundations[fi].dirty = true; }
      break;
    }
    case 'N2W': {
      const c = top(P.nerts); if (c === undefined) return { ok: false, why: 'nerts empty' };
      if (!P.work[m.w] || !canWork(c, P.work[m.w])) return { ok: false, why: 'work refuses' };
      P.nerts.pop(); P.work[m.w].push(c); break;
    }
    case 'S2F': {
      const c = top(P.waste); if (c === undefined) return { ok: false, why: 'waste empty' };
      const r = fCheck(c, m.f); if (!r.ok) return { ok: false, why: 'foundation refuses' };
      P.waste.pop(); const fi = pushFoundation(s, c, m.f, p, m.at); if (r.cheat) { cheat = r.cheat; s.foundations[fi].dirty = true; }
      break;
    }
    case 'S2W': {
      const c = top(P.waste); if (c === undefined) return { ok: false, why: 'waste empty' };
      if (!P.work[m.w] || !canWork(c, P.work[m.w])) return { ok: false, why: 'work refuses' };
      P.waste.pop(); P.work[m.w].push(c); break;
    }
    case 'W2F': {
      const c = top(P.work[m.w] ?? []); if (c === undefined) return { ok: false, why: 'work empty' };
      const r = fCheck(c, m.f); if (!r.ok) return { ok: false, why: 'foundation refuses' };
      P.work[m.w].pop(); const fi = pushFoundation(s, c, m.f, p, m.at); if (r.cheat) { cheat = r.cheat; s.foundations[fi].dirty = true; }
      break;
    }
    case 'W2W': {
      const from = P.work[m.from], to = P.work[m.to];
      if (!from || !to || m.from === m.to) return { ok: false, why: 'bad pile' };
      if (m.n < 1 || m.n > from.length) return { ok: false, why: 'bad run' };
      const run = from.slice(from.length - m.n);
      if (!canWork(run[0], to)) return { ok: false, why: 'work refuses' };
      from.length -= m.n; to.push(...run); break;
    }
    case 'FLIP': {
      const n = m.n ?? s.rules.flipCount;
      if (n !== s.rules.flipCount) { if (!house) return { ok: false, why: 'bad flip count' }; cheat = 'miscount'; }
      if (P.stock.length === 0) {
        if (P.waste.length === 0) return { ok: false, why: 'nothing to flip' };
        P.stock = P.waste.reverse(); P.waste = [];
      }
      const k = Math.min(n, P.stock.length);
      for (let i = 0; i < k; i++) P.waste.push(P.stock.pop()!);
      break;
    }
    case 'NERTS': {
      if (P.nerts.length) return { ok: false, why: 'nerts not empty' };
      P.calledNerts = true; s.over = true; s.caller = p; s.seq++;
      return { ok: true, roundOver: true };
    }
    case 'ROTATE': {
      for (const Q of s.players) { if (Q.stock.length === 0) { Q.stock = Q.waste.reverse(); Q.waste = []; } if (Q.stock.length) Q.stock.unshift(Q.stock.pop()!); }
      break;
    }
    case 'CHALLENGE': {
      if (!house) return { ok: false, why: 'no house rules' };
      const f = s.foundations[m.f]; if (!f) return { ok: false, why: 'no such pile' };
      s.seq++;
      if (!f.dirty) { P.penalty += s.rules.falseChallengePenalty; return { ok: true, challenge: { f: m.f, caught: false, returned: [] } }; }
      // unwind to last clean card; return the rest to owners' waste tops; cheater(s) penalised
      let i = 1; while (i < f.cards.length && rankOf(f.cards[i]) === rankOf(f.cards[i - 1]) + 1) i++;
      const returned = f.cards.splice(i);
      f.dirty = false;
      const blamed = new Set<number>();
      returned.forEach((c, j) => { const o = deckOf(c); s.players[o].waste.push(c); if (j === 0) blamed.add(o); });
      for (const o of blamed) s.players[o].penalty += s.rules.challengePenalty;
      return { ok: true, challenge: { f: m.f, caught: true, returned } };
    }
  }
  s.seq++;
  return { ok: true, cheat };
}

export function roundScores(s: GameState): number[] {
  const sc = s.players.map(() => 0);
  for (const f of s.foundations) for (const c of f.cards) sc[deckOf(c)]++;
  s.players.forEach((P, i) => { sc[i] -= P.nerts.length * s.rules.nertsPenalty + P.penalty; });
  return sc;
}

export const isStuck = (s: GameState, p: number) => legalMoves(s, p).every(m => m.k === 'FLIP');
export const playerSummary = (P: PlayerState) => `${P.name}: nerts=${P.nerts.length} stock=${P.stock.length} waste=${P.waste.length}`;

/** circular table distance between seat i and ring position `at`, normalised to [0,1]. */
export function ringDist(i: number, at: number, n: number): number {
  if (n < 2) return 0;
  const d = Math.abs(((i - at) % n + n) % n); return Math.min(d, n - d) / (n / 2);
}
