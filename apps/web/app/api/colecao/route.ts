import { parseCollectionText, resolveCollection, type Platform } from '@mtg-meta/core';
import { collectionSummaries, deleteCollection, getCollection, saveCollection } from '@mtg-meta/db';
import { jsonError, parsePlatform, readJson } from '@/lib/api';
import { MAX_COLLECTION_BYTES, type CollectionResponse, type CollectionStatus } from '@/lib/coverage';
import { cardDb, currentUser, getDb } from '@/lib/server';

const FILE_NAMES: Record<Platform, string> = { arena: 'colecao-arena.txt', paper: 'colecao-papel.txt' };

/** Sem parâmetros: resumo das coleções salvas. Com ?plataforma=...: baixa a coleção como lista de texto. */
export async function GET(request: Request): Promise<Response> {
  const user = await currentUser();
  const platformParam = new URL(request.url).searchParams.get('plataforma');

  if (platformParam === null) {
    const status: CollectionStatus = { loggedIn: user !== null, saved: user ? await collectionSummaries(await getDb(), user.id) : [] };
    return Response.json(status);
  }

  const platform = parsePlatform(platformParam);
  if (!platform) return jsonError('Plataforma inválida. Use "arena" ou "papel".', 400);
  if (!user) return jsonError('Entre na sua conta para baixar a coleção salva.', 401);
  const collection = await getCollection(await getDb(), user.id, platform);
  const text = [...collection].map(([name, quantity]) => `${quantity} ${name}`).join('\n');
  return new Response(text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${FILE_NAMES[platform]}"` },
  });
}

/** Lê o texto da coleção e, se houver conta, grava. Visitantes recebem só o resumo (a coleção fica no navegador). */
export async function PUT(request: Request): Promise<Response> {
  const body = await readJson(request);
  const platform = parsePlatform(body?.plataforma);
  const text = body?.texto;
  if (!platform) return jsonError('Plataforma inválida. Use "arena" ou "papel".', 400);
  if (typeof text !== 'string' || text.trim() === '') return jsonError('A coleção está vazia.', 400);
  if (text.length > MAX_COLLECTION_BYTES) return jsonError('Arquivo grande demais (limite de 5 MB).', 413);

  const parsed = parseCollectionText(text);
  const { collection, unknown, totalCopies } = resolveCollection(parsed.entries, cardDb());
  if (collection.size === 0) {
    return jsonError('Não reconheci nenhuma carta. Use um CSV com colunas de nome e quantidade, ou linhas como "4 Lightning Bolt".', 422);
  }

  const user = await currentUser();
  if (user) await saveCollection(await getDb(), user.id, platform, collection);
  const response: CollectionResponse = {
    saved: user !== null,
    cards: collection.size,
    copies: totalCopies,
    unknown: unknown.slice(0, 50),
    ignoredLines: parsed.warnings.length,
  };
  return Response.json(response);
}

export async function DELETE(request: Request): Promise<Response> {
  const platform = parsePlatform(new URL(request.url).searchParams.get('plataforma'));
  if (!platform) return jsonError('Plataforma inválida. Use "arena" ou "papel".', 400);
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta.', 401);
  await deleteCollection(await getDb(), user.id, platform);
  return new Response(null, { status: 204 });
}
