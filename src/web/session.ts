import type { BotEvent } from '../bots/bot.ts';
import { profile } from '../bots/profile.ts';
import { DEFAULT_RULES, type Move, type Rules } from '../engine/state.ts';
import { redact, type ClientMsg, type GameView, type SeatInfo, type ServerMsg } from '../server/protocol.ts';
import { Driver, type Seat } from '../sim/driver.ts';

export interface RoundInfo { roundScores: number[]; totals: number[]; caller: number; gameOver: boolean }
export interface Session {
  kind: 'local' | 'remote';
  me: number;
  view: GameView | null;
  seats: SeatInfo[];
  host: boolean;
  now(): number;
  move(m: Move): void;
  addBot(preset: string, overrides?: Record<string, number>): void;
  removeBot(seat: number): void;
  start(rules?: Partial<Rules>, seed?: number): void;
  next(): void;
  botInfo(p: number): { mode: string; tilt: boolean; region: string } | null;
  onChange: () => void;
  onEvent: (e: BotEvent) => void;
  onRound: (r: RoundInfo) => void;
  onError: (msg: string) => void;
}

const noop = (..._a: unknown[]) => {};

export class LocalSession implements Session {
  kind = 'local' as const; me = 0; view: GameView | null = null; host = true;
  seats: SeatInfo[] = [];
  private seatDefs: Seat[] = [];
  private driver: Driver | null = null;
  private stop: (() => void) | null = null;
  private rules: Rules = DEFAULT_RULES; private round = 0; private totals: number[] = [];
  onChange = noop; onEvent: (e: BotEvent) => void = noop; onRound: (r: RoundInfo) => void = noop; onError = noop;
  constructor(name: string) { this.seatDefs.push({ id: 'me', name }); this.syncSeats(); }
  private syncSeats() { this.seats = this.seatDefs.map(s => ({ name: s.name, bot: !!s.bot, preset: s.bot?.name, connected: true })); this.onChange(); }
  now() { return this.driver?.now ?? 0; }
  addBot(preset: string, overrides = {}) { if (this.seatDefs.length >= 8) return; const p = profile(preset, overrides); const n = this.seatDefs.filter(s => s.bot?.name === p.name).length; this.seatDefs.push({ id: `b${this.seatDefs.length}`, name: n ? `${p.name}${n + 1}` : p.name, bot: p }); this.syncSeats(); }
  removeBot(seat: number) { if (this.seatDefs[seat]?.bot) { this.seatDefs.splice(seat, 1); this.syncSeats(); } }
  start(rules: Partial<Rules> = {}, seed = (Math.random() * 1e9) | 0) {
    this.stop?.();
    this.rules = { ...DEFAULT_RULES, ...rules };
    const d = new Driver(this.seatDefs, this.rules, seed, this.round, this.totals);
    this.driver = d;
    d.onApplied = () => this.refresh();
    d.onEvent = e => this.onEvent(e);
    d.onRoundOver = sc => {
      this.stop?.(); this.stop = null;
      this.totals = d.state.players.map(P => P.score);
      const gameOver = this.totals.some(t => t >= this.rules.targetScore);
      this.refresh();
      this.onRound({ roundScores: sc, totals: this.totals, caller: d.state.caller, gameOver });
      if (gameOver) { this.round = 0; this.totals = []; } else this.round++;
    };
    this.refresh();
    this.stop = d.startReal();
  }
  next() { if (this.driver?.state.over) this.start(this.rules); }
  private refresh() { if (this.driver) { this.view = redact(this.driver.state, this.me); this.onChange(); } }
  move(m: Move) { const d = this.driver; if (!d) return; const r = d.apply(this.me, m); if (!r.ok) this.onError(r.why); }
  botInfo(p: number) { const b = this.driver?.bots.get(p); if (!b) return null; return { mode: b.mode, tilt: this.driver!.now < b.tiltUntil, region: b.prof.scanOrder[(b.scanIdx + b.prof.scanOrder.length - 1) % b.prof.scanOrder.length] }; }
}

export class RemoteSession implements Session {
  kind = 'remote' as const; me = -1; view: GameView | null = null; seats: SeatInfo[] = []; host = false;
  private ws: WebSocket; private t0 = 0; private serverNow = 0;
  onChange = noop; onEvent: (e: BotEvent) => void = noop; onRound: (r: RoundInfo) => void = noop; onError = noop;
  constructor(url: string, room: string, name: string, spectate = false) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () => this.send({ t: 'join', room, name, spectate });
    this.ws.onclose = () => this.onError('disconnected');
    this.ws.onmessage = ev => {
      const m: ServerMsg = JSON.parse(ev.data);
      switch (m.t) {
        case 'hello': this.me = m.you; break;
        case 'lobby': this.seats = m.seats; this.host = m.host === this.me; this.onChange(); break;
        case 'state': this.view = m.s; this.serverNow = m.now; this.t0 = performance.now(); this.onChange(); break;
        case 'applied': if (!m.r.ok && m.p === this.me) this.onError(m.r.why); break;
        case 'event': this.onEvent(m.e); break;
        case 'round': this.onRound(m); break;
        case 'error': this.onError(m.msg); break;
      }
    };
  }
  private send(m: ClientMsg) { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
  now() { return this.serverNow + (performance.now() - this.t0); }
  move(m: Move) { this.send({ t: 'move', m, clientMs: Date.now() }); }
  addBot(preset: string, overrides?: Record<string, number>) { this.send({ t: 'addBot', preset, overrides }); }
  removeBot(seat: number) { this.send({ t: 'removeBot', seat }); }
  start(rules?: Partial<Rules>, seed?: number) { this.send({ t: 'start', rules, seed }); }
  next() { this.send({ t: 'next' }); }
  botInfo() { return null; }
}
