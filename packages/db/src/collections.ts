import type { Collection, Platform } from '@mtg-meta/core';
import type { Db } from './client.ts';

/** Substitui a coleção inteira da plataforma pela que foi importada. */
export async function saveCollection(db: Db, userId: string, platform: Platform, collection: Collection): Promise<void> {
  const rows = [...collection].map(([card_name, quantity]) => ({ card_name, quantity }));
  await db.transaction(async (tx) => {
    await tx.query('delete from collections where user_id = $1 and platform = $2', [userId, platform]);
    await tx.query(
      `insert into collections (user_id, platform, card_name, quantity)
       select $1, $2, r.card_name, r.quantity from jsonb_to_recordset($3::jsonb) as r(card_name text, quantity integer)`,
      [userId, platform, JSON.stringify(rows)],
    );
  });
}

export async function getCollection(db: Db, userId: string, platform: Platform): Promise<Collection> {
  const rows = await db.query<{ card_name: string; quantity: number }>(
    'select card_name, quantity from collections where user_id = $1 and platform = $2 order by card_name',
    [userId, platform],
  );
  return new Map(rows.map((r) => [r.card_name, r.quantity]));
}

export async function deleteCollection(db: Db, userId: string, platform: Platform): Promise<void> {
  await db.query('delete from collections where user_id = $1 and platform = $2', [userId, platform]);
}

export interface CollectionSummary {
  platform: Platform;
  cards: number;
  copies: number;
  updatedAt: string;
}

export async function collectionSummaries(db: Db, userId: string): Promise<CollectionSummary[]> {
  const rows = await db.query<{ platform: Platform; cards: number; copies: number; updated_at: Date }>(
    `select platform, count(*)::int as cards, sum(quantity)::int as copies, max(updated_at) as updated_at
     from collections where user_id = $1 group by platform`,
    [userId],
  );
  return rows.map((r) => ({ platform: r.platform, cards: r.cards, copies: r.copies, updatedAt: new Date(r.updated_at).toISOString() }));
}
