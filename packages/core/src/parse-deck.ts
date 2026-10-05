import { normalizeName } from './normalize.ts';
import type { DeckEntry, Decklist } from './types.ts';

type Section = 'main' | 'sideboard' | 'commander' | 'ignore' | 'about';

const HEADERS: Record<string, Section> = {
  deck: 'main',
  main: 'main',
  mainboard: 'main',
  maindeck: 'main',
  sideboard: 'sideboard',
  side: 'sideboard',
  companion: 'sideboard',
  commander: 'commander',
  commanders: 'commander',
  maybeboard: 'ignore',
  considering: 'ignore',
  tokens: 'ignore',
  about: 'about',
};

const QUANTITY_RE = /^(\d+)\s*[xX]?\s+(.+)$/;
/** Sufixos de exportação: "(BRO) 144", "(PLST) 2XM-123", "*F*" (foil), "*E*" (etched). */
const FINISH_SUFFIX_RE = /\s+\*[A-Z]{1,2}\*$/i;
const SET_SUFFIX_RE = /\s+\([A-Za-z0-9]{2,8}\)(?:\s+\S+)?$/;

/** Lê uma linha "4 Lightning Bolt (STA) 42" → { quantity: 4, name: "Lightning Bolt" }. */
export function parseCardLine(line: string): DeckEntry | null {
  const match = line.trim().match(QUANTITY_RE);
  if (!match) return null;
  const quantity = Number.parseInt(match[1]!, 10);
  const name = match[2]!.replace(FINISH_SUFFIX_RE, '').replace(SET_SUFFIX_RE, '').trim();
  if (!name || quantity <= 0) return null;
  return { quantity, name };
}

function pushMerged(list: DeckEntry[], entry: DeckEntry): void {
  const key = normalizeName(entry.name);
  const existing = list.find((e) => normalizeName(e.name) === key);
  if (existing) existing.quantity += entry.quantity;
  else list.push({ ...entry });
}

/**
 * Lê uma decklist nos formatos mais comuns:
 * - exportação do MTG Arena (seções "Deck", "Sideboard", "Commander", "Companion", "About");
 * - texto do MTGO / sites (sem cabeçalhos, sideboard depois de uma linha em branco);
 * - linhas "SB: 2 Carta".
 */
export function parseDecklist(text: string, fallbackName = 'Deck sem nome'): Decklist {
  const deck: Decklist = { name: fallbackName, main: [], sideboard: [], commander: [], warnings: [] };
  let section: Section = 'main';
  let sawHeader = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) {
      // Sem cabeçalhos, a convenção do MTGO é: linha em branco depois do main = começa o sideboard.
      if (!sawHeader && section === 'main' && deck.main.length > 0) section = 'sideboard';
      continue;
    }
    if (line.startsWith('//') || line.startsWith('#')) continue;

    const header = HEADERS[line.replace(/:$/, '').toLowerCase()];
    if (header) {
      sawHeader = true;
      section = header;
      continue;
    }

    if (section === 'about') {
      const nameMatch = line.match(/^Name\s+(.+)$/i);
      if (nameMatch) deck.name = nameMatch[1]!.trim();
      continue;
    }

    const isSideboardLine = /^SB:\s*/i.test(line);
    const entry = parseCardLine(line.replace(/^SB:\s*/i, ''));
    if (!entry) {
      deck.warnings.push(line);
      continue;
    }

    const target: Section = isSideboardLine ? 'sideboard' : section;
    if (target === 'main') pushMerged(deck.main, entry);
    else if (target === 'sideboard') pushMerged(deck.sideboard, entry);
    else if (target === 'commander') pushMerged(deck.commander, entry);
  }

  return deck;
}

export function deckSize(deck: Decklist): { main: number; sideboard: number; commander: number } {
  const sum = (list: DeckEntry[]) => list.reduce((total, e) => total + e.quantity, 0);
  return { main: sum(deck.main), sideboard: sum(deck.sideboard), commander: sum(deck.commander) };
}
