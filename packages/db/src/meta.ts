import type { DeckEntry, Decklist, Signature } from '@mtg-meta/core';
import type { Db } from './client.ts';
import { PLATFORM_MTGO, type MetaPeriod } from './decks.ts';

export interface MetaRow {
  /** null = decks que o classificador não encaixou em nenhum arquétipo. */
  archetypeId: number | null;
  name: string | null;
  autoNamed: boolean;
  decks: number;
  /** De 0 a 1. */
  share: number;
  /** Carta → média de cópias; vazio na linha dos decks sem arquétipo. */
  signature: Signature;
}

export async function getMeta(db: Db, format: string, period: MetaPeriod): Promise<MetaRow[]> {
  const rows = await db.query<{ archetype_id: number | null; name: string | null; auto_named: boolean | null; decks: number; share: number; signature: Signature | null }>(
    `select s.archetype_id, a.name, a.auto_named, s.decks, s.share, a.signature
     from meta_snapshots s left join archetypes a on a.id = s.archetype_id
     where s.format = $1 and s.platform = $2 and s.period_days = $3
     order by (s.archetype_id is null), s.decks desc, a.name`,
    [format, PLATFORM_MTGO, period],
  );
  return rows.map((r) => ({ archetypeId: r.archetype_id, name: r.name, autoNamed: r.auto_named ?? false, decks: r.decks, share: r.share, signature: r.signature ?? {} }));
}

export interface FormatStatus {
  events: number;
  results: number;
  lastEventDate: string | null;
  updatedAt: string | null;
}

/** Quanto dado existe para o formato na janela, para a página dizer de onde vêm os números. */
export async function getFormatStatus(db: Db, format: string, period: MetaPeriod): Promise<FormatStatus> {
  const [counts] = await db.query<{ events: number; results: number; last_event: string | null }>(
    `select count(distinct e.id)::int as events, count(r.deck_id)::int as results, max(e.date)::text as last_event
     from events e left join event_results r on r.event_id = e.id
     where e.format = $1 and e.date >= current_date - $2::int`,
    [format, period],
  );
  const [updated] = await db.query<{ updated_at: Date | null }>('select max(updated_at) as updated_at from meta_snapshots where format = $1', [format]);
  return {
    events: counts?.events ?? 0,
    results: counts?.results ?? 0,
    lastEventDate: counts?.last_event ?? null,
    updatedAt: updated?.updated_at ? new Date(updated.updated_at).toISOString() : null,
  };
}

interface CardRow {
  board: 'main' | 'side' | 'commander';
  name: string;
  quantity: number;
}

function toDecklist(name: string, format: string, cards: CardRow[]): Decklist {
  const board = (b: CardRow['board']): DeckEntry[] => cards.filter((c) => c.board === b).map((c) => ({ name: c.name, quantity: c.quantity }));
  return { name, format, main: board('main'), sideboard: board('side'), commander: board('commander'), warnings: [] };
}

const CARDS_JSON = `(select jsonb_agg(jsonb_build_object('board', c.board, 'name', c.card_name, 'quantity', c.quantity) order by c.card_name)
                      from deck_cards c where c.deck_id = d.id)`;

export interface ArchetypeDeck {
  archetypeId: number;
  name: string;
  autoNamed: boolean;
  share: number;
  decks: number;
  deck: Decklist;
  signature: Signature;
}

/** Uma lista representativa por arquétipo do formato, com a participação dele no meta. */
export async function getArchetypeDecks(db: Db, format: string, period: MetaPeriod): Promise<ArchetypeDeck[]> {
  const rows = await db.query<{ id: number; name: string; auto_named: boolean; share: number; decks: number; cards: CardRow[] | null; signature: Signature }>(
    `select a.id, a.name, a.auto_named, s.share, s.decks, a.signature, ${CARDS_JSON} as cards
     from meta_snapshots s
     join archetypes a on a.id = s.archetype_id
     join decks d on d.id = a.sample_deck_id
     where s.format = $1 and s.platform = $2 and s.period_days = $3
     order by s.decks desc, a.name`,
    [format, PLATFORM_MTGO, period],
  );
  return rows.map((r) => ({
    archetypeId: r.id,
    name: r.name,
    autoNamed: r.auto_named,
    share: r.share,
    decks: r.decks,
    deck: toDecklist(r.name, format, r.cards ?? []),
    signature: r.signature,
  }));
}

export interface ArchetypeUsage {
  id: number;
  format: string;
  name: string;
  /** Média de cópias da carta no main das listas do arquétipo. */
  copies: number;
  /** Participação do arquétipo no meta dos últimos 30 dias (0 se não apareceu no período). */
  share: number;
}

/** Arquétipos que usam a carta (pelo nome oficial), dos mais presentes no meta para os menos. */
export async function getArchetypesUsingCard(db: Db, cardName: string): Promise<ArchetypeUsage[]> {
  const rows = await db.query<{ id: number; format: string; name: string; copies: number; share: number | null }>(
    `select a.id, a.format, a.name, (a.signature ->> $1)::real as copies, s.share
     from archetypes a
     left join meta_snapshots s on s.archetype_id = a.id and s.platform = $2 and s.period_days = 30
     where jsonb_exists(a.signature, $1)
     order by s.share desc nulls last, a.name`,
    [cardName, PLATFORM_MTGO],
  );
  return rows.map((r) => ({ id: r.id, format: r.format, name: r.name, copies: r.copies, share: r.share ?? 0 }));
}

export async function getDeck(db: Db, deckId: number, name = 'Deck'): Promise<Decklist | null> {
  const rows = await db.query<{ format: string; cards: CardRow[] | null }>(`select d.format, ${CARDS_JSON} as cards from decks d where d.id = $1`, [deckId]);
  return rows[0] ? toDecklist(name, rows[0].format, rows[0].cards ?? []) : null;
}

export interface ArchetypeResult {
  deckId: number;
  eventName: string;
  date: string;
  placement: number | null;
  wins: number | null;
  losses: number | null;
  player: string;
  url: string | null;
}

export async function getArchetypeResults(db: Db, archetypeId: number, limit = 20): Promise<ArchetypeResult[]> {
  const rows = await db.query<{
    deck_id: number;
    name: string;
    date: string;
    placement: number | null;
    wins: number | null;
    losses: number | null;
    player_handle: string;
    url: string | null;
    event_url: string;
  }>(
    `select r.deck_id, e.name, e.date::text as date, r.placement, r.wins, r.losses, r.player_handle, r.url, e.url as event_url
     from event_results r
     join decks d on d.id = r.deck_id
     join events e on e.id = r.event_id
     where d.archetype_id = $1
     order by e.date desc, r.placement nulls last, r.player_handle
     limit $2`,
    [archetypeId, limit],
  );
  return rows.map((r) => ({
    deckId: r.deck_id,
    eventName: r.name,
    date: r.date,
    placement: r.placement,
    wins: r.wins,
    losses: r.losses,
    player: r.player_handle,
    url: r.url ?? r.event_url,
  }));
}
