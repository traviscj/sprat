import { describe, expect, it } from 'vitest';
import { mk, rankOf, str } from '../src/engine/cards.ts';
import { apply, legalMoves, roundScores } from '../src/engine/rules.ts';
import { deal, DEFAULT_RULES, type GameState } from '../src/engine/state.ts';
import { Driver } from '../src/sim/driver.ts';
import { profile } from '../src/bots/profile.ts';

const seats = [{ id: 'a', name: 'A', bot: false }, { id: 'b', name: 'B', bot: false }];
const fresh = (house = false) => deal(42, seats, { ...DEFAULT_RULES, houseRules: house });
const rig = (s: GameState, p: number, f: (P: GameState['players'][0]) => void) => { f(s.players[p]); return s; };

describe('deal', () => {
  it('13 nerts, 4 work singletons, 35 stock, per player, cards unique per deck', () => {
    const s = fresh();
    for (const P of s.players) {
      expect(P.nerts).toHaveLength(13); expect(P.work).toHaveLength(4); P.work.forEach(w => expect(w).toHaveLength(1));
      expect(P.stock).toHaveLength(35);
      const all = [...P.nerts, ...P.work.flat(), ...P.stock];
      expect(new Set(all).size).toBe(52);
    }
    expect(s.players[1].stock.every(c => c >= 52)).toBe(true);
  });
});

describe('foundations', () => {
  it('ace opens a pile, 2 of same suit follows, wrong suit refused', () => {
    const s = rig(fresh(), 0, P => { P.nerts = [mk(0, 0, 3), mk(0, 1, 2), mk(0, 0, 2), mk(0, 0, 1)]; });
    expect(apply(s, 0, { k: 'N2F', f: -1 }).ok).toBe(true);
    expect(s.foundations).toHaveLength(1);
    expect(apply(s, 0, { k: 'N2F', f: 0 }).ok).toBe(true);
    expect(apply(s, 0, { k: 'N2F', f: 0 }).ok).toBe(false); // 2♦ on 2♥
    expect(legalMoves(s, 0).filter(m => m.k === 'N2F')).toHaveLength(0);
  });
  it('other player can build on my pile; contested play — second arrival rejected', () => {
    const s = fresh();
    s.players[0].nerts = [mk(0, 2, 2), mk(0, 2, 1)];
    s.players[1].nerts = [mk(1, 2, 2)];
    apply(s, 0, { k: 'N2F', f: -1 });
    expect(apply(s, 1, { k: 'N2F', f: 0 }).ok).toBe(true);
    expect(apply(s, 0, { k: 'N2F', f: 0 }).ok).toBe(false);
    expect(str(s.foundations[0].cards[1])).toBe('2♣');
  });
  it('scoring: +1 per foundation card by deck, -2 per nerts card', () => {
    const s = fresh();
    s.players[0].nerts = [mk(0, 2, 2), mk(0, 2, 1)];
    s.players[1].nerts = [mk(1, 2, 2)];
    apply(s, 0, { k: 'N2F', f: -1 }); apply(s, 1, { k: 'N2F', f: 0 });
    expect(roundScores(s)).toEqual([1 - 2, 1]);
    expect(apply(s, 1, { k: 'NERTS' }).ok).toBe(true);
    expect(s.over).toBe(true); expect(s.caller).toBe(1);
  });
});

describe('work piles', () => {
  it('alternating colour descending; run moves; any card to empty pile', () => {
    const s = fresh();
    const P = s.players[0];
    P.work = [[mk(0, 3, 9)], [mk(0, 0, 8)], [], [mk(0, 1, 7)]];
    expect(apply(s, 0, { k: 'W2W', from: 1, n: 1, to: 0 }).ok).toBe(true);      // 8♥ on 9♠
    expect(apply(s, 0, { k: 'W2W', from: 3, n: 1, to: 0 }).ok).toBe(false);     // 7♦ on 8♥ same colour
    P.nerts.push(mk(0, 2, 7));
    expect(apply(s, 0, { k: 'N2W', w: 0 }).ok).toBe(true);                       // 7♣ on 8♥
    expect(apply(s, 0, { k: 'W2W', from: 0, n: 2, to: 2 }).ok).toBe(true);      // run 8♥7♣ to empty
    expect(P.work[2].map(rankOf)).toEqual([8, 7]);
  });
});

describe('stock', () => {
  it('flips 3, recycles when exhausted, order preserved across a cycle', () => {
    const s = fresh(); const P = s.players[0];
    const orig = [...P.stock];
    for (let i = 0; i < 12; i++) apply(s, 0, { k: 'FLIP' });
    expect(P.stock).toHaveLength(0); expect(P.waste).toHaveLength(35);
    expect(apply(s, 0, { k: 'FLIP' }).ok).toBe(true); // recycle + flip 3 in one motion
    expect(P.stock).toEqual(orig.slice(0, 32)); expect(P.waste).toHaveLength(3);
    expect(P.waste.at(-1)).toBe(orig[orig.length - 3]);
  });
  it('miscounted flip refused under strict rules, accepted+flagged under house rules', () => {
    expect(apply(fresh(), 0, { k: 'FLIP', n: 2 })).toMatchObject({ ok: false });
    expect(apply(fresh(true), 0, { k: 'FLIP', n: 2 })).toMatchObject({ ok: true, cheat: 'miscount' });
  });
});

describe('grandma', () => {
  it('skips the 2 under house rules; challenge unwinds and penalises', () => {
    const s = fresh(true);
    s.players[0].nerts = [mk(0, 0, 3), mk(0, 0, 1)];
    s.players[1].nerts = [mk(1, 0, 4)];
    apply(s, 0, { k: 'N2F', f: -1 });
    expect(apply(s, 0, { k: 'N2F', f: 0 })).toMatchObject({ ok: true, cheat: 'skip' });
    expect(apply(s, 1, { k: 'N2F', f: 0 }).ok).toBe(true); // 4♥ rides on the cheat
    const r = apply(s, 1, { k: 'CHALLENGE', f: 0 });
    expect(r).toMatchObject({ ok: true, challenge: { caught: true } });
    expect(s.foundations[0].cards).toHaveLength(1);
    expect(s.players[0].penalty).toBe(5); expect(s.players[1].penalty).toBe(0);
    expect(s.players[0].waste.at(-1)).toBe(mk(0, 0, 3)); expect(s.players[1].waste.at(-1)).toBe(mk(1, 0, 4));
    expect(apply(s, 1, { k: 'CHALLENGE', f: 0 })).toMatchObject({ ok: true, challenge: { caught: false } });
    expect(s.players[1].penalty).toBe(2);
  });
});

describe('driver + bots', () => {
  it('a round of three bots terminates, is deterministic for a seed, and conserves cards', () => {
    const run = () => new Driver(['steady', 'twitchy', 'river'].map((n, i) => ({ id: `b${i}`, name: n, bot: profile(n) })), DEFAULT_RULES, 7);
    const a = run(), b = run();
    a.runVirtual(); b.runVirtual();
    expect(a.state.over).toBe(true);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    const total = a.state.foundations.reduce((n, f) => n + f.cards.length, 0) + a.state.players.reduce((n, P) => n + P.nerts.length + P.stock.length + P.waste.length + P.work.flat().length, 0);
    expect(total).toBe(52 * 3);
    for (const f of a.state.foundations) f.cards.forEach((c, i) => expect(rankOf(c)).toBe(i + 1));
  });
});
