import type { CardDatabase } from './card-db.ts';
import { normalizeName } from './normalize.ts';
import type { CardInfo, Collection, Decklist, Platform, Rarity } from './types.ts';
import { RARITIES } from './types.ts';

export interface MissingCard {
  name: string;
  needed: number;
  owned: number;
  missing: number;
  /** Raridade relevante para a plataforma (curinga no Arena). null = desconhecida ou fora do Arena. */
  rarity: Rarity | null;
  unitPriceUsd: number | null;
}

export interface DeckCoverage {
  deck: Decklist;
  /** Cópias que o deck pede (main + sideboard + comandante), sem contar terrenos básicos grátis. */
  cardsNeeded: number;
  /** Quantas dessas cópias a coleção já cobre. */
  cardsOwned: number;
  /** cardsOwned / cardsNeeded, de 0 a 1. */
  coverage: number;
  missing: MissingCard[];
  /** Curingas necessários no Arena, por raridade. */
  wildcards: Record<Rarity, number>;
  /** Custo em USD para completar no papel (só cartas com preço conhecido). */
  costUsd: number;
  /** Cartas faltando sem preço no Scryfall: o custo real é maior que costUsd. */
  unpricedMissing: string[];
  /** Cartas do deck que não existem no Arena (o deck não pode ser montado lá). */
  notOnArena: string[];
  /** Nomes que não estão no banco de cartas (erro de digitação ou carta nova). */
  unknown: string[];
}

export interface CoverageOptions {
  platform: Platform;
}

interface Demand {
  name: string;
  card: CardInfo | undefined;
  quantity: number;
}

/** Soma o que o deck pede de cada carta. No Magic, o limite de 4 cópias vale para main + sideboard juntos. */
function deckDemand(deck: Decklist, db: CardDatabase): Demand[] {
  const demand = new Map<string, Demand>();
  for (const entry of [...deck.main, ...deck.sideboard, ...deck.commander]) {
    const card = db.get(entry.name);
    const key = card ? card.name : `?${normalizeName(entry.name)}`;
    const current = demand.get(key);
    if (current) current.quantity += entry.quantity;
    else demand.set(key, { name: card?.name ?? entry.name, card, quantity: entry.quantity });
  }
  return [...demand.values()];
}

/** Arena: curingas mais caros primeiro (sem raridade conhecida conta como mítica). */
function byRarity(a: MissingCard, b: MissingCard): number {
  return (
    RARITIES.indexOf(b.rarity ?? 'mythic') - RARITIES.indexOf(a.rarity ?? 'mythic') ||
    b.missing - a.missing ||
    a.name.localeCompare(b.name)
  );
}

/** Papel: o que pesa mais no bolso primeiro; cartas sem preço no topo, porque o custo delas é incerto. */
function byCost(a: MissingCard, b: MissingCard): number {
  const total = (m: MissingCard) => (m.unitPriceUsd === null ? Number.POSITIVE_INFINITY : m.missing * m.unitPriceUsd);
  return total(b) - total(a) || a.name.localeCompare(b.name);
}

function emptyWildcards(): Record<Rarity, number> {
  return { common: 0, uncommon: 0, rare: 0, mythic: 0 };
}

export function computeCoverage(
  deck: Decklist,
  collection: Collection,
  db: CardDatabase,
  options: CoverageOptions,
): DeckCoverage {
  const result: DeckCoverage = {
    deck,
    cardsNeeded: 0,
    cardsOwned: 0,
    coverage: 1,
    missing: [],
    wildcards: emptyWildcards(),
    costUsd: 0,
    unpricedMissing: [],
    notOnArena: [],
    unknown: [],
  };
  const arena = options.platform === 'arena';

  for (const { name, card, quantity } of deckDemand(deck, db)) {
    if (!card) {
      result.unknown.push(name);
      result.cardsNeeded += quantity;
      result.missing.push({ name, needed: quantity, owned: 0, missing: quantity, rarity: null, unitPriceUsd: null });
      continue;
    }
    if (card.freeBasic) continue;
    if (arena && card.arenaRarity === null) result.notOnArena.push(card.name);

    const ownedCopies = collection.get(card.name) ?? 0;
    // No Arena, ter 4 cópias de uma carta "qualquer número" libera cópias ilimitadas.
    const effectiveOwned = arena && card.anyNumber && ownedCopies >= 4 ? quantity : ownedCopies;
    const covered = Math.min(effectiveOwned, quantity);
    const missing = quantity - covered;

    result.cardsNeeded += quantity;
    result.cardsOwned += covered;
    if (missing === 0) continue;

    const rarity = arena ? card.arenaRarity : card.paperRarity;
    result.missing.push({ name: card.name, needed: quantity, owned: ownedCopies, missing, rarity, unitPriceUsd: card.priceUsd });
    if (arena && rarity) result.wildcards[rarity] += missing;
    if (card.priceUsd === null) result.unpricedMissing.push(card.name);
    else result.costUsd += missing * card.priceUsd;
  }

  result.coverage = result.cardsNeeded === 0 ? 1 : result.cardsOwned / result.cardsNeeded;
  result.costUsd = Math.round(result.costUsd * 100) / 100;
  result.missing.sort(arena ? byRarity : byCost);
  return result;
}

export type SortBy = 'coverage' | 'cost';

/**
 * Compara o "esforço" para completar: no Arena, curingas míticos primeiro, depois raros etc.
 * (são o gargalo); no papel, o custo em dólar.
 */
function compareEffort(a: DeckCoverage, b: DeckCoverage, platform: Platform): number {
  if (platform === 'arena') {
    for (const rarity of [...RARITIES].reverse()) {
      const diff = a.wildcards[rarity] - b.wildcards[rarity];
      if (diff !== 0) return diff;
    }
    return 0;
  }
  return a.costUsd - b.costUsd;
}

/** Calcula a cobertura de vários decks e ordena: maior cobertura primeiro, ou menor esforço para completar. */
export function rankDecks(
  decks: Decklist[],
  collection: Collection,
  db: CardDatabase,
  options: CoverageOptions & { sortBy?: SortBy },
): DeckCoverage[] {
  const results = decks.map((deck) => computeCoverage(deck, collection, db, options));
  const playable = (r: DeckCoverage) => (options.platform === 'arena' && r.notOnArena.length > 0 ? 1 : 0);

  return results.sort((a, b) => {
    const byPlayable = playable(a) - playable(b);
    if (byPlayable !== 0) return byPlayable;
    if (options.sortBy === 'cost') {
      return compareEffort(a, b, options.platform) || b.coverage - a.coverage;
    }
    return b.coverage - a.coverage || compareEffort(a, b, options.platform);
  });
}
