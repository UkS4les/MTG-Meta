import type { CardDatabase } from './card-db.ts';
import { parseCardLine } from './parse-deck.ts';
import type { Collection, DeckEntry } from './types.ts';

const QUANTITY_HEADERS = ['count', 'quantity', 'qty', 'amount', 'quantidade', 'qtd'];
const NAME_HEADERS = ['name', 'card name', 'card', 'nome'];

/** Parser de CSV com aspas ("Kozilek, Butcher of Truth") e aspas escapadas (""). */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
}

function countOutsideQuotes(line: string, char: string): number {
  let count = 0;
  let inQuotes = false;
  for (const c of line) {
    if (c === '"') inQuotes = !inQuotes;
    else if (c === char && !inQuotes) count++;
  }
  return count;
}

/** Vírgula, ponto e vírgula (Excel em português) ou tab — o que aparecer mais no cabeçalho. */
function detectDelimiter(headerLine: string): string {
  const candidates = [',', ';', '\t'];
  return candidates.reduce((best, c) => (countOutsideQuotes(headerLine, c) > countOutsideQuotes(headerLine, best) ? c : best));
}

function findColumn(headers: string[], options: string[]): number {
  return headers.findIndex((h) => options.includes(h.trim().toLowerCase().replace(/^﻿/, '')));
}

export interface ParsedCollection {
  entries: DeckEntry[];
  warnings: string[];
}

/**
 * Lê uma coleção em CSV (Moxfield, Manabox, Archidekt, TCGplayer...) ou em lista de texto
 * ("4 Lightning Bolt", formato do Arena). Detecta o formato sozinho.
 */
export function parseCollectionText(text: string): ParsedCollection {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  const delimiter = detectDelimiter(firstLine);
  const headerCells = parseCsv(firstLine, delimiter)[0] ?? [];
  const nameColumn = findColumn(headerCells, NAME_HEADERS);

  if (headerCells.length > 1 && nameColumn >= 0) {
    return parseCollectionCsv(text, delimiter, nameColumn, findColumn(headerCells, QUANTITY_HEADERS));
  }
  return parseCollectionList(text);
}

function parseCollectionCsv(text: string, delimiter: string, nameColumn: number, quantityColumn: number): ParsedCollection {
  const entries: DeckEntry[] = [];
  const warnings: string[] = [];
  const rows = parseCsv(text, delimiter).slice(1);
  for (const [index, row] of rows.entries()) {
    const name = row[nameColumn]?.trim();
    const quantity = quantityColumn >= 0 ? Number.parseInt(row[quantityColumn] ?? '', 10) : 1;
    if (!name || !Number.isFinite(quantity) || quantity <= 0) {
      warnings.push(`linha ${index + 2}: ${row.join(delimiter)}`);
      continue;
    }
    entries.push({ name, quantity });
  }
  return { entries, warnings };
}

function parseCollectionList(text: string): ParsedCollection {
  const entries: DeckEntry[] = [];
  const warnings: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;
    // Cabeçalhos de seção, caso a pessoa cole um deck como coleção.
    if (/^(deck|sideboard|commander|companion|collection|coleção|colecao):?$/i.test(line)) continue;
    const entry = parseCardLine(line);
    if (entry) entries.push(entry);
    else warnings.push(line);
  }
  return { entries, warnings };
}

export interface ResolvedCollection {
  collection: Collection;
  unknown: string[];
  totalCopies: number;
}

/**
 * Converte as linhas lidas em uma coleção indexada pelo nome oficial da carta.
 * Várias edições da mesma carta (ou faces de uma dupla-face) somam na mesma entrada.
 */
export function resolveCollection(entries: DeckEntry[], db: CardDatabase): ResolvedCollection {
  const collection: Collection = new Map();
  const unknown = new Set<string>();
  let totalCopies = 0;
  for (const entry of entries) {
    const card = db.get(entry.name);
    if (!card) {
      unknown.add(entry.name);
      continue;
    }
    collection.set(card.name, (collection.get(card.name) ?? 0) + entry.quantity);
    totalCopies += entry.quantity;
  }
  return { collection, unknown: [...unknown], totalCopies };
}
