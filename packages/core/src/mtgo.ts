import type { DeckEntry, Decklist } from './types.ts';

/**
 * Arquivo de torneio no formato do MTGODecklistCache, usado pelo repositório
 * público modometa/modometa-mtgo-data (nomes de cartas já no padrão do Scryfall).
 */
export interface MtgoTournamentFile {
  Tournament: { Date: string; Name: string; Uri: string; Formats: string; PlayerCount?: number };
  Decks: {
    Date?: string;
    Player: string;
    Result: string;
    AnchorUri?: string;
    Mainboard: { Count: number; CardName: string }[];
    Sideboard: { Count: number; CardName: string }[];
  }[];
  Standings?: { Rank: number; Player: string; Wins: number; Losses: number; Draws?: number }[];
}

export interface TournamentResult {
  player: string;
  /** Colocação final (torneios). null em ligas, que só publicam listas 5-0. */
  placement: number | null;
  wins: number | null;
  losses: number | null;
  url: string | null;
  deck: Decklist;
}

export interface Tournament {
  /** Identificador estável: o último trecho da URL do evento no mtgo.com. */
  id: string;
  name: string;
  /** Formato em minúsculas, ex.: "modern". */
  format: string;
  /** AAAA-MM-DD. */
  date: string;
  url: string;
  players: number | null;
  results: TournamentResult[];
}

function toEntries(cards: { Count: number; CardName: string }[] | undefined): DeckEntry[] {
  const merged = new Map<string, number>();
  for (const card of cards ?? []) {
    if (!card.CardName || !(card.Count > 0)) continue;
    merged.set(card.CardName, (merged.get(card.CardName) ?? 0) + card.Count);
  }
  return [...merged].map(([name, quantity]) => ({ name, quantity }));
}

/** "1st Place" → colocação 1; "5-0" → 5 vitórias e 0 derrotas. */
export function parseResult(result: string): { placement: number | null; wins: number | null; losses: number | null } {
  const place = result.match(/^(\d+)(?:st|nd|rd|th)\b/i);
  if (place) return { placement: Number.parseInt(place[1]!, 10), wins: null, losses: null };
  const record = result.match(/^(\d+)-(\d+)(?:-\d+)?$/);
  if (record) return { placement: null, wins: Number.parseInt(record[1]!, 10), losses: Number.parseInt(record[2]!, 10) };
  return { placement: null, wins: null, losses: null };
}

export function parseMtgoTournament(file: MtgoTournamentFile): Tournament {
  const info = file.Tournament;
  const standings = new Map((file.Standings ?? []).map((s) => [s.Player, s]));
  const id = info.Uri.replace(/\/+$/, '').split('/').pop() ?? info.Uri;

  const results: TournamentResult[] = [];
  for (const entry of file.Decks ?? []) {
    const main = toEntries(entry.Mainboard);
    if (main.length === 0) continue;
    const parsed = parseResult(entry.Result ?? '');
    const standing = standings.get(entry.Player);
    results.push({
      player: entry.Player,
      placement: parsed.placement ?? standing?.Rank ?? null,
      wins: standing?.Wins ?? parsed.wins,
      losses: standing?.Losses ?? parsed.losses,
      url: entry.AnchorUri ?? null,
      deck: {
        name: `${info.Name} — ${entry.Player}`,
        format: info.Formats.toLowerCase(),
        main,
        sideboard: toEntries(entry.Sideboard),
        commander: [],
        warnings: [],
      },
    });
  }

  return {
    id,
    name: info.Name,
    format: info.Formats.toLowerCase(),
    date: info.Date.slice(0, 10),
    url: info.Uri,
    players: info.PlayerCount ?? null,
    results,
  };
}

/** Texto no formato que o Arena e o MTGO importam ("Deck" / "Sideboard"). */
export function formatDecklist(deck: Decklist): string {
  const lines = (entries: DeckEntry[]) => entries.map((e) => `${e.quantity} ${e.name}`);
  const parts: string[] = [];
  if (deck.commander.length > 0) parts.push('Commander', ...lines(deck.commander), '');
  parts.push('Deck', ...lines(deck.main));
  if (deck.sideboard.length > 0) parts.push('', 'Sideboard', ...lines(deck.sideboard));
  return parts.join('\n');
}
