import { deleteMatches, listMatches, saveMatches } from '@mtg-meta/db';
import { jsonError, readJson } from '@/lib/api';
import { cleanMatches, enrichMatches, MAX_MATCHES } from '@/lib/matches';
import type { MatchesResponse, MatchesStatus } from '@/lib/matches-shared';
import { cardDb, currentUser, getDb, requestUser } from '@/lib/server';

export async function GET(): Promise<Response> {
  const user = await currentUser();
  const status: MatchesStatus = { loggedIn: user !== null, partidas: user ? await listMatches(await getDb(), user.id) : [] };
  return Response.json(status);
}

/**
 * Recebe as partidas já extraídas do log pelo navegador (o arquivo em si não é enviado),
 * devolve com nomes de cartas e arquétipos e, se houver conta, grava.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  // O tracker manda a chave; se ela não vale mais, ele precisa saber em vez de receber "não gravado".
  if (request.headers.has('authorization') && !(await requestUser(request))) return jsonError('Chave do tracker inválida ou revogada.', 401);
  const matches = cleanMatches(body?.partidas);
  if (!matches) return jsonError(`Envie uma lista de até ${MAX_MATCHES} partidas.`, 400);

  const db = await getDb();
  const records = await enrichMatches(db, cardDb(), matches);
  const user = await requestUser(request);
  const response: MatchesResponse = { saved: user !== null, added: user ? await saveMatches(db, user.id, records) : 0, partidas: records };
  return Response.json(response);
}

export async function DELETE(): Promise<Response> {
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta.', 401);
  await deleteMatches(await getDb(), user.id);
  return new Response(null, { status: 204 });
}
