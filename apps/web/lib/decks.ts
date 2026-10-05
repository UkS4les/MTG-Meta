import 'server-only';
import {
  ARENA_STARTER_DECKS,
  cardSlug,
  classifyDeck,
  computeCoverage,
  deckFeatures,
  fromSignature,
  isFormatKey,
  isLand,
  parseCollectionText,
  parseDecklist,
  resolveCollection,
  type CardDatabase,
  type Collection,
  type DeckEntry,
  type Decklist,
  type Platform,
} from '@mtg-meta/core';
import { getCollection, listArchetypes, type Db, type User, type UserDeck } from '@mtg-meta/db';
import type { CardRef } from './cards-shared';
import { cardRef, deckLook } from './cards-view';
import { MAX_COLLECTION_BYTES } from './coverage';
import { MAX_DECK_NAME, type AnalyzedCard, type DeckAnalysis, type DeckInput, type SavedDeck } from './decks-shared';

/** Cartas diferentes por lista: cabe qualquer deck real, inclusive Commander, com folga. */
const MAX_ENTRIES = 300;
const MAX_COPIES = 250;

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Confere a lista recebida, troca cada nome pelo oficial e soma linhas repetidas. */
export function cleanEntries(value: unknown, cards: CardDatabase): DeckEntry[] {
  if (!Array.isArray(value)) return [];
  const merged = new Map<string, number>();
  for (const item of value.slice(0, MAX_ENTRIES * 2)) {
    if (!isObject(item) || typeof item.name !== 'string' || typeof item.quantity !== 'number') continue;
    const typed = item.name.trim().slice(0, 150);
    const quantity = Math.floor(item.quantity);
    if (!typed || !(quantity >= 1)) continue;
    const name = cards.get(typed)?.name ?? typed;
    merged.set(name, Math.min(MAX_COPIES, (merged.get(name) ?? 0) + quantity));
  }
  return [...merged].slice(0, MAX_ENTRIES).map(([name, quantity]) => ({ name, quantity }));
}

/** Corpo de criação ou edição de deck. Devolve a mensagem de erro em vez do deck quando algo não serve. */
export function cleanDeckInput(body: Record<string, unknown> | null, cards: CardDatabase): DeckInput | string {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return 'Dê um nome ao deck.';
  if (name.length > MAX_DECK_NAME) return `O nome pode ter no máximo ${MAX_DECK_NAME} caracteres.`;
  const main = cleanEntries(body?.main, cards);
  if (main.length === 0) return 'O deck está vazio: adicione pelo menos uma carta.';
  const format = typeof body?.format === 'string' && isFormatKey(body.format) ? body.format : null;
  return { name, format, main, sideboard: cleanEntries(body?.sideboard, cards) };
}

function coverOf(main: DeckEntry[], cards: CardDatabase): CardRef | null {
  const look = deckLook(main.map((e) => [e.name, e.quantity]), cards, 1);
  if (look.cards[0]) return look.cards[0];
  // Deck só de terrenos (ou de cartas desconhecidas): ilustra com a primeira que tiver imagem.
  const any = main.find((e) => cards.get(e.name)?.imageId);
  return any ? cardRef(any.name, cards) : null;
}

export function toSavedDeck(deck: UserDeck, cards: CardDatabase): SavedDeck {
  const { colors } = deckLook(deck.main.map((e) => [e.name, e.quantity]), cards, 0);
  return { ...deck, colors, cover: coverOf(deck.main, cards) };
}

/** Os decks iniciais do Arena no formato da lista de decks. Sem formato: nem todos são válidos no Standard atual. */
export function starterDecks(cards: CardDatabase): SavedDeck[] {
  return ARENA_STARTER_DECKS.map((deck) => ({
    ...toSavedDeck({ id: `inicial-${cardSlug(deck.name)}`, name: deck.name, format: null, main: deck.main, sideboard: [], updatedAt: '' }, cards),
    subtitle: deck.namePt,
  }));
}

export interface AnalyzeInput {
  main: DeckEntry[];
  sideboard: DeckEntry[];
  ignoredLines: number;
  format: string | null;
  platform: Platform;
  /** Texto da coleção guardada no navegador, se veio. */
  collectionText: string | null;
}

/** Lê o corpo de /api/decks/analisar. Devolve a mensagem de erro quando algo não serve. */
export function readAnalyzeInput(body: Record<string, unknown> | null, platform: Platform, cards: CardDatabase): AnalyzeInput | string {
  const collectionText = typeof body?.colecao === 'string' ? body.colecao : null;
  if (collectionText && collectionText.length > MAX_COLLECTION_BYTES) return 'Coleção grande demais (limite de 5 MB).';
  const format = typeof body?.formato === 'string' && isFormatKey(body.formato) ? body.formato : null;

  if (typeof body?.texto === 'string') {
    if (body.texto.length > 100_000) return 'Lista grande demais.';
    const parsed = parseDecklist(body.texto);
    return {
      // O comandante entra no main: o editor não tem uma área separada para ele.
      main: cleanEntries([...parsed.commander, ...parsed.main], cards),
      sideboard: cleanEntries(parsed.sideboard, cards),
      ignoredLines: parsed.warnings.length,
      format,
      platform,
      collectionText,
    };
  }
  return { main: cleanEntries(body?.main, cards), sideboard: cleanEntries(body?.sideboard, cards), ignoredLines: 0, format, platform, collectionText };
}

export async function analyzeDeck(db: Db, cards: CardDatabase, user: User | null, input: AnalyzeInput): Promise<DeckAnalysis> {
  let collection: Collection | null = null;
  if (input.collectionText) collection = resolveCollection(parseCollectionText(input.collectionText).entries, cards).collection;
  else if (user) collection = await getCollection(db, user.id, input.platform);
  if (collection && collection.size === 0) collection = null;

  const describe = (entry: DeckEntry): AnalyzedCard => {
    const card = cards.get(entry.name);
    return {
      name: card?.name ?? entry.name,
      imageId: card?.imageId ?? null,
      quantity: entry.quantity,
      known: card !== undefined,
      land: card ? isLand(card) : false,
      owned: collection && card ? (card.freeBasic ? entry.quantity : (collection.get(card.name) ?? 0)) : null,
    };
  };

  const deck: Decklist = { name: '', main: input.main, sideboard: input.sideboard, commander: [], warnings: [] };
  const result = collection && input.main.length > 0 ? computeCoverage(deck, collection, cards, { platform: input.platform }) : null;

  let archetype: DeckAnalysis['archetype'] = null;
  if (input.format && input.main.length > 0) {
    const options = (await listArchetypes(db, input.format)).map((a) => ({ id: { id: a.id, name: a.name, format: a.format }, features: fromSignature(a.signature) }));
    archetype = classifyDeck(deckFeatures(deck, cards), options)?.id ?? null;
  }

  return {
    main: input.main.map(describe),
    sideboard: input.sideboard.map(describe),
    colors: deckLook(input.main.map((e) => [e.name, e.quantity]), cards, 0).colors,
    cover: coverOf(input.main, cards),
    unknown: [...new Set([...input.main, ...input.sideboard].filter((e) => !cards.get(e.name)).map((e) => e.name))],
    ignoredLines: input.ignoredLines,
    archetype,
    coverage: result && {
      coverage: result.coverage,
      missingCopies: result.missing.reduce((total, m) => total + m.missing, 0),
      wildcards: result.wildcards,
      costUsd: result.costUsd,
      unpriced: result.unpricedMissing.length,
      notOnArena: result.notOnArena,
    },
  };
}
