export type Region = 'nerts' | 'found' | 'work' | 'waste';

/**
 * A bot is an attention budget spent sequentially over regions of the table.
 * Time costs are in ms; probabilities in [0,1]. See DESIGN.md §Bots.
 */
export interface BotProfile {
  name: string;
  scanOrder: Region[];    // the gaze loop. e.g. nerts→found→work→waste
  cps: number;            // comparisons per second (perception throughput)
  motorMs: number;        // physically moving a card (decision → landed)
  flipMs: number;         // one 3-card flip
  jitter: number;         // multiplicative timing noise, 0..1
  psychic: number;        // prob. foundation belief is refreshed at decision time (0 = honest fog of war)
  colorblind: number;     // prob. a red/black comparison is botched
  confusion: number;      // prob. a rank is misread ±1
  wFoundation: number;    // bonus for foundation plays (greed)
  wUnblock: number;       // bonus for anything that moves the nerts pile
  patience: number;       // penalty for burying a work-pile card whose foundation is one away
  fixation: number;       // prob. of locking gaze on a wanted foundation when nerts top is one away
  fixateMaxMs: number;    // how long they'll stare before giving up
  tiltMult: number;       // cps multiplier after a rejected move (<1 = flustered)
  tiltMs: number;         // how long the tilt lasts
  rescan: boolean;        // after a successful move, restart loop at scanOrder[0]
  larceny: number;        // houseRules: prob. of attempting a cheat when one is available
  suspicion: number;      // houseRules: prob. per found-scan of inspecting a pile for gaps
  miscount: number;       // houseRules: prob. of a "miscounted" flip (2 or 4) when it helps the nerts top
  slam: number;           // salience of my placements, 0 (sneak) .. 1 (slam). Others notice ∝ slam×their distract
  messy: number;          // how illegible I leave a pile (0..1); readers add messy×eyestrain to misread prob
  distract: number;       // my susceptibility to others' slams (0..1); an interrupt costs stunMs and refreshes belief
  stunMs: number;         // time lost per interrupt
  eyestrain: number;      // multiplier on pile mess → my misread prob
}

const base: BotProfile = {
  name: 'base', scanOrder: ['nerts', 'found', 'work', 'waste'],
  cps: 6, motorMs: 550, flipMs: 700, jitter: 0.25, psychic: 0,
  colorblind: 0, confusion: 0, wFoundation: 10, wUnblock: 20, patience: 8,
  fixation: 0.3, fixateMaxMs: 4000, tiltMult: 0.6, tiltMs: 1500, rescan: true,
  larceny: 0, suspicion: 0, miscount: 0,
  slam: 0.4, messy: 0.2, distract: 0.5, stunMs: 350, eyestrain: 0.15,
};

export const PRESETS: Record<string, BotProfile> = {
  base,
  // Calm, deliberate; watches foundations constantly; rarely misses, never rushes.
  steady: { ...base, name: 'steady', cps: 5, motorMs: 600, fixation: 0.5, tiltMult: 0.9, tiltMs: 500 },
  // Fast hands, sloppy eyes: high cps but misreads; tilts hard.
  twitchy: { ...base, name: 'twitchy', slam: 0.8, messy: 0.5, distract: 0.8, cps: 11, motorMs: 350, flipMs: 420, confusion: 0.06, colorblind: 0.03, tiltMult: 0.4, tiltMs: 2500, fixation: 0.15, patience: 2 },
  // Stock-churner: scans waste first, lives in the river, ignores work-pile engineering.
  river: { ...base, name: 'river', scanOrder: ['nerts', 'waste', 'found', 'work'], flipMs: 450, patience: 0, wFoundation: 14 },
  // Builder: works the tableau, high patience, slower loop.
  builder: { ...base, name: 'builder', scanOrder: ['nerts', 'work', 'found', 'waste'], patience: 20, cps: 5, fixation: 0.1 },
  // Grandma. Slow, kind, larcenous.
  grandma: { ...base, name: 'grandma', slam: 0.1, cps: 3.5, motorMs: 900, flipMs: 1100, jitter: 0.4, fixation: 0.6, fixateMaxMs: 8000, larceny: 0.35, miscount: 0.3, suspicion: 0.02, tiltMult: 0.95 },
  // The cop. Slow, but inspects piles.
  auditor: { ...base, name: 'auditor', cps: 4.5, suspicion: 0.25, larceny: 0 },
  // Colorblind uncle.
  uncle: { ...base, name: 'uncle', colorblind: 0.25, cps: 6 },
  // Table-slammer: loud, messy, distracting; immune to others' noise.
  slammer: { ...base, name: 'slammer', slam: 1, messy: 0.8, distract: 0.1, cps: 7, motorMs: 450 },
  // Sneak: silent placements, nobody sees it coming; grandma's apprentice.
  sneak: { ...base, name: 'sneak', slam: 0.05, messy: 0, distract: 0.6, larceny: 0.2 },
  // Omniscient speed demon — the thing we're handicapping *away* from. Baseline for strategy eval.
  psychic: { ...base, name: 'psychic', cps: 40, motorMs: 120, flipMs: 150, jitter: 0.05, psychic: 1, tiltMult: 1, fixation: 0 },
};

export const profile = (name: string, over: Partial<BotProfile> = {}): BotProfile => ({ ...(PRESETS[name] ?? base), ...over, name: over.name ?? name });
