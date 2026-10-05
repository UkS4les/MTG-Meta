import { createUserDeck, listUserDecks, MAX_USER_DECKS } from '@mtg-meta/db';
import { jsonError, readJson } from '@/lib/api';
import { cleanDeckInput, starterDecks, toSavedDeck } from '@/lib/decks';
import type { DecksStatus } from '@/lib/decks-shared';
import { cardDb, currentUser, getDb } from '@/lib/server';

export async function GET(): Promise<Response> {
  const user = await currentUser();
  const cards = cardDb();
  const status: DecksStatus = {
    loggedIn: user !== null,
    decks: user ? (await listUserDecks(await getDb(), user.id)).map((deck) => toSavedDeck(deck, cards)) : [],
    starters: starterDecks(cards),
  };
  return Response.json(status);
}

export async function POST(request: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta para salvar decks no servidor.', 401);
  const cards = cardDb();
  const input = cleanDeckInput(await readJson(request), cards);
  if (typeof input === 'string') return jsonError(input, 400);
  const deck = await createUserDeck(await getDb(), user.id, input);
  if (!deck) return jsonError(`Você chegou ao limite de ${MAX_USER_DECKS} decks. Apague algum para criar outro.`, 409);
  return Response.json(toSavedDeck(deck, cards), { status: 201 });
}
