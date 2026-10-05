import 'server-only';
import { COLORS, normalizeName, type CardDatabase, type CardInfo, type Color, type Rarity } from '@mtg-meta/core';

export const PAGE_SIZE = 60;

export const CARD_TYPES = {
  creature: 'Criatura',
  instant: 'Mágica instantânea',
  sorcery: 'Feitiço',
  artifact: 'Artefato',
  enchantment: 'Encantamento',
  planeswalker: 'Planeswalker',
  land: 'Terreno',
  battle: 'Batalha',
} as const;
export type CardType = keyof typeof CARD_TYPES;

export const SORTS = { nome: 'Nome', 'preco-maior': 'Mais caras', 'preco-menor': 'Mais baratas' } as const;
export type Sort = keyof typeof SORTS;

const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'mythic'];

export interface CardFilters {
  query: string;
  colors: Color[];
  type: CardType | null;
  rarity: Rarity | null;
  /** Só cartas que existem no Arena. */
  arena: boolean;
  sort: Sort;
  page: number;
}

type Param = string | string[] | undefined;
const first = (value: Param) => (Array.isArray(value) ? value[0] : value) ?? '';
const list = (value: Param) => (Array.isArray(value) ? value : value ? [value] : []);

/** Lê os filtros do endereço; qualquer valor fora do esperado vira o padrão. */
export function readFilters(params: Record<string, Param>): CardFilters {
  const chosen = list(params.cor).join('').toUpperCase();
  const type = first(params.tipo);
  const rarity = first(params.raridade);
  const sort = first(params.ordenar);
  const page = Number.parseInt(first(params.pagina), 10);
  return {
    query: first(params.q).trim().slice(0, 80),
    colors: COLORS.filter((color) => chosen.includes(color)),
    type: Object.hasOwn(CARD_TYPES, type) ? (type as CardType) : null,
    rarity: RARITIES.includes(rarity as Rarity) ? (rarity as Rarity) : null,
    arena: first(params.arena) === '1',
    sort: Object.hasOwn(SORTS, sort) ? (sort as Sort) : 'nome',
    page: Number.isFinite(page) && page >= 1 && page <= 10_000 ? page : 1,
  };
}

/** O mesmo conjunto de filtros como endereço, com a página trocada. Só entram os que diferem do padrão. */
export function filtersUrl(filters: CardFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.query) params.set('q', filters.query);
  for (const color of filters.colors) params.append('cor', color);
  if (filters.type) params.set('tipo', filters.type);
  if (filters.rarity) params.set('raridade', filters.rarity);
  if (filters.arena) params.set('arena', '1');
  if (filters.sort !== 'nome') params.set('ordenar', filters.sort);
  if (page > 1) params.set('pagina', String(page));
  const text = params.toString();
  return text ? `/cartas?${text}` : '/cartas';
}

export interface BrowseResult {
  cards: CardInfo[];
  total: number;
  pages: number;
}

export function browseCards(db: CardDatabase, filters: CardFilters): BrowseResult {
  const text = normalizeName(filters.query);
  const typeWord = filters.type && filters.type[0]!.toUpperCase() + filters.type.slice(1);
  let matches = db.all.filter((card) => {
    // Só cartas que alguém pode ter: fora ficam as que não existem nem em papel nem no Arena.
    if (card.paperRarity === null && card.arenaRarity === null) return false;
    // Cartas de brincadeira com o nome em branco ("_____") só atrapalham a lista.
    if (card.name.startsWith('_')) return false;
    if (filters.arena && card.arenaRarity === null) return false;
    if (filters.rarity && (card.paperRarity ?? card.arenaRarity) !== filters.rarity) return false;
    if (typeWord && !card.typeLine.includes(typeWord)) return false;
    // Mesma regra dos decks: a carta "cabe" se todas as cores dela estão entre as escolhidas.
    if (filters.colors.length > 0 && !(card.colors ?? []).every((color) => filters.colors.includes(color))) return false;
    if (text && !normalizeName(card.name).includes(text) && !(card.text ?? '').toLowerCase().includes(text) && !card.typeLine.toLowerCase().includes(text)) return false;
    return true;
  });

  if (filters.sort !== 'nome') {
    const direction = filters.sort === 'preco-maior' ? -1 : 1;
    // Cartas sem preço vão para o fim nas duas ordens.
    matches = matches
      .filter((card) => card.priceUsd !== null)
      .sort((a, b) => direction * (a.priceUsd! - b.priceUsd!) || a.name.localeCompare(b.name))
      .concat(matches.filter((card) => card.priceUsd === null));
  }

  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  return { cards: matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: matches.length, pages };
}
