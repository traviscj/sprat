import { rng } from '../engine/cards.ts';
import { apply, legalMoves, roundScores, type Result } from '../engine/rules.ts';
import { deal, type GameState, type Move, type Rules, DEFAULT_RULES } from '../engine/state.ts';
import { Bot, type BotEnv, type BotEvent } from '../bots/bot.ts';
import type { BotProfile } from '../bots/profile.ts';

export interface Seat { id: string; name: string; bot?: BotProfile }
export interface MoveLog { t: number; p: number; m: Move; ok: boolean; why?: string; cheat?: string; avail: number }

/**
 * Owns a GameState and the bots that act on it. Time is injected (virtual in sim, wall-clock on server),
 * so the identical bot code runs headless at 10⁴× or live against humans.
 */
export class Driver {
  state: GameState;
  bots = new Map<number, Bot>();
  rand: () => number;
  log: MoveLog[] = [];
  events: BotEvent[] = [];
  now = 0;
  private flipsSince: number[] = [];
  onApplied?: (p: number, m: Move, r: Result) => void;
  onEvent?: (e: BotEvent) => void;
  private wall: (() => number) | null = null;
  onRoundOver?: (scores: number[]) => void;

  seats: Seat[]; rules: Rules; seed: number;
  constructor(seats: Seat[], rules: Rules = DEFAULT_RULES, seed = 1, round = 0, prev?: number[]) {
    this.seats = seats; this.rules = rules; this.seed = seed;
    this.state = deal(seed, seats.map(s => ({ id: s.id, name: s.name, bot: !!s.bot })), rules, round, prev);
    this.rand = rng(seed * 31 + round);
    seats.forEach((s, i) => { if (s.bot) this.bots.set(i, new Bot(i, s.bot)); });
  }

  get env(): BotEnv {
    return { state: this.state, rand: this.rand, apply: (p, m) => this.apply(p, m), emit: e => { this.events.push(e); this.onEvent?.(e); } };
  }

  /** Wall-clock callers (server) call this before apply so the log carries real timestamps. */
  syncNow() { if (this.wall) this.now = this.wall(); }

  apply(p: number, m: Move): Result {
    this.syncNow();
    const avail = legalMoves(this.state, p).length;
    const human = !this.bots.has(p);
    let card: number | undefined, f: number | undefined;
    if (human) { const P = this.state.players[p]; const t = (a: number[]) => a[a.length - 1];
      if (m.k === 'N2F' || m.k === 'N2W') card = t(P.nerts); else if (m.k === 'S2F' || m.k === 'S2W') card = t(P.waste); else if (m.k === 'W2F') card = t(P.work[m.w] ?? []);
      if ('f' in m) f = m.f; }
    const r = apply(this.state, p, m);
    this.state.t = this.now;
    this.log.push({ t: this.now, p, m, ok: r.ok, why: r.ok ? undefined : r.why, cheat: r.ok ? r.cheat : undefined, avail });
    if (human) {
      const e = this.env.emit!;
      if (r.ok) e({ t: this.now, p, k: r.cheat ? 'cheat' : r.challenge ? 'challenge' : m.k === 'NERTS' ? 'nerts' : 'move', move: m, card, f, why: r.cheat ?? (r.challenge ? (r.challenge.caught ? 'caught' : 'clean') : undefined) });
      else { let k: BotEvent['k'] = 'reject';
        if (f !== undefined && f >= 0 && card !== undefined) { const F = this.state.foundations[f]; const top = F ? F.cards[F.cards.length - 1] : undefined; k = top !== undefined && (top % 13) >= (card % 13) ? 'beaten' : 'stale'; }
        e({ t: this.now, p, k, move: m, card, f, why: r.why }); }
    }
    if (r.ok) {
      if ('f' in m && m.k !== 'CHALLENGE') {
        const sal = this.bots.get(p)?.prof.slam ?? 0.5;
        for (const [i, b] of this.bots) if (i !== p && b.notice(this.env, this.now, sal)) this.env.emit!({ t: this.now, p: i, k: 'notice', why: this.state.players[p].name });
        if (r.cheat && !this.bots.has(p)) { const fi = m.f === -1 ? this.state.foundations.length - 1 : m.f; this.state.foundations[fi].mess = Math.min(1, this.state.foundations[fi].mess + 0.3); }
      }
      if (m.k === 'FLIP') this.flipsSince[p] = (this.flipsSince[p] ?? 0) + 1; else this.flipsSince = [];
      this.onApplied?.(p, m, r);
      if (r.roundOver || this.stalled()) this.finish();
    }
    return r;
  }

  /** Every player has cycled their whole stock with nobody making a non-flip move ⇒ dead round. */
  stalled(): boolean {
    return this.state.players.every((P, i) => (this.flipsSince[i] ?? 0) > Math.ceil((P.stock.length + P.waste.length) / this.rules.flipCount) + 1);
  }

  finish() {
    if (!this.state.over) this.state.over = true;
    const sc = roundScores(this.state);
    this.state.players.forEach((P, i) => { P.score += sc[i]; });
    this.onRoundOver?.(sc);
  }

  /** Headless: run bots in virtual time until the round ends or maxMs elapses. */
  runVirtual(maxMs = 10 * 60_000): GameState {
    const next = new Map<number, number>();
    for (const i of this.bots.keys()) next.set(i, this.rand() * 300);
    while (!this.state.over && this.now < maxMs) {
      let bi = -1, bt = Infinity;
      for (const [i, t] of next) if (t < bt) { bt = t; bi = i; }
      if (bi < 0) break;
      this.now = bt;
      const d = this.bots.get(bi)!.step(this.env, this.now);
      next.set(bi, this.now + Math.max(1, d));
    }
    if (!this.state.over) this.finish();
    return this.state;
  }

  /** Live: drive bots with setTimeout on the wall clock. Returns a stop fn. */
  startReal(clock: () => number = () => performance.now()): () => void {
    const t0 = clock();
    this.wall = () => clock() - t0;
    const timers = new Map<number, ReturnType<typeof setTimeout>>();
    let live = true;
    const tick = (i: number) => {
      if (!live || this.state.over) return;
      this.syncNow();
      const d = this.bots.get(i)!.step(this.env, this.now);
      timers.set(i, setTimeout(() => tick(i), Math.max(1, Math.min(d, 5000))));
    };
    for (const i of this.bots.keys()) timers.set(i, setTimeout(() => tick(i), 200 + this.rand() * 300));
    return () => { live = false; this.wall = null; for (const t of timers.values()) clearTimeout(t); };
  }
}
