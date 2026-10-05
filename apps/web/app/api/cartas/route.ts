import type { CardSuggestion } from '@/lib/cards-shared';
import { cardDb } from '@/lib/server';

/** Busca de cartas por pedaço do nome, para o editor de decks. */
export function GET(request: Request): Response {
  const query = new URL(request.url).searchParams.get('q') ?? '';
  const results: CardSuggestion[] = cardDb()
    .search(query.slice(0, 60), 10)
    .map((card) => ({ name: card.name, imageId: card.imageId ?? null, typeLine: card.typeLine, colors: card.colors ?? [] }));
  return Response.json(results, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
