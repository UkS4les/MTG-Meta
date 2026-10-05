import { createHash, timingSafeEqual } from 'node:crypto';
import { FORMAT_KEYS, isFormatKey } from '@mtg-meta/core';
import { DEFAULT_INGEST_DAYS, runIngest } from '@mtg-meta/jobs';
import { jsonError, readJson } from '@/lib/api';
import { getCards, getDb } from '@/lib/server';

// A primeira carga baixa centenas de arquivos; em hospedagem serverless o limite precisa ser alto.
export const maxDuration = 300;

const digest = (value: string) => createHash('sha256').update(value).digest();

function authorized(request: Request): boolean | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  const header = request.headers.get('authorization') ?? '';
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

let running = false;

async function ingest(request: Request, options: { days?: number; formats?: string[] }): Promise<Response> {
  const allowed = authorized(request);
  if (allowed === null) return jsonError('Ingestão desativada: defina a variável CRON_SECRET no servidor.', 503);
  if (!allowed) return jsonError('Não autorizado.', 401);
  if (running) return jsonError('Já existe uma ingestão em andamento.', 409);

  const { cards, real } = getCards();
  if (!real) return jsonError('Banco de cartas ausente: rode "npm run cartas:baixar" no servidor.', 503);

  running = true;
  try {
    const log: string[] = [];
    const summary = await runIngest(await getDb(), cards, { ...options, log: (message) => log.push(message) });
    return Response.json({ ...summary, log });
  } finally {
    running = false;
  }
}

/** Para o cron da hospedagem (a Vercel chama com GET e "Authorization: Bearer $CRON_SECRET"). */
export function GET(request: Request): Promise<Response> {
  return ingest(request, {});
}

/** Para "npm run meta:ingerir -- --servidor ...", que pode escolher dias e formatos. */
export async function POST(request: Request): Promise<Response> {
  const body = (await readJson(request)) ?? {};
  const days = typeof body.dias === 'number' && body.dias >= 1 && body.dias <= 365 ? Math.floor(body.dias) : DEFAULT_INGEST_DAYS;
  const formats = Array.isArray(body.formatos) ? body.formatos.filter((f): f is string => typeof f === 'string' && isFormatKey(f)) : [];
  return ingest(request, { days, formats: formats.length > 0 ? formats : [...FORMAT_KEYS] });
}
