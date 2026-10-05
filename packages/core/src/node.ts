/** Funções que dependem do Node (leitura de arquivos). O resto do núcleo roda também no navegador. */
import { readFileSync } from 'node:fs';
import { CardDatabase } from './card-db.ts';
import type { CardDataFile } from './types.ts';

export function loadCardDatabase(path: string): CardDatabase {
  const data = JSON.parse(readFileSync(path, 'utf8')) as CardDataFile;
  if (!Array.isArray(data.cards)) {
    throw new Error(`${path} não parece um arquivo de cartas (falta o campo "cards").`);
  }
  return new CardDatabase(data.cards, data.meta);
}
