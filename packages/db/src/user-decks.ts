import type { DeckEntry } from '@mtg-meta/core';
import type { Db } from './client.ts';

/** Limite de decks por pessoa: bem acima do uso real, só para o banco não crescer sem fim. */
export const MAX_USER_DECKS = 200;

export interface UserDeck {
  id: string;
  name: string;
  format: string | null;
  main: DeckEntry[];
  sideboard: DeckEntry[];
  updatedAt: string;
}

export type UserDeckInput = Pick<UserDeck, 'name' | 'format' | 'main' | 'sideboard'>;

interface Row {
  id: string;
  name: string;
  format: string | null;
  main: DeckEntry[];
  sideboard: DeckEntry[];
  updated_at: Date;
}

const COLUMNS = 'id, name, format, main, sideboard, updated_at';
const toDeck = (r: Row): UserDeck => ({ id: r.id, name: r.name, format: r.format, main: r.main, sideboard: r.sideboard, updatedAt: new Date(r.updated_at).toISOString() });
const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** Decks da pessoa, do mais recentemente alterado para o mais antigo. */
export async function listUserDecks(db: Db, userId: string): Promise<UserDeck[]> {
  return (await db.query<Row>(`select ${COLUMNS} from user_decks where user_id = $1 order by updated_at desc, id`, [userId])).map(toDeck);
}

/** Cria o deck. Devolve null se a pessoa já chegou ao limite. */
export async function createUserDeck(db: Db, userId: string, deck: UserDeckInput): Promise<UserDeck | null> {
  const rows = await db.query<Row>(
    `insert into user_decks (user_id, name, format, main, sideboard)
     select $1, $2, $3, $4::jsonb, $5::jsonb
     where (select count(*) from user_decks where user_id = $1) < $6
     returning ${COLUMNS}`,
    [userId, deck.name, deck.format, JSON.stringify(deck.main), JSON.stringify(deck.sideboard), MAX_USER_DECKS],
  );
  return rows[0] ? toDeck(rows[0]) : null;
}

/** Atualiza um deck da pessoa. Devolve null se ele não existe ou é de outra conta. */
export async function updateUserDeck(db: Db, userId: string, id: string, deck: UserDeckInput): Promise<UserDeck | null> {
  if (!isUuid(id)) return null;
  const rows = await db.query<Row>(
    `update user_decks set name = $3, format = $4, main = $5::jsonb, sideboard = $6::jsonb, updated_at = now()
     where id = $2 and user_id = $1 returning ${COLUMNS}`,
    [userId, id, deck.name, deck.format, JSON.stringify(deck.main), JSON.stringify(deck.sideboard)],
  );
  return rows[0] ? toDeck(rows[0]) : null;
}

/** Devolve false se o deck não existe ou é de outra conta. */
export async function deleteUserDeck(db: Db, userId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  return (await db.query('delete from user_decks where id = $2 and user_id = $1 returning id', [userId, id])).length > 0;
}
