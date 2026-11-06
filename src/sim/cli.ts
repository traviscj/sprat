// usage: npm run sim -- [--n 200] [--seed 1] [--house] steady twitchy river
//        npm run sim -- --sweep cps=3,5,8,12 steady steady steady
import { PRESETS, profile, type BotProfile } from '../bots/profile.ts';
import { DEFAULT_RULES } from '../engine/state.ts';
import { Driver } from './driver.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const flag = (k: string) => args.includes(`--${k}`);
const names = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['house', 'quiet'].includes(args[i - 1].slice(2))));
const N = +opt('n', '200'), seed0 = +opt('seed', '1');
const rules = { ...DEFAULT_RULES, houseRules: flag('house') };

export interface Agg { wins: number; score: number; moves: number; rejects: number; beaten: number; stale: number; cheats: number; nertsLeft: number; flips: number }
export function runMany(profs: BotProfile[], n: number, seed = 1) {
  const agg: Agg[] = profs.map(() => ({ wins: 0, score: 0, moves: 0, rejects: 0, beaten: 0, stale: 0, cheats: 0, nertsLeft: 0, flips: 0 }));
  let dur = 0, contested = 0, stalls = 0;
  for (let g = 0; g < n; g++) {
    const d = new Driver(profs.map((p, i) => ({ id: `b${i}`, name: p.name, bot: p })), rules, seed + g);
    const s = d.runVirtual();
    dur += d.now;
    if (s.caller < 0) stalls++;
    const best = Math.max(...s.players.map(P => P.score));
    s.players.forEach((P, i) => {
      const b = d.bots.get(i)!;
      const a = agg[i];
      a.score += P.score; a.moves += b.n.moves; a.rejects += b.n.rejects; a.beaten += b.n.beaten; a.stale += b.n.stale; a.cheats += b.n.cheats; a.nertsLeft += P.nerts.length; a.flips += b.n.flips;
      if (P.score === best) a.wins++;
    });
    contested += d.events.filter(e => e.k === 'beaten').length;
  }
  return { agg, dur: dur / n, contested: contested / n, stalls };
}

function table(profs: BotProfile[], r: ReturnType<typeof runMany>, n: number) {
  const f = (x: number, w = 7, d = 1) => x.toFixed(d).padStart(w);
  console.log(`games=${n} avgdur=${(r.dur / 1000).toFixed(1)}s beaten/game=${r.contested.toFixed(2)} stalls=${r.stalls}`);
  console.log('bot        cps  motor  win%   score  moves  flips   rej  beaten  stale  nerts  cheat');
  profs.forEach((p, i) => {
    const a = r.agg[i];
    console.log(`${p.name.padEnd(10)}${f(p.cps, 4, 0)}${f(p.motorMs, 7, 0)}${f(100 * a.wins / n, 6, 0)}${f(a.score / n, 8)}${f(a.moves / n, 7, 0)}${f(a.flips / n, 7, 0)}${f(a.rejects / n, 6)}${f(a.beaten / n, 8, 2)}${f(a.stale / n, 7, 2)}${f(a.nertsLeft / n, 7)}${f(a.cheats / n, 7, 2)}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sweep = opt('sweep', '');
  const base = names.length ? names : ['steady', 'twitchy', 'river'];
  if (sweep) {
    const [k, vals] = sweep.split('=');
    for (const v of vals.split(',')) {
      const profs = base.map((nm, i) => profile(nm, i === 0 ? { [k]: +v, name: `${nm}*` } : {}));
      console.log(`\n--- ${k}=${v} (applied to seat 0) ---`);
      table(profs, runMany(profs, N, seed0), N);
    }
  } else {
    const profs = base.map(nm => { if (!PRESETS[nm]) { console.error(`unknown preset ${nm}; have ${Object.keys(PRESETS).join(',')}`); process.exit(1); } return profile(nm); });
    table(profs, runMany(profs, N, seed0), N);
  }
}
