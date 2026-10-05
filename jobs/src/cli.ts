/**
 * Ingestão dos torneios do MTGO.
 *
 *   npm run meta:ingerir                       # últimos 30 dias, todos os formatos do MVP
 *   npm run meta:ingerir -- --dias 7 --formatos standard,modern
 *   npm run meta:ingerir -- --servidor http://localhost:3000   # pede para o site rodar (banco local em uso)
 *
 * O banco local só aceita um processo por vez. Com o site rodando, use --servidor; o site expõe a
 * mesma ingestão em POST /api/jobs/ingerir (protegida por CRON_SECRET), que é também o endereço
 * para um cron externo chamar em produção.
 */
import { parseArgs } from 'node:util';
import { FORMAT_KEYS, isFormatKey } from '@mtg-meta/core';
import { openDb } from '@mtg-meta/db';
import { loadCards } from './cards.ts';
import { DEFAULT_INGEST_DAYS, runIngest } from './ingest.ts';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      dias: { type: 'string', default: String(DEFAULT_INGEST_DAYS) },
      formatos: { type: 'string', default: FORMAT_KEYS.join(',') },
      servidor: { type: 'string' },
    },
  });
  const days = Number.parseInt(values.dias!, 10);
  if (!Number.isFinite(days) || days < 1 || days > 365) throw new Error('--dias deve ser um número entre 1 e 365.');
  const formats = values.formatos!.split(',').map((f) => f.trim().toLowerCase()).filter(Boolean);
  const invalid = formats.filter((f) => !isFormatKey(f));
  if (invalid.length > 0) throw new Error(`Formato(s) desconhecido(s): ${invalid.join(', ')}. Use: ${FORMAT_KEYS.join(', ')}.`);

  if (values.servidor) {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new Error('Defina CRON_SECRET com o mesmo valor configurado no site.');
    const response = await fetch(new URL('/api/jobs/ingerir', values.servidor), {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dias: days, formatos: formats }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`O servidor respondeu ${response.status}: ${text}`);
    console.log(text);
    return;
  }

  const { cards, real } = loadCards();
  if (!real) {
    throw new Error('Não encontrei data/cards.json. Rode "npm run cartas:baixar" antes: o classificador precisa saber quais cartas são terrenos.');
  }
  const db = await openDb();
  try {
    const summary = await runIngest(db, cards, { days, formats, log: console.log });
    console.log(`Pronto: ${summary.filesDownloaded} arquivo(s) baixado(s), ${summary.results} resultado(s) gravado(s), ${summary.filesFailed} falha(s).`);
    if (summary.filesFailed > 0) process.exitCode = 1;
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error(`Erro: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
