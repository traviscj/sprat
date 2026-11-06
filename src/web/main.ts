import type { BotEvent } from '../bots/bot.ts';
import { PRESETS } from '../bots/profile.ts';
import { type Card, isRed, rankOf, RANKS, str, SUITS, suitOf } from '../engine/cards.ts';
import { canFoundation, canWork } from '../engine/rules.ts';
import type { Move } from '../engine/state.ts';
import type { GameView } from '../server/protocol.ts';
import { LocalSession, RemoteSession, type RoundInfo, type Session } from './session.ts';

// ---------- boot ----------
const q = new URLSearchParams(location.search);
const name = q.get('name') || localStorage.getItem('sprat.name') || 'you';
localStorage.setItem('sprat.name', name);
const wsUrl = q.get('ws');
const sess: Session = wsUrl ? new RemoteSession(wsUrl, q.get('room') || 'lobby', name) : new LocalSession(name);
const app = document.getElementById('app')!;

type Sel = { src: 'N' } | { src: 'S' } | { src: 'W'; w: number; n: number } | null;
let sel: Sel = null;
let inspect: number | null = null;       // foundation being inspected (house rules)
let round: RoundInfo | null = null;
let err = '';
const log: BotEvent[] = [];
interface Tally { moves: number; rej: number; beaten: number; stale: number; cheat: number; fix: number; flips: number; first: number; last: number }
const tally = new Map<number, Tally>();
const T = (p: number) => { let t = tally.get(p); if (!t) { t = { moves: 0, rej: 0, beaten: 0, stale: 0, cheat: 0, fix: 0, flips: 0, first: Infinity, last: 0 }; tally.set(p, t); } return t; };

sess.onChange = render;
sess.onError = m => { err = m; render(); setTimeout(() => { if (err === m) { err = ''; render(); } }, 1500); };
sess.onRound = r => { round = r; render(); };
sess.onEvent = e => {
  log.push(e); if (log.length > 200) log.shift();
  const t = T(e.p);
  if (e.k === 'move' || e.k === 'nerts' || e.k === 'cheat') { t.moves++; if (e.move?.k === 'FLIP') t.flips++; if (e.k === 'cheat') t.cheat++; t.first = Math.min(t.first, e.t); t.last = e.t; }
  else if (e.k === 'beaten') { t.beaten++; t.rej++; } else if (e.k === 'stale') { t.stale++; t.rej++; } else if (e.k === 'reject') t.rej++; else if (e.k === 'fixate') t.fix++;
  render();
};

// ---------- helpers ----------
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const deckColor = (d: number) => `var(--d${d % 8})`;
const cardHtml = (c: Card, cls = '', attrs = '', badge = '') =>
  `<div class="c ${isRed(c) ? 'r' : ''} ${cls}" style="--dc:${deckColor((c / 52) | 0)}" ${attrs}><span>${RANKS[rankOf(c) - 1]}</span><span class="s">${SUITS[suitOf(c)]}</span><i class="d"></i>${badge}</div>`;
const backHtml = (d: number, cls = '', attrs = '', badge = '') => `<div class="c back ${cls}" style="--dc:${deckColor(d)}" ${attrs}>${badge}</div>`;
const emptyHtml = (label: string, cls = '', attrs = '') => `<div class="c empty ${cls}" ${attrs}>${label}</div>`;
const fmtT = (ms: number) => { const s = Math.max(0, ms / 1000) | 0; return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; };
const mvStr = (m?: Move) => !m ? '' : m.k === 'W2W' ? `W2W ${m.from}→${m.to}×${m.n}` : m.k === 'FLIP' ? `FLIP${m.n ? '×' + m.n : ''}` : m.k;

function selectedCard(v: GameView): Card | undefined {
  const P = v.players[sess.me]; if (!sel) return undefined;
  if (sel.src === 'N') return P.nerts.at(-1);
  if (sel.src === 'S') return P.waste.at(-1);
  return P.work[sel.w][P.work[sel.w].length - sel.n];
}

