import { getCollection, listMatches } from '@mtg-meta/db';
import { jsonError } from '@/lib/api';
import { currentUser, getDb } from '@/lib/server';

/** Tudo o que o site guarda sobre a pessoa, em um arquivo JSON (direito de acesso da LGPD). */
export async function GET(): Promise<Response> {
  const user = await currentUser();
  if (!user) return jsonError('Entre na sua conta.', 401);
  const db = await getDb();
  const [created] = await db.query<{ created_at: Date }>('select created_at from users where id = $1', [user.id]);
  const data = {
    email: user.email,
    contaCriadaEm: created ? new Date(created.created_at).toISOString() : null,
    colecoes: {
      arena: Object.fromEntries(await getCollection(db, user.id, 'arena')),
      papel: Object.fromEntries(await getCollection(db, user.id, 'paper')),
    },
    partidas: await listMatches(db, user.id),
  };
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="meus-dados.json"' },
  });
}
