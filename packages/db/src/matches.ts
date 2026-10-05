import type { DeckEntry, MatchResult } from '@mtg-meta/core';
import type { Db } from './client.ts';

export interface ArchetypeRef {
  id: number;
  name: string;
  format: string;
}

export interface MatchDeck {
  main: DeckEntry[];
  sideboard: DeckEntry[];
  commander: DeckEntry[];
}

/** Uma partida do Arena como o site mostra e guarda. */
export interface MatchRecord {
  id: string;
  eventId: string;
  startedAt: string | null;
  result: MatchResult;
  gamesWon: number;
  gamesLost: number;
  onPlay: boolean | null;
  deckName: string | null;
  deck: MatchDeck | null;
  deckArchetype: ArchetypeRef | null;
  /** Nomes das cartas que o oponente mostrou. */
  opponentCards: string[];
  /** Palpite do arquétipo do oponente, com a fração das cartas vistas que ele explica (0 a 1). */
  opponentArchetype: (ArchetypeRef & { confidence: number }) | null;
}

/** Grava as partidas; as que já existiam são atualizadas. Devolve quantas eram novas. */
export async function saveMatches(db: Db, userId: string, matches: readonly MatchRecord[]): Promise<number> {
  if (matches.length === 0) return 0;
  const rows = matches.map((m) => ({
    match_id: m.id,
    event_id: m.eventId,
    started_at: m.startedAt,
    result: m.result,
    games_won: m.gamesWon,
    games_lost: m.gamesLost,
    on_play: m.onPlay,
    deck_name: m.deckName,
    deck: m.deck,
    deck_archetype_id: m.deckArchetype?.id ?? null,
    opponent_cards: m.opponentCards,
    opponent_archetype_id: m.opponentArchetype?.id ?? null,
    opponent_confidence: m.opponentArchetype?.confidence ?? null,
  }));
  // xmax = 0 só nas linhas inseridas agora; nas atualizadas ele guarda a transação que as alterou.
  const result = await db.query<{ inserted: boolean }>(
    `insert into matches (user_id, match_id, event_id, started_at, result, games_won, games_lost, on_play, deck_name, deck,
                          deck_archetype_id, opponent_cards, opponent_archetype_id, opponent_confidence)
     select $1, r.match_id, r.event_id, r.started_at, r.result, r.games_won, r.games_lost, r.on_play, r.deck_name, r.deck,
            r.deck_archetype_id, coalesce(r.opponent_cards, '[]'::jsonb), r.opponent_archetype_id, r.opponent_confidence
     from jsonb_to_recordset($2::jsonb) as r(
       match_id text, event_id text, started_at timestamptz, result text, games_won integer, games_lost integer, on_play boolean,
       deck_name text, deck jsonb, deck_archetype_id integer, opponent_cards jsonb, opponent_archetype_id integer, opponent_confidence real)
     on conflict (user_id, match_id) do update set
       event_id = excluded.event_id, started_at = coalesce(excluded.started_at, matches.started_at), result = excluded.result,
       games_won = excluded.games_won, games_lost = excluded.games_lost, on_play = excluded.on_play, deck_name = excluded.deck_name,
       deck = excluded.deck, deck_archetype_id = excluded.deck_archetype_id, opponent_cards = excluded.opponent_cards,
       opponent_archetype_id = excluded.opponent_archetype_id, opponent_confidence = excluded.opponent_confidence
     returning (xmax = 0) as inserted`,
    [userId, JSON.stringify(rows)],
  );
  return result.filter((r) => r.inserted).length;
}

interface MatchRow {
  match_id: string;
  event_id: string;
  started_at: Date | null;
  result: MatchResult;
  games_won: number;
  games_lost: number;
  on_play: boolean | null;
  deck_name: string | null;
  deck: MatchDeck | null;
  deck_archetype_id: number | null;
  deck_archetype_name: string | null;
  deck_archetype_format: string | null;
  opponent_cards: string[];
  opponent_archetype_id: number | null;
  opponent_archetype_name: string | null;
  opponent_archetype_format: string | null;
  opponent_confidence: number | null;
}

/** Partidas da pessoa, da mais recente para a mais antiga (sem data ficam no fim). */
export async function listMatches(db: Db, userId: string): Promise<MatchRecord[]> {
  const rows = await db.query<MatchRow>(
    `select m.match_id, m.event_id, m.started_at, m.result, m.games_won, m.games_lost, m.on_play, m.deck_name, m.deck,
            m.deck_archetype_id, da.name as deck_archetype_name, da.format as deck_archetype_format,
            m.opponent_cards, m.opponent_archetype_id, oa.name as opponent_archetype_name, oa.format as opponent_archetype_format,
            m.opponent_confidence
     from matches m
     left join archetypes da on da.id = m.deck_archetype_id
     left join archetypes oa on oa.id = m.opponent_archetype_id
     where m.user_id = $1
     order by m.started_at desc nulls last, m.created_at desc, m.match_id`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.match_id,
    eventId: r.event_id,
    startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
    result: r.result,
    gamesWon: r.games_won,
    gamesLost: r.games_lost,
    onPlay: r.on_play,
    deckName: r.deck_name,
    deck: r.deck,
    deckArchetype: r.deck_archetype_id !== null && r.deck_archetype_name !== null ? { id: r.deck_archetype_id, name: r.deck_archetype_name, format: r.deck_archetype_format ?? '' } : null,
    opponentCards: r.opponent_cards,
    opponentArchetype:
      r.opponent_archetype_id !== null && r.opponent_archetype_name !== null
        ? { id: r.opponent_archetype_id, name: r.opponent_archetype_name, format: r.opponent_archetype_format ?? '', confidence: r.opponent_confidence ?? 0 }
        : null,
  }));
}

export async function deleteMatches(db: Db, userId: string): Promise<void> {
  await db.query('delete from matches where user_id = $1', [userId]);
}