// ---------- render ----------
let tickTimer: ReturnType<typeof setTimeout> | null = null;
function render() {
  const v = sess.view;
  if (!v) { app.innerHTML = setupHtml(); return; }
  const me = sess.me;
  const P = v.players[me];
  const selC = selectedCard(v);
  const hotF = (f: number) => selC !== undefined && (f === -1 ? rankOf(selC) === 1 : canFoundation(selC, v.foundations[f]));
  const hotW = (w: number) => selC !== undefined && !(sel?.src === 'W' && sel.w === w) && canWork(selC, P.work[w]);

  const header = `<header>
    <span class="dim">r${v.round + 1}</span> <span class="n" id="clk">${fmtT(sess.now())}</span>
    ${v.players.map((p, i) => `<span class="pl" style="color:${deckColor(i)}"><b>${esc(p.name)}</b><span class="n ${p.nertsCount === 0 ? 'ok' : p.nertsCount <= 3 ? 'warn' : ''}">n${p.nertsCount}</span><span class="n dim">s${p.stockCount + p.wasteCount}</span><span class="n">${p.score}</span></span>`).join('')}
    ${v.rules.houseRules ? '<span class="warn">house</span>' : ''}
    ${err ? `<span class="bad">${esc(err)}</span>` : ''}
    <span style="flex:1"></span>
    ${sess.host && v.over ? '<button data-a="next">next round</button>' : ''}
    <button data-a="setup">⚙</button>
  </header>`;

  const found = `<section id="found"><span class="lbl" data-a="autof" title="auto-play selected card up">▲</span>
    ${v.foundations.map((f, i) => { const t = f.cards.at(-1)!; return cardHtml(t, `${hotF(i) ? 'hot' : ''} ${f.cards.length === 13 ? 'dim' : ''} ${inspect === i ? 'sel' : ''}`, `data-f="${i}"`, `<span class="cnt">${f.cards.length}</span>`); }).join('')}
    ${emptyHtml('A', hotF(-1) ? 'hot' : '', 'data-f="-1"')}
    ${inspect !== null && v.foundations[inspect] ? `<div style="display:flex;gap:2px;align-items:center;flex-basis:100%;--cw:26px;--ch:34px">${v.foundations[inspect].cards.map(c => cardHtml(c, '', '', '')).join('')}<button data-a="challenge" data-f="${inspect}" class="warn">challenge</button><button data-a="uninspect">×</button></div>` : ''}
  </section>`;

  const opps = `<section id="opps">${v.players.map((p, i) => i === me ? '' : `<div class="opp"><span class="nm" style="color:${deckColor(i)}">${esc(p.name)}</span>
      ${p.nerts.length ? cardHtml(p.nerts.at(-1)!, '', '', `<span class="cnt">${p.nertsCount}</span>`) : emptyHtml(p.calledNerts ? 'N!' : '0')}
      <span class="piles">${p.work.map(w => w.length ? `<div class="fan">${w.slice(-3).map((c, j) => cardHtml(c, '', `style="--dc:${deckColor(i)};top:${j * 7}px;z-index:${j}"`)).join('')}${w.length > 1 ? `<span class="cnt" style="position:absolute;right:-2px;top:-6px;font-size:9px;background:#0b0e11;padding:0 2px">${w.length}</span>` : ''}</div>` : emptyHtml('')).join('')}</span>
      <span class="dim">│</span>${p.waste.length ? cardHtml(p.waste.at(-1)!) : emptyHtml('')}<span class="n dim">${p.stockCount}</span>
    </div>`).join('')}</section>`;

  const nertsTop = P.nerts.at(-1);
  const myWork = P.work.map((w, i) => `<div class="fanv" data-w="${i}" style="height:${Math.max(1, w.length) * 18 + 32}px">
      ${w.length === 0 ? emptyHtml('', hotW(i) ? 'hot' : '', `data-w="${i}"`) : w.map((c, j) => cardHtml(c, `${sel?.src === 'W' && sel.w === i && j >= w.length - sel.n ? 'sel' : ''} ${j === w.length - 1 && hotW(i) ? 'hot' : ''}`, `data-w="${i}" data-j="${j}" style="--dc:${deckColor(me)};top:${j * 18}px;z-index:${j}"`)).join('')}
    </div>`).join('');
  const waste = P.waste.slice(-3);
  const meSec = `<section id="me">
    <div class="col"><span class="lbl">sprat ${P.nertsCount}</span><div class="pile">${nertsTop !== undefined ? cardHtml(nertsTop, sel?.src === 'N' ? 'sel' : '', 'data-src="N"', `<span class="cnt">${P.nertsCount}</span>`) : emptyHtml(P.calledNerts ? 'called' : 'empty', '', '')}</div>
      ${P.nertsCount === 0 && !P.calledNerts && !v.over ? '<button data-a="nerts" class="ok" style="font-weight:700">SPRAT!</button>' : ''}</div>
    <div id="work">${myWork}</div>
    <div class="col"><span class="lbl">river</span><div class="fanh">${waste.length ? waste.map((c, j) => cardHtml(c, j === waste.length - 1 && sel?.src === 'S' ? 'sel' : '', j === waste.length - 1 ? 'data-src="S"' : '', `<span class="cnt" style="display:none"></span>`).replace('class="c', `style="left:${j * 10}px;z-index:${j}" class="c`)).join('') : emptyHtml('')}</div><span class="n dim">${P.wasteCount}</span></div>
    <div class="col"><span class="lbl">stock</span><div class="pile">${P.stockCount ? backHtml(me, '', 'data-a="flip"', `<span class="cnt">${P.stockCount}</span>`) : emptyHtml('↻', '', 'data-a="flip"')}</div>
      ${v.rules.houseRules ? `<div class="stockbtns"><button data-a="flipn" data-n="2">2</button><button data-a="flipn" data-n="4">4</button></div>` : ''}</div>
  </section>`;

  const statsRows = v.players.map((p, i) => { const t = T(i); const bi = sess.botInfo(i); const mins = Math.max(1, (sess.now()) / 60000);
    return `<tr style="color:${deckColor(i)}"><td>${esc(p.name)}</td><td class="dim">${p.bot ? 'bot' : 'hum'}</td><td class="n ${p.nertsCount === 0 ? 'ok' : ''}">${p.nertsCount}</td><td class="n">${p.stockCount}/${p.wasteCount}</td><td class="n">${t.moves}</td><td class="n">${(t.moves / mins).toFixed(0)}</td><td class="n">${t.flips}</td><td class="n ${t.rej ? 'warn' : ''}">${t.rej}</td><td class="n ${t.beaten ? 'bad' : ''}">${t.beaten}</td><td class="n">${t.stale}</td><td class="n">${t.fix}</td><td class="n ${t.cheat ? 'warn' : ''}">${t.cheat}</td><td class="n">${p.penalty}</td><td class="n">${p.score}</td><td class="dim">${bi ? `${bi.mode === 'fixate' ? '<span class="ev-fixate">fix</span>' : bi.region}${bi.tilt ? ' <span class="bad">tilt</span>' : ''}` : ''}</td></tr>`; }).join('');
  const footer = `<footer>
    <table><tr><th>name</th><th></th><th class="n">nerts</th><th class="n">st/wa</th><th class="n">mv</th><th class="n">mv/m</th><th class="n">flip</th><th class="n">rej</th><th class="n">beat</th><th class="n">stale</th><th class="n">fix</th><th class="n">cheat</th><th class="n">pen</th><th class="n">tot</th><th>gaze</th></tr>${statsRows}</table>
    <div id="log">${log.slice(-14).reverse().map(e => `<span class="ev-${e.k}">${fmtT(e.t)} ${esc(v.players[e.p]?.name ?? '?').padEnd(8)} ${e.k.padEnd(7)} ${e.card !== undefined ? str(e.card) : ''} ${mvStr(e.move)} ${e.why ?? ''}</span>`).join('\n')}</div>
  </footer>`;

  const roundOv = round && v.over ? `<div class="ov" data-a="closeround"><div class="box"><b>${round.caller >= 0 ? `${esc(v.players[round.caller].name)} called SPRAT` : 'stalled — nobody could play'}</b>
    <table><tr><th>name</th><th class="n">round</th><th class="n">total</th></tr>${v.players.map((p, i) => `<tr style="color:${deckColor(i)}"><td>${esc(p.name)}</td><td class="n">${round!.roundScores[i]}</td><td class="n">${round!.totals[i]}</td></tr>`).join('')}</table>
    ${round.gameOver ? '<b class="ok">game over</b>' : ''} ${sess.host ? '<button data-a="next">next round</button>' : '<span class="dim">waiting for host</span>'}</div></div>` : '';

  app.innerHTML = `<div id="table">${header}${found}${opps}${meSec}</div>${footer}${roundOv}`;
  if (!tickTimer) tickTimer = setTimeout(tick, 1000);
}
function tick() { tickTimer = null; const el = document.getElementById('clk'); if (el && sess.view && !sess.view.over) { el.textContent = fmtT(sess.now()); tickTimer = setTimeout(tick, 1000); } }

function setupHtml() {
  const presets = Object.keys(PRESETS);
  return `<div class="ov"><div class="box" id="setup">
    <b>sprat</b> <span class="dim">${sess.kind === 'remote' ? `room · you=${sess.me}` : 'local vs bots'}</span>
    <table><tr><th>#</th><th>seat</th><th>preset</th><th></th></tr>${sess.seats.map((s, i) => `<tr><td class="n">${i}</td><td style="color:${deckColor(i)}">${esc(s.name)}</td><td class="dim">${s.bot ? s.preset : s.connected ? 'human' : 'human (away)'}</td><td>${s.bot && sess.host ? `<button data-a="rmbot" data-i="${i}">×</button>` : ''}</td></tr>`).join('')}</table>
    ${sess.host ? `<div class="row"><select id="preset">${presets.map(p => `<option>${p}</option>`).join('')}</select><button data-a="addbot">+ bot</button>
      <label><input type="checkbox" id="house"> house rules</label></div>
      <div class="row"><button data-a="start" ${sess.seats.length < 2 ? 'disabled' : ''}>deal</button>
      <span class="dim">${sess.seats.length}/8 seats · default: steady, twitchy</span>
      ${sess.seats.length < 2 ? '<button data-a="quick">quick (3 bots)</button>' : ''}</div>` : '<span class="dim">waiting for host…</span>'}
    <div class="dim" style="margin-top:6px">tap card → tap pile · ▲ = auto-foundation · tap stock = flip${sess.kind === 'local' ? ' · online: <code>?ws=ws://host:8787&room=fam&name=' + esc(name) + '</code>' : ''}</div>
  </div></div>`;
}

// ---------- input ----------
app.addEventListener('click', ev => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-a],[data-src],[data-f],[data-w]');
  if (!el) { sel = null; render(); return; }
  const a = el.dataset.a;
  const v = sess.view;
  if (a === 'setup') { sess.view = null; render(); return; }
  if (a === 'quick') { sess.addBot('steady'); sess.addBot('twitchy'); sess.addBot('river'); sess.start(); return; }
  if (a === 'addbot') { sess.addBot((document.getElementById('preset') as HTMLSelectElement).value); return; }
  if (a === 'rmbot') { sess.removeBot(+el.dataset.i!); return; }
  if (a === 'start') { if (sess.seats.length < 2) sess.addBot('steady'); if (sess.seats.length < 3) sess.addBot('twitchy'); sess.start({ houseRules: (document.getElementById('house') as HTMLInputElement)?.checked }); return; }
  if (a === 'next') { round = null; sess.next(); return; }
  if (a === 'closeround') { if ((ev.target as HTMLElement).classList.contains('ov')) { round = null; render(); } return; }
  if (!v || v.over) return;
  if (a === 'flip') { sel = null; sess.move({ k: 'FLIP' }); return; }
  if (a === 'flipn') { sel = null; sess.move({ k: 'FLIP', n: +el.dataset.n! }); return; }
  if (a === 'nerts') { sess.move({ k: 'NERTS' }); return; }
  if (a === 'challenge') { sess.move({ k: 'CHALLENGE', f: +el.dataset.f! }); inspect = null; render(); return; }
  if (a === 'uninspect') { inspect = null; render(); return; }
  if (a === 'autof') { const c = selectedCard(v); if (c === undefined) return; const f = rankOf(c) === 1 ? -1 : v.foundations.findIndex(F => canFoundation(c, F)); if (f === -2 || f === undefined) return; if (rankOf(c) !== 1 && f < 0) return; play({ f }); return; }
  if (el.dataset.src) { const s = el.dataset.src as 'N' | 'S'; sel = sel?.src === s ? null : { src: s }; render(); return; }
  if (el.dataset.f !== undefined) {
    const f = +el.dataset.f;
    if (sel) { play({ f }); return; }
    if (v.rules.houseRules && f >= 0) { inspect = inspect === f ? null : f; render(); }
    return;
  }
  if (el.dataset.w !== undefined) {
    const w = +el.dataset.w; const P = v.players[sess.me];
    if (sel && !(sel.src === 'W' && sel.w === w)) { play({ w }); return; }
    if (el.dataset.j !== undefined) { const j = +el.dataset.j; const n = P.work[w].length - j; sel = sel?.src === 'W' && sel.w === w && sel.n === n ? null : { src: 'W', w, n }; render(); }
    else { sel = null; render(); }
  }
});
app.addEventListener('contextmenu', ev => ev.preventDefault());

function play(t: { f: number } | { w: number }) {
  if (!sel) return;
  let m: Move;
  if ('f' in t) m = sel.src === 'N' ? { k: 'N2F', f: t.f } : sel.src === 'S' ? { k: 'S2F', f: t.f } : { k: 'W2F', w: sel.w, f: t.f };
  else m = sel.src === 'N' ? { k: 'N2W', w: t.w } : sel.src === 'S' ? { k: 'S2W', w: t.w } : { k: 'W2W', from: sel.w, n: sel.n, to: t.w };
  sel = null;
  sess.move(m);
  render();
}

// ?bots=steady,twitchy,river&house=1&seed=7 → autostart (local only)
if (sess.kind === 'local' && q.get('bots')) { for (const b of q.get('bots')!.split(',')) if (b) sess.addBot(b); sess.start({ houseRules: q.get('house') === '1' }, q.get('seed') ? +q.get('seed')! : undefined); }

// park the clock when hidden; re-render on return
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
render();
