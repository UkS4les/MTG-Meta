/**
 * "O que eu consigo montar?" na linha de comando.
 *
 *   npm run cobertura -- --colecao minha-colecao.csv --decks decks/ --plataforma papel
 *
 * Opções:
 *   --cartas      arquivo de cartas (padrão: data/cards.json, gerado por `npm run cartas:baixar`)
 *   --colecao     coleção em CSV (Moxfield, Manabox, Archidekt...) ou lista "4 Nome da Carta"
 *   --decks       arquivo .txt ou pasta com decklists (pode repetir)
 *   --plataforma  arena | papel (padrão: arena)
 *   --ordenar     cobertura | custo (padrão: cobertura)
 *   --detalhes    quantos decks mostrar com a lista do que falta (padrão: 1)
 *   --json        saída em JSON (para usar em outro programa)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadCardDatabase } from './node.ts';
import { rankDecks, type DeckCoverage, type SortBy } from './coverage.ts';
import { parseCollectionText, resolveCollection } from './parse-collection.ts';
import { parseDecklist } from './parse-deck.ts';
import type { Decklist, Platform, Rarity } from './types.ts';

const RARITY_PT: Record<Rarity, string> = { common: 'comum', uncommon: 'incomum', rare: 'rara', mythic: 'mítica' };
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' });
const integer = new Intl.NumberFormat('pt-BR');

function fail(message: string): never {
  console.error(`Erro: ${message}`);
  process.exit(1);
}

function deckFiles(paths: string[]): string[] {
  const files: string[] = [];
  for (const path of paths) {
    if (!existsSync(path)) fail(`não encontrei ${path}`);
    if (statSync(path).isDirectory()) {
      for (const file of readdirSync(path).sort()) {
        if (extname(file).toLowerCase() === '.txt') files.push(join(path, file));
      }
    } else {
      files.push(path);
    }
  }
  return files;
}

/** "golgari-midrange.txt" → "Golgari Midrange" (usado quando o arquivo não tem "About / Name"). */
function nameFromFile(file: string): string {
  return basename(file, extname(file))
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ');
}

/** Ajusta o texto à largura da coluna; textos longos são cortados com "…" e sempre sobra um espaço. */
function pad(text: string, width: number, alignRight = false): string {
  const clipped = text.length > width - 1 ? `${text.slice(0, width - 2)}…` : text;
  return alignRight ? clipped.padStart(width) : clipped.padEnd(width);
}

function printTable(results: DeckCoverage[], platform: Platform): void {
  const effortHeader = platform === 'arena' ? 'Curingas M/R/I/C' : 'Custo p/ completar';
  console.log(`  ${pad('#', 3)}${pad('Deck', 30)}${pad('Cobertura', 11, true)}${pad('Faltam', 9, true)}   ${effortHeader}`);
  results.forEach((r, i) => {
    const missingCopies = r.missing.reduce((t, m) => t + m.missing, 0);
    let effort: string;
    if (platform === 'arena') {
      effort = r.notOnArena.length > 0 ? 'não existe no Arena' : [r.wildcards.mythic, r.wildcards.rare, r.wildcards.uncommon, r.wildcards.common].join(' / ');
    } else {
      effort = usd.format(r.costUsd) + (r.unpricedMissing.length > 0 ? ' + sem preço' : '');
    }
    console.log(
      `  ${pad(String(i + 1), 3)}${pad(r.deck.name, 30)}${pad(percent.format(r.coverage), 11, true)}${pad(String(missingCopies), 9, true)}   ${effort}`,
    );
  });
}

function printDetails(result: DeckCoverage, platform: Platform): void {
  console.log(`\nO que falta para "${result.deck.name}":`);
  if (result.missing.length === 0) {
    console.log('  Nada. Você já pode montar este deck.');
  }
  const nameWidth = Math.min(46, Math.max(...result.missing.map((m) => m.name.length), 10) + 2);
  for (const m of result.missing) {
    const rarity = m.rarity ? RARITY_PT[m.rarity] : '—';
    const price = platform === 'paper' ? `   ${m.unitPriceUsd === null ? 'sem preço' : `${usd.format(m.unitPriceUsd)} cada`}` : '';
    console.log(`  ${pad(`${m.missing}×`, 4)}${pad(m.name, nameWidth)}${pad(rarity, 9)} tem ${m.owned} de ${m.needed}${price}`);
  }
  if (result.notOnArena.length > 0) console.log(`  Não existem no Arena: ${result.notOnArena.join(', ')}`);
  if (result.unknown.length > 0) console.log(`  Nomes não reconhecidos: ${result.unknown.join(', ')}`);
}

