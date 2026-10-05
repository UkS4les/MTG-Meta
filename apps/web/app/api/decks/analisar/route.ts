import { jsonError, parsePlatform, readJson } from '@/lib/api';
import { analyzeDeck, readAnalyzeInput } from '@/lib/decks';
import { cardDb, currentUser, getDb } from '@/lib/server';

/** Confere uma lista em edição: nomes oficiais, imagens, cores, arquétipo parecido e cobertura da coleção. Não grava nada. */
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  const platform = parsePlatform(body?.plataforma);
  if (!platform) return jsonError('Plataforma inválida. Use "arena" ou "papel".', 400);
  const cards = cardDb();
  const input = readAnalyzeInput(body, platform, cards);
  if (typeof input === 'string') return jsonError(input, 413);
  return Response.json(await analyzeDeck(await getDb(), cards, await currentUser(), input));
}
