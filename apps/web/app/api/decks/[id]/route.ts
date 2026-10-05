import { deleteUserDeck, updateUserDeck } from '@mtg-meta/db';
import { jsonError, readJson } from '@/lib/api';
import { cleanDeckInput, toSavedDeck } from '@/lib/decks';
import { cardDb, currentUser, getDb } from '@/lib/server';

interface Context {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, { params }: Context): Promise<Response> {
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta.', 401);
  const cards = cardDb();
  const input = cleanDeckInput(await readJson(request), cards);
  if (typeof input === 'string') return jsonError(input, 400);
  const deck = await updateUserDeck(await getDb(), user.id, (await params).id, input);
  if (!deck) return jsonError('Deck não encontrado.', 404);
  return Response.json(toSavedDeck(deck, cards));
}

export async function DELETE(_request: Request, { params }: Context): Promise<Response> {
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta.', 401);
  if (!(await deleteUserDeck(await getDb(), user.id, (await params).id))) return jsonError('Deck não encontrado.', 404);
  return new Response(null, { status: 204 });
}
