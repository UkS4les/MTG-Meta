import type { CardInfo, Rarity } from './types.ts';
import { RARITIES } from './types.ts';

/** Só os campos do objeto Card do Scryfall que o motor usa. */
export interface ScryfallCard {
  id: string;
  oracle_id?: string;
  arena_id?: number;
  name: string;
  lang?: string;
  /** Nome impresso quando difere do oficial (cartas renomeadas no MTGO/Arena, outros idiomas). */
  printed_name?: string;
  /** Nome de fantasia impresso no lugar do oficial (ex.: série Godzilla). */
  flavor_name?: string;
  layout: string;
  rarity: string;
  games?: string[];
  set_type?: string;
  type_line?: string;
  oracle_text?: string;
  prices?: { usd?: string | null; usd_foil?: string | null; usd_etched?: string | null };
  card_faces?: { name: string; printed_name?: string; flavor_name?: string; oracle_id?: string; type_line?: string; oracle_text?: string }[];
}

/** Layouts que não são cartas jogáveis em deck (tokens, emblemas, cartas de arte...). */
const SKIP_LAYOUTS = new Set([
  'token',
  'double_faced_token',
  'emblem',
  'art_series',
  'planar',
  'scheme',
  'vanguard',
]);

/** Tipos de coleção que não são impressões normais (cartas oversized, decks de campeonato com borda dourada...). */
const SKIP_SET_TYPES = new Set(['token', 'memorabilia']);

const ANY_NUMBER_TEXT = 'a deck can have any number of cards named';

function toRarity(scryfallRarity: string): Rarity | null {
  switch (scryfallRarity) {
    case 'common':
    case 'uncommon':
    case 'rare':
    case 'mythic':
      return scryfallRarity;
    case 'special':
      return 'rare';
    case 'bonus':
      return 'mythic';
    default:
      return null;
  }
}

function lowerRarity(a: Rarity | null, b: Rarity | null): Rarity | null {
  if (a === null) return b;
  if (b === null) return a;
  return RARITIES.indexOf(a) <= RARITIES.indexOf(b) ? a : b;
}

function parsePrice(card: ScryfallCard): number | null {
  const raw = card.prices?.usd ?? card.prices?.usd_foil ?? card.prices?.usd_etched ?? null;
  if (raw === null || raw === undefined) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Agrupa as impressões do bulk "Default Cards" do Scryfall em uma CardInfo por carta oracle.
 * Recebe as cartas uma a uma (streaming), porque o arquivo tem centenas de MB.
 */
export class ScryfallAggregator {
  private readonly byOracle = new Map<string, CardInfo>();
  skipped = 0;

  add(card: ScryfallCard): void {
    if (SKIP_LAYOUTS.has(card.layout) || (card.set_type && SKIP_SET_TYPES.has(card.set_type))) {
      this.skipped++;
      return;
    }
    const key = card.oracle_id ?? card.card_faces?.[0]?.oracle_id ?? card.name;
    const games = card.games ?? [];
    const rarity = toRarity(card.rarity);
    const onArena = games.includes('arena');
    const onPaper = games.includes('paper');
    const price = onPaper ? parsePrice(card) : null;

    let info = this.byOracle.get(key);
    if (!info) {
      const typeLine = card.type_line ?? card.card_faces?.map((f) => f.type_line ?? '').join(' // ') ?? '';
      const texts = [card.oracle_text ?? '', ...(card.card_faces ?? []).map((f) => f.oracle_text ?? '')];
      const faceNames = [...new Set((card.card_faces ?? []).map((f) => f.name))].filter((n) => n !== card.name);
      info = {
        name: card.name,
        faceNames,
        typeLine,
        // "Basic Snow Land" não é grátis no Arena, então só "Basic Land" conta.
        freeBasic: typeLine.startsWith('Basic Land'),
        anyNumber: texts.some((t) => t.toLowerCase().includes(ANY_NUMBER_TEXT)),
        arenaRarity: null,
        paperRarity: null,
        priceUsd: null,
      };
      this.byOracle.set(key, info);
    }

    // Só impressões em inglês: nomes traduzidos não aparecem em decklists.
    if (!card.lang || card.lang === 'en') {
      const known = new Set([info.name, ...info.faceNames, ...(info.aliases ?? [])]);
      for (const source of [card, ...(card.card_faces ?? [])]) {
        for (const alias of [source.printed_name, source.flavor_name]) {
          if (!alias || known.has(alias)) continue;
          known.add(alias);
          (info.aliases ??= []).push(alias);
        }
      }
    }

    if (card.arena_id && !info.arenaIds?.includes(card.arena_id)) (info.arenaIds ??= []).push(card.arena_id);
    if (onArena) info.arenaRarity = lowerRarity(info.arenaRarity, rarity);
    if (onPaper) info.paperRarity = lowerRarity(info.paperRarity, rarity);
    if (price !== null && (info.priceUsd === null || price < info.priceUsd)) info.priceUsd = price;
  }

  result(): CardInfo[] {
    return [...this.byOracle.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}

export function buildCardsFromScryfall(cards: Iterable<ScryfallCard>): CardInfo[] {
  const aggregator = new ScryfallAggregator();
  for (const card of cards) aggregator.add(card);
  return aggregator.result();
}
