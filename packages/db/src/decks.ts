import { createHash } from 'node:crypto';
import { deckKey, type DeckEntry, type Decklist, type Signature, type Tournament } from '@mtg-meta/core';
import type { Db, Queryable } from './client.ts';

export const PLATFORM_MTGO = 'mtgo';

export function deckHash(deck: Decklist): string {
  return createHash('sha256').update(deckKey(deck)).digest('hex');
}

type Board = 'main' | 'side' | 'commander';

async function upsertDeck(tx: Queryable, deck: Decklist, format: string, source: string): Promise<number> {
  const hash = deckHash(deck);
  const existing = await tx.query<{ id: number }>('select id from decks where hash = $1', [hash]);
  if (existing[0]) return existing[0].id;

  const inserted = await tx.query<{ id: number }>(
    'insert into decks (hash, format, platform, source) values ($1, $2, $3, $4) returning id',
    [hash, format, PLATFORM_MTGO, source],
  );
  const id = inserted[0]!.id;
  const rows = (board: Board, entries: DeckEntry[]) => entries.map((e) => ({ board, card_name: e.name, quantity: e.quantity }));
  await tx.query(
    `insert into deck_cards (deck_id, board, card_name, quantity)
     select $1, r.board, r.card_name, r.quantity from jsonb_to_recordset($2::jsonb) as r(board text, card_name text, quantity integer)`,
    [id, JSON.stringify([...rows('main', deck.main), ...rows('side', deck.sideboard), ...rows('commander', deck.commander)])],
  );
  return id;
}

/** Grava (ou regrava) um torneio com todos os resultados. Devolve quantos resultados entraram. */
export async function storeTournament(db: Db, tournament: Tournament, source: string): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.query(
      `insert into events (id, source, name, format, date, url, players) values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do update set name = excluded.name, format = excluded.format, date = excluded.date,
         url = excluded.url, players = excluded.players`,
      [tournament.id, source, tournament.name, tournament.format, tournament.date, tournament.url, tournament.players],
    );
    // Ligas são republicadas com listas novas; regravar tudo evita resultados órfãos.
    await tx.query('delete from event_results where event_id = $1', [tournament.id]);
    for (const result of tournament.results) {
      const deckId = await upsertDeck(tx, result.deck, tournament.format, source);
      await tx.query(
        `insert into event_results (event_id, player_handle, deck_id, placement, wins, losses, url)
         values ($1, $2, $3, $4, $5, $6, $7) on conflict do nothing`,
        [tournament.id, result.player, deckId, result.placement, result.wins, result.losses, result.url],
      );
    }
    return tournament.results.length;
  });
}

export async function ingestedFiles(db: Db): Promise<Map<string, string>> {
  const rows = await db.query<{ path: string; sha: string }>('select path, sha from ingest_files');
  return new Map(rows.map((r) => [r.path, r.sha]));
}

export async function markIngested(db: Db, path: string, sha: string): Promise<void> {
  await db.query(
    'insert into ingest_files (path, sha) values ($1, $2) on conflict (path) do update set sha = excluded.sha, ingested_at = now()',
    [path, sha],
  );
}

export interface StoredDeck {
  id: number;
  archetypeId: number | null;
  /** Data do resultado mais recente com esta lista (AAAA-MM-DD). */
  lastSeen: string;
  main: DeckEntry[];
}

/** Decks do formato que apareceram em algum resultado nos últimos N dias, com o main de cada um. */
export async function recentDecks(db: Db, format: string, days: number): Promise<StoredDeck[]> {
  const rows = await db.query<{ id: number; archetype_id: number | null; last_seen: string; main: DeckEntry[] | null }>(
    `select d.id, d.archetype_id, seen.last_seen::text as last_seen,
            (select jsonb_agg(jsonb_build_object('name', c.card_name, 'quantity', c.quantity) order by c.card_name)
               from deck_cards c where c.deck_id = d.id and c.board = 'main') as main
     from decks d
     join (select r.deck_id, max(e.date) as last_seen
             from event_results r join events e on e.id = r.event_id
            where e.format = $1 and e.date >= current_date - $2::int
            group by r.deck_id) seen on seen.deck_id = d.id
     where d.format = $1
     order by d.id`,
    [format, days],
  );
  return rows.map((r) => ({ id: r.id, archetypeId: r.archetype_id, lastSeen: r.last_seen, main: r.main ?? [] }));
}

