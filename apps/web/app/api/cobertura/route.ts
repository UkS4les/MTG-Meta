import { isFormatKey, parseCollectionText, rankDecks, resolveCollection, type Collection } from '@mtg-meta/core';
import { getArchetypeDecks, getCollection } from '@mtg-meta/db';
import { jsonError, parsePlatform, readJson } from '@/lib/api';
import { MAX_COLLECTION_BYTES, type CoverageResponse } from '@/lib/coverage';
import { cardDb, currentUser, getDb } from '@/lib/server';

/** Janela do meta usada para escolher os decks: os arquétipos com listas publicadas no último mês. */
const META_PERIOD = 30;

export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  const platform = parsePlatform(body?.plataforma);
  const format = body?.formato;
  if (!platform) return jsonError('Plataforma inválida. Use "arena" ou "papel".', 400);
  if (typeof format !== 'string' || !isFormatKey(format)) return jsonError('Formato inválido.', 400);
  const sortBy = body?.ordenar === 'cost' ? 'cost' : 'coverage';

  const db = await getDb();
  const cards = cardDb();
  let collection: Collection;
  let saved = false;
  if (typeof body?.colecao === 'string') {
    if (body.colecao.length > MAX_COLLECTION_BYTES) return jsonError('Coleção grande demais (limite de 5 MB).', 413);
    collection = resolveCollection(parseCollectionText(body.colecao).entries, cards).collection;
  } else {
    const user = await currentUser();
    if (!user) return jsonError('Importe sua coleção primeiro.', 400);
    collection = await getCollection(db, user.id, platform);
    saved = true;
  }

  const archetypes = await getArchetypeDecks(db, format, META_PERIOD);
  const byDeck = new Map(archetypes.map((a) => [a.deck, a]));
  const ranked = rankDecks(archetypes.map((a) => a.deck), collection, cards, { platform, sortBy });

  let copies = 0;
  for (const quantity of collection.values()) copies += quantity;
  const response: CoverageResponse = {
    collection: { cards: collection.size, copies, saved },
    decks: ranked.map((r) => {
      const archetype = byDeck.get(r.deck)!;
      return {
        archetypeId: archetype.archetypeId,
        name: archetype.name,
        autoNamed: archetype.autoNamed,
        share: archetype.share,
        coverage: r.coverage,
        cardsNeeded: r.cardsNeeded,
        cardsOwned: r.cardsOwned,
        missingCopies: r.missing.reduce((total, m) => total + m.missing, 0),
        missing: r.missing,
        wildcards: r.wildcards,
        costUsd: r.costUsd,
        unpricedMissing: r.unpricedMissing,
        notOnArena: r.notOnArena,
      };
    }),
  };
  return Response.json(response);
}
