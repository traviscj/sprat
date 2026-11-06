// Authoritative game server. `npm run server` → ws://0.0.0.0:8787
// First-arrival ordering of contested foundation plays is simply the order messages hit this process.
import { WebSocketServer, type WebSocket } from 'ws';
import { PRESETS, profile } from '../bots/profile.ts';
import { DEFAULT_RULES, type Rules } from '../engine/state.ts';
import { Driver, type Seat } from '../sim/driver.ts';
import { redact, type ClientMsg, type SeatInfo, type ServerMsg } from './protocol.ts';

const PORT = +(process.env.PORT ?? 8787);
const MAX_SEATS = 8;

interface Conn { ws: WebSocket; room: Room; seat: number }
interface RoomSeat extends Seat { conn?: Conn }

class Room {
  seats: RoomSeat[] = [];
  spectators = new Set<Conn>();
  autoloop = false;
  host = 0;
  driver: Driver | null = null;
  stopBots: (() => void) | null = null;
  rules: Rules = DEFAULT_RULES;
  round = 0;
  totals: number[] = [];
  code: string;
  constructor(code: string) { this.code = code; }

  send(c: Conn | undefined, m: ServerMsg) { if (c && c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(m)); }
  broadcast(f: (seat: number) => ServerMsg | null) { this.seats.forEach((s, i) => { const m = f(i); if (m) this.send(s.conn, m); }); const sm = f(-1); if (sm) for (const c of this.spectators) this.send(c, sm); }
  lobby() { const seats: SeatInfo[] = this.seats.map(s => ({ name: s.name, bot: !!s.bot, preset: s.bot?.name, connected: !!s.conn || !!s.bot })); this.broadcast(() => ({ t: 'lobby', seats, host: this.host })); }
  pushState() { const d = this.driver; if (!d) return; this.broadcast(i => ({ t: 'state', s: redact(d.state, i), now: d.now })); }

  start(rules: Partial<Rules> = {}, seed = (Math.random() * 1e9) | 0) {
    this.stopBots?.();
    this.rules = { ...DEFAULT_RULES, ...rules };
    const d = new Driver(this.seats.map(s => ({ id: s.id, name: s.name, bot: s.bot })), this.rules, seed, this.round, this.totals);
    this.driver = d;
    d.onApplied = (p, m, r) => { this.broadcast(() => ({ t: 'applied', p, m, r, seq: d.state.seq })); this.pushState(); };
    d.onRoundOver = sc => {
      this.stopBots?.(); this.stopBots = null;
      this.totals = d.state.players.map(P => P.score);
      const gameOver = this.totals.some(t => t >= this.rules.targetScore);
      this.pushState();
      this.broadcast(() => ({ t: 'round', roundScores: sc, totals: this.totals, caller: d.state.caller, gameOver }));
      if (gameOver) { this.round = 0; this.totals = []; } else this.round++;
      if (this.autoloop) setTimeout(() => { if (this.driver === d) this.start(this.rules); }, 8000);
    };
    d.onEvent = e => this.broadcast(() => ({ t: 'event', e }));
    this.pushState();
    this.stopBots = d.startReal();
  }

  handle(c: Conn, m: ClientMsg) {
    switch (m.t) {
      case 'addBot': {
        if (c.seat !== this.host || this.seats.length >= MAX_SEATS) return;
        if (!PRESETS[m.preset]) return this.send(c, { t: 'error', msg: `unknown preset; have ${Object.keys(PRESETS).join(',')}` });
        const p = profile(m.preset, m.overrides ?? {});
        this.seats.push({ id: `bot${this.seats.length}`, name: `${p.name}${this.seats.filter(s => s.bot?.name === p.name).length || ''}`, bot: p });
        this.lobby(); break;
      }
      case 'removeBot': if (c.seat === this.host && this.seats[m.seat]?.bot) { this.seats.splice(m.seat, 1); this.lobby(); } break;
      case 'start': if (c.seat === this.host && this.seats.length >= 2) { this.start(m.rules, m.seed); } break;
      case 'next': if (c.seat === this.host && this.driver?.state.over) this.start(this.rules); break;
      case 'move': {
        const d = this.driver; if (!d) return;
        const r = d.apply(c.seat, m.m);
        if (!r.ok) this.send(c, { t: 'applied', p: c.seat, m: m.m, r, seq: d.state.seq });
        break;
      }
    }
  }
}

const rooms = new Map<string, Room>();
const wss = new WebSocketServer({ port: PORT });
wss.on('connection', ws => {
  let conn: Conn | null = null;
  ws.on('message', raw => {
    let m: ClientMsg; try { m = JSON.parse(String(raw)); } catch { return; }
    if (m.t === 'join') {
      const code = (m.room || 'lobby').toLowerCase();
      let room = rooms.get(code); if (!room) { room = new Room(code); rooms.set(code, room); }
      // reconnect to an existing human seat by name, else new seat
      if (m.spectate) { conn = { ws, room, seat: -1 }; room.spectators.add(conn); room.send(conn, { t: 'hello', you: -1, room: code }); room.lobby(); room.pushState(); return; }
      let seat = room.seats.findIndex(s => !s.bot && s.name === m.name);
      if (seat < 0) { if (room.seats.length >= MAX_SEATS) return ws.send(JSON.stringify({ t: 'error', msg: 'room full' })); room.seats.push({ id: `h${Date.now()}`, name: m.name || `p${room.seats.length}` }); seat = room.seats.length - 1; }
      conn = { ws, room, seat }; room.seats[seat].conn = conn;
      room.send(conn, { t: 'hello', you: seat, room: code });
      room.lobby(); room.pushState();
      return;
    }
    if (conn) conn.room.handle(conn, m);
  });
  ws.on('close', () => { if (conn) { if (conn.seat < 0) conn.room.spectators.delete(conn); else { conn.room.seats[conn.seat].conn = undefined; conn.room.lobby(); } } });
});
console.log(`sprat server ws://0.0.0.0:${PORT}`);
// AUTOSTART=steady,twitchy,grandma ROOM=demo HOUSE=1 → a room of bots that plays rounds forever (spectate with ?ws=...&room=demo&spectate=1)
if (process.env.AUTOSTART) {
  const room = new Room(process.env.ROOM ?? 'demo'); rooms.set(room.code, room);
  for (const nm of process.env.AUTOSTART.split(',')) { const p = profile(nm); room.seats.push({ id: `bot${room.seats.length}`, name: `${p.name}${room.seats.filter(s => s.bot?.name === p.name).length || ''}`, bot: p }); }
  room.host = -1; room.autoloop = true;
  room.start({ houseRules: process.env.HOUSE === '1' });
  console.log(`autostart room '${room.code}': ${room.seats.map(s => s.name).join(', ')}`);
}
