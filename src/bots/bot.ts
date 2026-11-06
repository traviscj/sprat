import { type Card, isRed, rankOf, suitOf } from '../engine/cards.ts';
import type { GameState, Move } from '../engine/state.ts';
import { canFoundationCheat, ringDist, type Result } from '../engine/rules.ts';
import type { BotProfile, Region } from './profile.ts';

export interface BotEvent {
  t: number; p: number;
  k: 'move' | 'reject' | 'beaten' | 'stale' | 'fixate' | 'tilt' | 'cheat' | 'challenge' | 'nerts' | 'notice' | 'rotate';
  move?: Move; card?: Card; f?: number; why?: string;
}
export interface BotEnv {
  state: GameState;
  rand(): number;
  apply(p: number, m: Move): Result;
  emit?(e: BotEvent): void;
}

interface FBelief { suit: number; top: number; len: number } // top = rank of top card
interface Cand { m: Move; score: number; card?: Card; f?: number; cheat?: boolean }

const top = <T>(a: T[]): T | undefined => a[a.length - 1];

export class Bot {
  prof: BotProfile;
  p: number;
  mode: 'scan' | 'fixate' = 'scan';
  scanIdx = 0;
  belief: FBelief[] = [];
  beliefAt = -1;
  pending: { m: Move; at: number; card?: Card; f?: number; decidedTop?: number } | null = null;
  tiltUntil = 0;
  fixateUntil = 0;
  wanted: { card: Card; f: number } | null = null;
  lastW2W: { from: number; to: number; n: number } | null = null;
  stunUntil = 0;
  focus = 0;    // log-multiplier on cps, AR(1)
  /** Someone slammed a card: with prob salience×distract my gaze jumps to the foundations (belief refreshed, time lost). */
  notice(env: BotEnv, now: number, salience: number): boolean {
    if (env.rand() >= salience * this.prof.distract) return false;
    this.stunUntil = now + this.jit(env, this.prof.stunMs); this.look(env, now); this.n.interrupts++; return true;
  }
  // telemetry
  n = { moves: 0, rejects: 0, beaten: 0, stale: 0, flips: 0, cheats: 0, scans: 0, interrupts: 0 };

  constructor(p: number, prof: BotProfile) { this.p = p; this.prof = prof; }

  private jit(env: BotEnv, ms: number) { return ms * (1 + this.prof.jitter * (2 * env.rand() - 1)); }
  private cps(now: number) { return this.prof.cps * Math.exp(this.focus) * (now < this.tiltUntil ? this.prof.tiltMult : 1); }
  private dist(env: BotEnv, at: number) { return ringDist(this.p, at, env.state.players.length); }
  private cost(env: BotEnv, now: number, items: number) { return this.jit(env, (1000 * Math.max(1, items)) / this.cps(now)); }