export interface StoredArchetype {
  id: number;
  format: string;
  name: string;
  signature: Signature;
  autoNamed: boolean;
  sampleDeckId: number | null;
}

interface ArchetypeRow {
  id: number;
  format: string;
  name: string;
  signature: Signature;
  auto_named: boolean;
  sample_deck_id: number | null;
}

function toArchetype(row: ArchetypeRow): StoredArchetype {
  return {
    id: row.id,
    format: row.format,
    name: row.name,
    signature: row.signature,
    autoNamed: row.auto_named,
    sampleDeckId: row.sample_deck_id,
  };
}

const ARCHETYPE_COLUMNS = 'id, format, name, signature, auto_named, sample_deck_id';

export async function listArchetypes(db: Db, format: string): Promise<StoredArchetype[]> {
  const rows = await db.query<ArchetypeRow>(`select ${ARCHETYPE_COLUMNS} from archetypes where format = $1 order by id`, [format]);
  return rows.map(toArchetype);
}

export async function getArchetype(db: Db, id: number): Promise<StoredArchetype | null> {
  const rows = await db.query<ArchetypeRow>(`select ${ARCHETYPE_COLUMNS} from archetypes where id = $1`, [id]);
  return rows[0] ? toArchetype(rows[0]) : null;
}

export async function createArchetype(db: Db, format: string, name: string, signature: Signature): Promise<number> {
  const rows = await db.query<{ id: number }>('insert into archetypes (format, name, signature) values ($1, $2, $3::jsonb) returning id', [
    format,
    name,
    JSON.stringify(signature),
  ]);
  return rows[0]!.id;
}

export async function updateArchetype(db: Db, id: number, signature: Signature, sampleDeckId: number | null): Promise<void> {
  await db.query('update archetypes set signature = $2::jsonb, sample_deck_id = $3 where id = $1', [id, JSON.stringify(signature), sampleDeckId]);
}

/** Dá a um arquétipo o nome que a comunidade usa. Devolve false se já existir outro com esse nome no formato. */
export async function renameArchetype(db: Db, id: number, name: string): Promise<boolean> {
  const rows = await db.query(
    `update archetypes a set name = $2, auto_named = false
     where a.id = $1 and not exists (select 1 from archetypes o where o.format = a.format and o.name = $2 and o.id <> a.id)
     returning a.id`,
    [id, name],
  );
  return rows.length > 0;
}

/** Atualiza o nome automático de um arquétipo. Não mexe nos que alguém já nomeou, nem cria nome repetido. */
export async function setAutoName(db: Db, id: number, name: string): Promise<void> {
  await db.query(
    `update archetypes a set name = $2
     where a.id = $1 and a.auto_named and not exists (select 1 from archetypes o where o.format = a.format and o.name = $2 and o.id <> a.id)`,
    [id, name],
  );
}

export async function assignArchetypes(db: Db, assignments: { deckId: number; archetypeId: number; score: number }[]): Promise<void> {
  if (assignments.length === 0) return;
  await db.query(
    `update decks d set archetype_id = r.archetype_id, archetype_score = r.score
     from jsonb_to_recordset($1::jsonb) as r("deckId" integer, archetype_id integer, score real)
     where d.id = r."deckId"`,
    [JSON.stringify(assignments.map((a) => ({ deckId: a.deckId, archetype_id: a.archetypeId, score: a.score })))],
  );
}

export const META_PERIODS = [7, 14, 30] as const;
export type MetaPeriod = (typeof META_PERIODS)[number];

/** Recalcula a participação de cada arquétipo entre as listas publicadas em cada janela de tempo. */
export async function refreshMetaSnapshots(db: Db, format: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query('delete from meta_snapshots where format = $1 and platform = $2', [format, PLATFORM_MTGO]);
    for (const period of META_PERIODS) {
      await tx.query(
        `insert into meta_snapshots (format, platform, period_days, archetype_id, decks, share)
         select $1, $2, $3::int, d.archetype_id, count(*)::int, count(*)::real / sum(count(*)) over ()
         from event_results r
         join events e on e.id = r.event_id
         join decks d on d.id = r.deck_id
         where e.format = $1 and e.date >= current_date - $3::int
         group by d.archetype_id`,
        [format, PLATFORM_MTGO, period],
      );
    }
  });
}
