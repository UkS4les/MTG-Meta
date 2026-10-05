import 'server-only';
import {
  classifyDeck,
  classifyPartial,
  deckFeatures,
  describeQueue,
  fromSignature,
  isLand,
  type ArenaDeck,
  type ArenaDeckCard,
  type ArenaMatch,
  type CardDatabase,
  type DeckEntry,
  type Features,
  type MatchResult,
} from '@mtg-meta/core';
import { listArchetypes, type ArchetypeRef, type Db, type MatchDeck, type MatchRecord } from '@mtg-meta/db';

/** Mais do que alguém joga em anos; acima disso o envio é erro ou abuso. */
export const MAX_MATCHES = 5000;
const MAX_CARDS = 400;

const RESULTS: readonly MatchResult[] = ['win', 'loss', 'draw'];
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const smallInt = (value: unknown, max: number): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max ? value : null);

function cleanCards(value: unknown): ArenaDeckCard[] {
  if (!Array.isArray(value)) return [];
  const cards: ArenaDeckCard[] = [];
  for (const item of value.slice(0, MAX_CARDS)) {
    if (!isObject(item)) continue;
    const arenaId = smallInt(item.arenaId, 10_000_000);
    const quantity = smallInt(item.quantity, 1000);
    if (arenaId && quantity) cards.push({ arenaId, quantity });
  }
  return cards;
}

function cleanDeck(value: unknown): ArenaDeck | null {
  if (!isObject(value)) return null;
  const main = cleanCards(value.main);
  if (main.length === 0) return null;
  return {
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 120) : null,
    main,
    sideboard: cleanCards(value.sideboard),
    commander: cleanCards(value.commander),
  };
}

/**
 * O leitor do log roda no navegador, então o que chega aqui é dado de fora:
 * tudo é conferido campo a campo, e o que não tiver a forma esperada é descartado.
 */
export function cleanMatches(value: unknown): ArenaMatch[] | null {
  if (!Array.isArray(value) || value.length > MAX_MATCHES) return null;
  const matches = new Map<string, ArenaMatch>();
  for (const item of value) {
    if (!isObject(item)) continue;
    const { id, eventId, startedAt, result } = item;
    const gamesWon = smallInt(item.gamesWon, 99);
    const gamesLost = smallInt(item.gamesLost, 99);
    if (typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id) || typeof eventId !== 'string' || !/^[\w .:-]{1,80}$/.test(eventId)) continue;
    if (!RESULTS.includes(result as MatchResult) || gamesWon === null || gamesLost === null) continue;
    const started = typeof startedAt === 'string' ? new Date(startedAt) : null;
    matches.set(id, {
      id,
      eventId,
      startedAt: started && !Number.isNaN(started.getTime()) ? started.toISOString() : null,
      result: result as MatchResult,
      gamesWon,
      gamesLost,
      onPlay: typeof item.onPlay === 'boolean' ? item.onPlay : null,
      deck: cleanDeck(item.deck),
      opponentCards: Array.isArray(item.opponentCards)
        ? [...new Set(item.opponentCards.slice(0, MAX_CARDS).filter((c): c is number => smallInt(c, 10_000_000) !== null && c > 0))]
        : [],
    });
  }
  return [...matches.values()];
}

interface Known {
  ref: ArchetypeRef;
  features: Features;
}

function toEntries(cards: ArenaDeckCard[], db: CardDatabase): DeckEntry[] {
  const merged = new Map<string, number>();
  for (const card of cards) {
    // Carta nova demais para o banco de cartas: aparece pelo número até a próxima atualização.
    const name = db.getByArenaId(card.arenaId)?.name ?? `Carta #${card.arenaId}`;
    merged.set(name, (merged.get(name) ?? 0) + card.quantity);
  }
  return [...merged].map(([name, quantity]) => ({ name, quantity }));
}

/** Troca os números do Arena por nomes de cartas e reconhece os arquétipos dos dois lados. */
export async function enrichMatches(db: Db, cards: CardDatabase, matches: readonly ArenaMatch[]): Promise<MatchRecord[]> {
  const byFormat = new Map<string, Known[]>();
  const archetypesOf = async (format: string): Promise<Known[]> => {
    let known = byFormat.get(format);
    if (!known) {
      known = (await listArchetypes(db, format)).map((a) => ({ ref: { id: a.id, name: a.name, format }, features: fromSignature(a.signature) }));
      byFormat.set(format, known);
    }
    return known;
  };

  const records: MatchRecord[] = [];
  for (const match of matches) {
    const { metaFormat } = describeQueue(match.eventId);
    const known = metaFormat ? await archetypesOf(metaFormat) : [];
    const options = known.map((k) => ({ id: k.ref, features: k.features }));

    const deck: MatchDeck | null = match.deck && {
      main: toEntries(match.deck.main, cards),
      sideboard: toEntries(match.deck.sideboard, cards),
      commander: toEntries(match.deck.commander, cards),
    };
    const own = deck ? classifyDeck(deckFeatures({ name: '', ...deck, warnings: [] }, cards), options) : null;

    const seen = match.opponentCards.map((id) => cards.getByArenaId(id)).filter((card) => card !== undefined);
    const guess = classifyPartial(seen.filter((card) => !isLand(card)).map((card) => card.name), options);

    records.push({
      id: match.id,
      eventId: match.eventId,
      startedAt: match.startedAt,
      result: match.result,
      gamesWon: match.gamesWon,
      gamesLost: match.gamesLost,
      onPlay: match.onPlay,
      deckName: match.deck?.name ?? null,
      deck,
      deckArchetype: own?.id ?? null,
      opponentCards: [...new Set(seen.map((card) => card.name))].sort((a, b) => a.localeCompare(b)),
      opponentArchetype: guess ? { ...guess.id, confidence: Math.round(guess.score * 100) / 100 } : null,
    });
  }
  return records;
}
