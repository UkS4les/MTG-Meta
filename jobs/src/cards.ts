import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadCardDatabase } from '@mtg-meta/core/node';
import type { CardDatabase } from '@mtg-meta/core';
import { dataDir, repoRoot } from '@mtg-meta/db';

export interface LoadedCards {
  cards: CardDatabase;
  /** false = banco de exemplo (raridades e preços ilustrativos). */
  real: boolean;
}

/** Banco de cartas gerado por "npm run cartas:baixar"; sem ele, cai no arquivo de exemplo. */
export function loadCards(): LoadedCards {
  const real = process.env.CARDS_FILE ?? join(dataDir(), 'cards.json');
  // O caminho vem da configuração do servidor; o comentário impede o empacotador de varrer o projeto inteiro atrás dele.
  if (existsSync(/* turbopackIgnore: true */ real)) return { cards: loadCardDatabase(real), real: true };
  return { cards: loadCardDatabase(join(repoRoot(), 'packages/core/exemplos/cartas-exemplo.json')), real: false };
}
