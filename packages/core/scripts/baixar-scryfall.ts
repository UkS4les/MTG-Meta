/**
 * Baixa o bulk "Default Cards" do Scryfall e gera data/cards.json para o motor de cobertura.
 *
 *   npm run cartas:baixar                             # baixa e processa (~80 MB compactado)
 *   npm run cartas:baixar -- --arquivo bulk.jsonl.gz  # processa um arquivo já baixado
 *
 * O Scryfall publica o bulk como JSON Lines compactado (.jsonl.gz); arquivos antigos no formato
 * de array JSON (.json) também são aceitos em --arquivo.
 *
 * Regras do Scryfall: cache de pelo menos 24 h (preços mudam 1x por dia), 50–100 ms entre
 * chamadas à API, sem paywall sobre os dados. Rodar este script 1x por dia é o suficiente.
 */
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { parseArgs } from 'node:util';
import { createGunzip } from 'node:zlib';
import { readJsonArray } from '../src/json-stream.ts';
import { ScryfallAggregator, type ScryfallCard } from '../src/scryfall.ts';
import type { CardDataFile } from '../src/types.ts';

const HEADERS = { 'User-Agent': 'mtg-meta/0.2 (motor de cobertura)', Accept: 'application/json' };

interface BulkItem {
  type: string;
  updated_at: string;
  jsonl_download_uri?: string;
  compressed_size?: number;
}

async function findDefaultCards(): Promise<BulkItem & { jsonl_download_uri: string }> {
  const response = await fetch('https://api.scryfall.com/bulk-data', { headers: HEADERS });
  if (!response.ok) throw new Error(`Scryfall respondeu ${response.status} ao listar o bulk data.`);
  const body = (await response.json()) as { data: BulkItem[] };
  const item = body.data.find((d) => d.type === 'default_cards');
  if (!item) throw new Error('Não encontrei o arquivo "default_cards" na lista do Scryfall.');
  if (!item.jsonl_download_uri) {
    throw new Error('O Scryfall não informou o endereço do arquivo (campo "jsonl_download_uri"). A API pode ter mudado.');
  }
  return { ...item, jsonl_download_uri: item.jsonl_download_uri };
}

/** Uma carta por linha, com ou sem gzip. */
async function* readJsonLines<T>(source: Readable, gzipped: boolean): AsyncGenerator<T> {
  const lines = createInterface({ input: gzipped ? source.pipe(createGunzip()) : source, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim()) yield JSON.parse(line) as T;
  }
}

async function openRemote(url: string): Promise<AsyncGenerator<ScryfallCard>> {
  const response = await fetch(url, { headers: { 'User-Agent': HEADERS['User-Agent'] } });
  if (!response.ok || !response.body) throw new Error(`Falha ao baixar ${url}: HTTP ${response.status}`);
  return readJsonLines<ScryfallCard>(Readable.fromWeb(response.body as unknown as NodeReadableStream), url.endsWith('.gz'));
}

function openLocal(path: string): AsyncGenerator<ScryfallCard> {
  if (/\.jsonl(\.gz)?$/i.test(path)) return readJsonLines<ScryfallCard>(createReadStream(path), path.endsWith('.gz'));
  return readJsonArray<ScryfallCard>(path);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      arquivo: { type: 'string' },
      saida: { type: 'string', default: 'data/cards.json' },
    },
  });

  let cardsSource: AsyncGenerator<ScryfallCard>;
  let bulkUpdatedAt: string | undefined;
  if (values.arquivo) {
    console.log(`Processando ${values.arquivo}...`);
    cardsSource = openLocal(values.arquivo);
  } else {
    const item = await findDefaultCards();
    bulkUpdatedAt = item.updated_at;
    const size = item.compressed_size ? `${Math.round(item.compressed_size / 1e6)} MB, ` : '';
    console.log(`Baixando Default Cards (${size}atualizado em ${item.updated_at})...`);
    cardsSource = await openRemote(item.jsonl_download_uri);
  }

  const aggregator = new ScryfallAggregator();
  let printings = 0;
  for await (const card of cardsSource) {
    aggregator.add(card);
    printings++;
  }
  const cards = aggregator.result();
  if (cards.length === 0) throw new Error('Nenhuma carta lida. O arquivo está vazio ou em um formato inesperado.');

  const output: CardDataFile = {
    meta: { source: 'scryfall', generatedAt: new Date().toISOString(), bulkUpdatedAt },
    cards,
  };
  mkdirSync(dirname(values.saida!), { recursive: true });
  writeFileSync(values.saida!, JSON.stringify(output));
  console.log(
    `Pronto: ${cards.length} cartas (${printings} impressões lidas, ${aggregator.skipped} ignoradas) → ${values.saida}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
