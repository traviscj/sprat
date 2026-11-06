# sprat — design

Sprat (≡ Nerts / Pounce / Racing Demon). Real-time multiplayer solitaire; the interesting engineering is
not the rules but **modelling human attention** so bots lose contested plays the way people do.

## Stack decision

TypeScript everywhere, one engine module (`src/engine`) shared by:
- browser (solo vs bots, zero latency, works offline on a phone),
- node server (authoritative; `ws`),
- headless sim (10⁴× realtime; 50 three-bot rounds ≈ 0.3 s).

Rejected: FastAPI/misk backend. It would force a second rules implementation, and rules drift between
client-side prediction and server validation is the one bug class that would make the game feel wrong.
`proto/sprat.proto` is the schema of record; v1 wire is JSON with identical field names (`buf generate`
→ protobuf-es is a roadmap item, needed when the TUI/mobile clients aren't TS).

## Rules (`engine/rules.ts`)

Per Bicycle: 13-card nerts pile (top up), 4 work piles, stock flipped 3 at a time; foundations are
shared, ace-up by suit; work piles build down alternating colour, runs move as a unit, anything fills an
empty pile. Score +1/foundation card by deck, −2/nerts card left. Round ends on `NERTS` or stall
(every player has cycled their stock with no non-flip move by anyone).

Engine is a mutating `apply(state, p, move) → ok|reject`; **contested plays are resolved purely by
arrival order** at the engine — on the server, that's message order; in the sim, virtual-time order.
Recycle+flip is one action (one physical motion).

House rules (`rules.houseRules`) widen the legal set with tagged cheats:
- `skip`: same suit, gap 2–3 on a foundation (grandma skipping the 2). Pile gets `dirty`.
- `miscount`: `FLIP n≠3`.
- `CHALLENGE f`: inspect; if dirty, unwind to last clean card, return cards to owners' waste tops,
  cheater −5; if clean, challenger −2. Humans inspect by tapping a pile (shows the fan).

## Bots (`bots/`) — the attention model

A bot is a **sequential attention budget** stepped in a discrete-event loop. It never sees the whole
state; it sees whatever its gaze is on, at a cost.

- `scanOrder`: the gaze loop, e.g. `nerts→found→work→waste` vs `nerts→waste→found→work` (river rat).
- `cps`: comparisons/sec. Looking at region R costs `items(R)/cps` ms (`found` = #piles+1, `work` = 2×piles).
  This is the primary calibration knob (§Calibration): count a human's visible comparisons/sec.
- **Belief**: foundation tops are a snapshot taken when the gaze last landed on `found` (or when the bot
  played there). Everything else it owns is read live *when scanned*. Candidates are generated from
  belief, so a stale belief → attempted move → engine reject → event `stale` (nobody took it, I was
  just wrong) or `beaten` (someone landed the same rank first — the "so close" moment we're tuning for).
- `psychic ∈ [0,1]`: prob. the belief is refreshed for free at decision time. 1 = omniscient baseline.
- `motorMs` / `flipMs`: decision → landed. The window during which you can be beaten.
- Perception errors: `confusion` (rank ±1), `colorblind` (red/black), `eyestrain × pile.mess`.
- Priorities: `wFoundation` (greed), `wUnblock` (nerts progress), `patience` = penalty for burying a
  work card whose foundation is one away (keep the 3♥ singleton open when A♥ is up, even with a 2♣ in hand).
- `fixation`: when nerts top is one-away, prob. of locking gaze on that pile (polling at 1/cps) for up
  to `fixateMaxMs`, ignoring everything else. Produces the duel: two players both staring at ♥.
- Tilt: after a reject, `cps *= tiltMult` for `tiltMs`.
- Social: `slam` (salience of my placements) × other's `distract` → interrupt: they lose `stunMs` but
  refresh belief. `messy` lands on the pile → raises everyone's misread prob. Sneaking (`slam≈0`)
  keeps rivals' beliefs stale and cheats unnoticed.
- `larceny` / `miscount` / `suspicion`: cheat attempt & inspection probabilities.
- Anti-oscillation: refuses the inverse of its last W2W; shuffles into an empty pile only when it exposes
  something useful.

Presets in `bots/profile.ts`: steady, twitchy, river, builder, grandma, auditor, uncle, slammer, sneak,
psychic. `npm run sim -- --n 300 steady twitchy river` prints win%, score, rejects, beaten, stale.
`--sweep cps=3,5,8,12` applies a parameter sweep to seat 0.

Tension metric = `beaten/game` (both in sim output and the live stats panel). Current 3-bot tables run
~3/game over ~150 s rounds, which matches the feel of a family table; tune presets against that.

## Clients

- `web/`: vanilla DOM, tap-select → tap-target (no drag; works on phones). `?bots=steady,twitchy&house=1`
  autostarts local; `?ws=ws://host:8787&room=fam&name=mom` joins a server room. Stats panel = per-player
  moves/min, rejects, beaten, stale, fixations, cheats, bot gaze/tilt; event log.
- `server/`: rooms, 2–8 seats, host adds bots, reconnect by name. Redaction per recipient
  (`protocol.ts/redact`): others' nerts → top only, stock → hidden, waste → top 3.
- Driver (`sim/driver.ts`) emits identical `BotEvent`s for humans (move/reject/beaten/stale), so the
  stats panel and the calibration recorder treat people and bots uniformly.

## Calibration (roadmap, data already captured)

`Driver.log` records every attempt with `t`, `avail` (count of legal moves at that instant) — i.e. the
latency from "a play became available" to "the human took it", per region. Fit: `cps` from
median time-to-notice ÷ items in region; `scanOrder` from which region's plays get noticed first;
`patience` from how often one-away cards get buried; `motorMs` from the server's `clientMs` vs
arrival. Puzzle mode: freeze a state (`GameState` is plain JSON), show it, time the first tap.

## Strategy eval

Sweep one seat's profile against a fixed table (`--sweep`) and read score/win%. Questions to answer:
is `river` or `builder` scanOrder better vs. a given table; what `patience` maximises score; does
fixation pay. The engine is deterministic per seed, so A/B is paired.

## Roadmap

- **Hints**: `Hint{to, move}` in the proto — a player points out a play to a rival. Costs the hinter
  a scan; for a bot target it's an injected belief refresh + candidate; for a human it's a UI flash.
  Table politics: help the trailing player, or help whoever's about to block the leader.
- TUI client (node, same `Session` interface, blessed-free: raw ANSI + `readline` keys).
- Async/turn-based variant: each "turn" = N seconds of attention budget; contested plays resolved
  by a per-turn auction on declared intents. Weird but the belief model makes it tractable.
- PWA manifest + service worker for the phone.
- `buf generate` and a protobuf binary transport once a non-TS client exists.
- Bot handicap auto-tuning: given a human's measured `cps`, pick preset params so `beaten/game` ≈ 3.
