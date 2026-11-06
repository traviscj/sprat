// Card = integer id. deck*52 + suit*13 + (rank-1).
// suits: 0=♥ 1=♦ 2=♣ 3=♠   (0,1 red; 2,3 black)   ranks: 1=A .. 13=K
export type Card = number;

export const SUITS = ['♥', '♦', '♣', '♠'] as const;
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export const deckOf = (c: Card) => (c / 52) | 0;
export const suitOf = (c: Card) => ((c % 52) / 13) | 0;
export const rankOf = (c: Card) => (c % 13) + 1;
export const isRed = (c: Card) => suitOf(c) < 2;
export const mk = (deck: number, suit: number, rank: number): Card => deck * 52 + suit * 13 + rank - 1;
export const str = (c: Card) => `${RANKS[rankOf(c) - 1]}${SUITS[suitOf(c)]}`;
export const strD = (c: Card) => `${str(c)}/${deckOf(c)}`;

/** mulberry32 — small seeded PRNG, good enough for shuffles & bot dice. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffledDeck(deck: number, rand: () => number): Card[] {
  const d: Card[] = [];
  for (let i = 0; i < 52; i++) d.push(deck * 52 + i);
  for (let i = 51; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