  /** Refresh foundation belief from truth (this *is* "looking at the foundations"). */
  private look(env: BotEnv, now: number) {
    this.belief = env.state.foundations.map(f => ({ suit: f.suit, top: this.readRank(env, top(f.cards)!, f.mess + this.dist(env, f.at) * this.prof.farsight / Math.max(1e-6, this.prof.eyestrain)), len: f.cards.length }));
    this.beliefAt = now;
  }
  private readRank(env: BotEnv, c: Card, mess = 0) {
    const r = rankOf(c);
    const p = this.prof.confusion + mess * this.prof.eyestrain;
    if (p > 0 && env.rand() < p) return Math.max(1, Math.min(13, r + (env.rand() < 0.5 ? -1 : 1)));
    return r;
  }
  /** Where to put a new ace pile: near me, and (with prob spite) pushed away from the current leader. */
  private placeAt(env: BotEnv): number {
    const n = env.state.players.length; if (n < 3 || env.rand() >= this.prof.spite) return this.p;
    let lead = -1, best = Infinity;
    env.state.players.forEach((P, i) => { if (i !== this.p && P.nerts.length < best) { best = P.nerts.length; lead = i; } });
    const a = this.p + 0.5, b = this.p - 0.5;
    return ringDist(lead, a, n) >= ringDist(lead, b, n) ? a : b;
  }
  private fTarget(env: BotEnv, c: Card): number | undefined {
    const r = this.readRank(env, c);
    if (r === 1) return -1;
    const s = suitOf(c);
    for (let i = 0; i < this.belief.length; i++) { const b = this.belief[i]; if (b.suit === s && b.top === r - 1 && b.len < 13) return i; }
    return undefined;
  }
  private fCheatTarget(env: BotEnv, c: Card): number | undefined {
    for (let i = 0; i < this.belief.length; i++) {
      const f = env.state.foundations[i]; // uses belief index; truth check is approximate but fine
      if (f && canFoundationCheat(c, f)) return i;
    }
    return undefined;
  }
  private oneAway(c: Card): boolean { // c's foundation needs exactly one more card before c
    const r = rankOf(c), s = suitOf(c);
    if (r === 2) return !this.belief.some(b => b.suit === s);           // waiting for an ace
    return this.belief.some(b => b.suit === s && b.top === r - 2);
  }
  private canWorkB(env: BotEnv, c: Card, pile: Card[]): boolean {
    if (pile.length === 0) return true;
    const t = top(pile)!;
    const colorOk = isRed(c) !== isRed(t) || (this.prof.colorblind > 0 && env.rand() < this.prof.colorblind);
    return colorOk && this.readRank(env, c) === rankOf(t) - 1;
  }