function main(): void {
  const { values } = parseArgs({
    options: {
      cartas: { type: 'string', default: 'data/cards.json' },
      colecao: { type: 'string' },
      decks: { type: 'string', multiple: true },
      plataforma: { type: 'string', default: 'arena' },
      ordenar: { type: 'string', default: 'cobertura' },
      detalhes: { type: 'string', default: '1' },
      json: { type: 'boolean', default: false },
    },
  });

  const platformArg = values.plataforma!.toLowerCase();
  if (!['arena', 'papel', 'paper'].includes(platformArg)) fail('--plataforma deve ser "arena" ou "papel".');
  const platform: Platform = platformArg === 'arena' ? 'arena' : 'paper';
  const sortArg = values.ordenar!.toLowerCase();
  if (!['cobertura', 'custo'].includes(sortArg)) fail('--ordenar deve ser "cobertura" ou "custo".');
  const sortBy: SortBy = sortArg === 'custo' ? 'cost' : 'coverage';
  if (!values.colecao) fail('informe a coleção com --colecao arquivo.csv (ou .txt).');
  if (!values.decks?.length) fail('informe pelo menos um deck ou pasta com --decks.');
  if (!existsSync(values.cartas!)) {
    fail(`não encontrei ${values.cartas}. Rode "npm run cartas:baixar" ou use --cartas exemplos/cartas-exemplo.json.`);
  }
  if (!existsSync(values.colecao)) fail(`não encontrei ${values.colecao}`);

  const db = loadCardDatabase(values.cartas!);
  const parsedCollection = parseCollectionText(readFileSync(values.colecao, 'utf8'));
  const { collection, unknown, totalCopies } = resolveCollection(parsedCollection.entries, db);
  const decks: Decklist[] = deckFiles(values.decks).map((file) => parseDecklist(readFileSync(file, 'utf8'), nameFromFile(file)));
  const results = rankDecks(decks, collection, db, { platform, sortBy });

  if (values.json) {
    console.log(JSON.stringify(results.map(({ deck, ...rest }) => ({ deck: deck.name, ...rest })), null, 2));
    return;
  }

  const bulkDate = db.meta?.bulkUpdatedAt?.slice(0, 10);
  const source = db.meta?.source === 'scryfall' ? (bulkDate ? `Scryfall, bulk de ${bulkDate}` : 'Scryfall') : 'exemplo';
  console.log(`Banco de cartas: ${integer.format(db.size)} cartas (${source})`);
  if (db.meta?.source === 'example') {
    console.log('Atenção: banco de EXEMPLO, com raridades e preços ilustrativos. Rode "npm run cartas:baixar" para dados reais.');
  }
  console.log(`Coleção: ${integer.format(totalCopies)} cópias de ${integer.format(collection.size)} cartas`);
  if (unknown.length > 0) console.log(`  ${unknown.length} nome(s) não reconhecido(s): ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? '…' : ''}`);
  if (parsedCollection.warnings.length > 0) console.log(`  ${parsedCollection.warnings.length} linha(s) ignorada(s) na coleção`);
  console.log(`Plataforma: ${platform === 'arena' ? 'Arena' : 'papel'} · ${decks.length} deck(s) · ordenado por ${sortArg}\n`);

  printTable(results, platform);
  const detailCount = Math.max(0, Number.parseInt(values.detalhes!, 10) || 0);
  for (const result of results.slice(0, detailCount)) printDetails(result, platform);

  const deckWarnings = decks.filter((d) => d.warnings.length > 0);
  for (const deck of deckWarnings) console.log(`\nAviso: ${deck.warnings.length} linha(s) não lida(s) em "${deck.name}": ${deck.warnings.slice(0, 3).join(' | ')}`);
}

main();