  private candidates(env: BotEnv, region: Region): Cand[] {
    const P = env.state.players[this.p], pr = this.prof, out: Cand[] = [];
    const n = top(P.nerts), s = top(P.waste);
    const buryPen = (pile: Card[]) => { const t = top(pile); return t !== undefined && this.oneAway(t) ? pr.patience : 0; };
    if (P.nerts.length === 0 && !P.calledNerts) out.push({ m: { k: 'NERTS' }, score: 1000 });
    switch (region) {
      case 'nerts': {
        if (n === undefined) break;
        const f = this.fTarget(env, n);
        if (f !== undefined) out.push({ m: { k: 'N2F', f }, score: 100 + pr.wFoundation + pr.wUnblock, card: n, f });
        P.work.forEach((w, i) => { if (this.canWorkB(env, n, w)) out.push({ m: { k: 'N2W', w: i }, score: 60 + pr.wUnblock - (w.length === 0 ? 5 : 0) - buryPen(w) }); });
        if (env.state.rules.houseRules && f === undefined && pr.larceny && env.rand() < pr.larceny) {
          const fc = this.fCheatTarget(env, n); if (fc !== undefined) out.push({ m: { k: 'N2F', f: fc }, score: 90, card: n, f: fc, cheat: true });
        }
        break;
      }
      case 'found': {
        // everything I hold that could go up
        if (n !== undefined) { const f = this.fTarget(env, n); if (f !== undefined) out.push({ m: { k: 'N2F', f }, score: 100 + pr.wFoundation + pr.wUnblock, card: n, f }); }
        if (s !== undefined) { const f = this.fTarget(env, s); if (f !== undefined) out.push({ m: { k: 'S2F', f }, score: 30 + pr.wFoundation, card: s, f }); }
        P.work.forEach((w, i) => { const t = top(w); if (t === undefined) return; const f = this.fTarget(env, t); if (f !== undefined) out.push({ m: { k: 'W2F', w: i, f }, score: 25 + pr.wFoundation + (w.length === 1 ? 5 : 0), card: t, f }); });
        break;
      }
      case 'work': {
        if (n !== undefined) P.work.forEach((w, i) => { if (this.canWorkB(env, n, w)) out.push({ m: { k: 'N2W', w: i }, score: 60 + pr.wUnblock - buryPen(w) }); });
        if (s !== undefined) P.work.forEach((w, i) => { if (this.canWorkB(env, s, w)) out.push({ m: { k: 'S2W', w: i }, score: 10 - buryPen(w) - (w.length === 0 ? 6 : 0) }); });
        P.work.forEach((w, i) => {
          for (let k = 1; k <= w.length; k++) {
            const bottom = w[w.length - k];
            P.work.forEach((w2, j) => {
              if (i === j || (k === w.length && w2.length === 0)) return;
              if (!this.canWorkB(env, bottom, w2)) return;
              if (this.lastW2W && this.lastW2W.from === j && this.lastW2W.to === i && this.lastW2W.n === k) return; // no ping-pong
              let sc = -1 - buryPen(w2);
              if (k === w.length) sc += n !== undefined ? 15 : 0;             // frees a pile for the nerts card
              else { const exposed = w[w.length - k - 1]; if (this.fTarget(env, exposed) !== undefined) sc += 20; if (n !== undefined && this.canWorkB(env, n, [exposed])) sc += 12; }
              if (w2.length === 0 && sc < 0) return;                          // never shuffle into an empty pile for no reason
              if (sc > 0) out.push({ m: { k: 'W2W', from: i, n: k, to: j }, score: sc });
            });
          }
        });
        break;
      }
      case 'waste': {
        if (s !== undefined) {
          const f = this.fTarget(env, s); if (f !== undefined) out.push({ m: { k: 'S2F', f }, score: 30 + pr.wFoundation, card: s, f });
          P.work.forEach((w, i) => { if (this.canWorkB(env, s, w)) out.push({ m: { k: 'S2W', w: i }, score: 10 - buryPen(w) - (w.length === 0 ? 6 : 0) }); });
        }
        if (P.stock.length || P.waste.length) {
          let fl: Move = { k: 'FLIP' };
          // grandma: peek-ish miscount — if a card 1 or 2 deep in the stock would unblock nerts, "miscount" to land on it
          if (env.state.rules.houseRules && pr.miscount && n !== undefined && env.rand() < pr.miscount) {
            for (const k of [2, 4]) { const c = P.stock[P.stock.length - k]; if (c !== undefined && (this.fTarget(env, c) !== undefined || P.work.some(w => this.canWorkB(env, c, w)))) { fl = { k: 'FLIP', n: k }; break; } }
          }
          out.push({ m: fl, score: 1, cheat: fl.n !== undefined });
        }
        break;
      }
    }
    return out;
  }

  /** One attention step. Returns ms until the bot should be stepped again. */
  step(env: BotEnv, now: number): number {
    const pr = this.prof, st = env.state;
    if (st.over) return 1e9;
    if (now < this.stunUntil) return this.stunUntil - now;
    if (this.pending) {
      if (now < this.pending.at) return this.pending.at - now;
      const pd = this.pending; this.pending = null;
      const r = env.apply(this.p, pd.m);
      if (r.ok) {
        this.n.moves++; if (pd.m.k === 'FLIP') this.n.flips++;
        if (r.cheat) { this.n.cheats++; env.emit?.({ t: now, p: this.p, k: 'cheat', move: pd.m, why: r.cheat }); }
        else if (r.challenge) env.emit?.({ t: now, p: this.p, k: 'challenge', f: r.challenge.f, why: r.challenge.caught ? 'caught' : 'clean' });
        else if (pd.m.k === 'NERTS') env.emit?.({ t: now, p: this.p, k: 'nerts' });
        else env.emit?.({ t: now, p: this.p, k: 'move', move: pd.m, card: pd.card, f: pd.f });
        if (pd.f !== undefined) {
          const fi = pd.f === -1 ? st.foundations.length - 1 : pd.f; const F = st.foundations[fi];
          if (F) F.mess = Math.min(1, F.mess * 0.5 + pr.messy);                     // my sloppiness lands on the pile
          this.look(env, now);                                                          // you see the pile you just played on
        }
        if (pd.m.k === 'W2W') this.lastW2W = { from: pd.m.from, to: pd.m.to, n: pd.m.n }; else if (pd.m.k !== 'FLIP') this.lastW2W = null;
        this.wanted = null; this.mode = 'scan';
        if (pr.rescan && pd.m.k !== 'FLIP') this.scanIdx = 0;
        return this.jit(env, 120);
      }
      this.n.rejects++;
      let k: BotEvent['k'] = 'reject';
      if (pd.f !== undefined && pd.card !== undefined) {
        const f = st.foundations[pd.f]; const t = f ? rankOf(top(f.cards)!) : 0;
        if (f && t >= rankOf(pd.card)) { k = 'beaten'; this.n.beaten++; } else { k = 'stale'; this.n.stale++; }
        this.look(env, now);
      }
      env.emit?.({ t: now, p: this.p, k, move: pd.m, card: pd.card, f: pd.f, why: r.why });
      this.tiltUntil = now + pr.tiltMs; env.emit?.({ t: now, p: this.p, k: 'tilt' });
      return this.jit(env, 250);
    }
    if (this.mode === 'fixate') {
      if (now > this.fixateUntil || !this.wanted) { this.mode = 'scan'; this.wanted = null; return 0; }
      const c = this.cost(env, now, 1); this.n.scans++;
      this.look(env, now);
      const f = this.fTarget(env, this.wanted.card);
      if (f !== undefined) { this.pending = { m: { k: 'N2F', f }, at: now + c + this.jit(env, pr.motorMs * 0.6), card: this.wanted.card, f }; return c; }
      return c;
    }
    // scan
    const region = pr.scanOrder[this.scanIdx % pr.scanOrder.length];
    this.scanIdx = (this.scanIdx + 1) % pr.scanOrder.length;
    const P = st.players[this.p];
    if (pr.drift) this.focus = Math.max(-0.8, Math.min(0.8, 0.97 * this.focus + pr.drift * 0.25 * (2 * env.rand() - 1)));
    const items = region === 'found' ? 1 + st.foundations.reduce((a, f) => a + 1 + pr.reach * this.dist(env, f.at), 0) : region === 'work' ? P.work.length * 2 : 1;
    const c = this.cost(env, now, items); this.n.scans++;
    if (region === 'found' || this.beliefAt < 0 || (pr.psychic && env.rand() < pr.psychic)) this.look(env, now);
    // suspicion: inspect a random pile
    if (region === 'found' && st.rules.houseRules && pr.suspicion && st.foundations.length && env.rand() < pr.suspicion) {
      const fi = (env.rand() * st.foundations.length) | 0;
      if (st.foundations[fi].dirty) { this.pending = { m: { k: 'CHALLENGE', f: fi }, at: now + c + this.cost(env, now, 13) }; return c; }
      return c + this.cost(env, now, 13);
    }
    const cands = this.candidates(env, region);
    if (cands.length) {
      cands.sort((a, b) => b.score - a.score);
      const best = cands[0];
      const motor = best.m.k === 'FLIP' ? pr.flipMs : pr.motorMs;
      if ('f' in best.m && best.m.f === -1 && best.m.k !== 'CHALLENGE') (best.m as { at?: number }).at = this.placeAt(env);
      this.pending = { m: best.m, at: now + c + this.jit(env, motor), card: best.card, f: best.f };
      return c;
    }
    // nothing here; maybe fixate on a one-away nerts card
    const n = top(P.nerts);
    if (region === 'found' && n !== undefined && pr.fixation && this.oneAway(n) && env.rand() < pr.fixation) {
      this.mode = 'fixate'; this.fixateUntil = now + this.jit(env, pr.fixateMaxMs); this.wanted = { card: n, f: -1 };
      env.emit?.({ t: now, p: this.p, k: 'fixate', card: n });
    }
    return c;
  }
}
