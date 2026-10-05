import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { parseDecklist, type Tournament } from '@mtg-meta/core';
import {
  collectionSummaries,
  createApiToken,
  getApiTokenInfo,
  getApiTokenUser,
  revokeApiToken,
  createSession,
  createUser,
  deleteCollection,
  deleteMatches,
  deleteSession,
  deleteUser,
  getArchetype,
  getCollection,
  getFormatStatus,
  getMeta,
  getSessionUser,
  ingestedFiles,
  listMatches,
  markIngested,
  openDb,
  refreshMetaSnapshots,
  renameArchetype,
  saveCollection,
  saveMatches,
  storeTournament,
  verifyLogin,
  type Db,
  type MatchRecord,
} from '../src/index.ts';

let db: Db;
before(async () => {
  db = await openDb({ location: 'memory://' });
});
after(() => db.close());

describe('contas e sessões', () => {
  it('cria conta, recusa e-mail repetido e confere a senha', async () => {
    const user = await createUser(db, '  Ana@Exemplo.com ', 'senha-segura');
    assert.equal(user?.email, 'ana@exemplo.com');
    assert.equal(await createUser(db, 'ana@exemplo.com', 'outra-senha'), null);
    assert.equal((await verifyLogin(db, 'ANA@exemplo.com', 'senha-segura'))?.id, user!.id);
    assert.equal(await verifyLogin(db, 'ana@exemplo.com', 'senha-errada'), null);
    assert.equal(await verifyLogin(db, 'ninguem@exemplo.com', 'senha-segura'), null);
  });

  it('não guarda a senha nem o token em texto puro', async () => {
    const user = (await createUser(db, 'bia@exemplo.com', 'senha-segura'))!;
    const token = await createSession(db, user.id);
    const [stored] = await db.query<{ password_hash: string }>('select password_hash from users where id = $1', [user.id]);
    assert.ok(!stored!.password_hash.includes('senha-segura'));
    const sessions = await db.query<{ token_hash: string }>('select token_hash from sessions where user_id = $1', [user.id]);
    assert.equal(sessions.length, 1);
    assert.notEqual(sessions[0]!.token_hash, token);
  });

  it('sessão vale até sair, expirar ou a conta ser apagada', async () => {
    const user = (await createUser(db, 'caio@exemplo.com', 'senha-segura'))!;
    const token = await createSession(db, user.id);
    assert.equal((await getSessionUser(db, token))?.email, 'caio@exemplo.com');
    assert.equal(await getSessionUser(db, 'token-inventado'), null);

    await deleteSession(db, token);
    assert.equal(await getSessionUser(db, token), null);

    const expired = await createSession(db, user.id);
    await db.query(`update sessions set expires_at = now() - interval '1 minute' where user_id = $1`, [user.id]);
    assert.equal(await getSessionUser(db, expired), null);

    const last = await createSession(db, user.id);
    await saveCollection(db, user.id, 'arena', new Map([['Opt', 4]]));
    await deleteUser(db, user.id);
    assert.equal(await getSessionUser(db, last), null);
    assert.equal((await db.query('select 1 from collections where user_id = $1', [user.id])).length, 0);
  });
});

describe('coleções', () => {
  it('salva por plataforma, substitui na reimportação e apaga', async () => {
    const user = (await createUser(db, 'duda@exemplo.com', 'senha-segura'))!;
    await saveCollection(db, user.id, 'arena', new Map([['Opt', 4], ["Lim-Dûl's Vault", 1]]));
    await saveCollection(db, user.id, 'paper', new Map([['Force of Will', 2]]));
    assert.deepEqual([...(await getCollection(db, user.id, 'arena'))], [["Lim-Dûl's Vault", 1], ['Opt', 4]]);

    await saveCollection(db, user.id, 'arena', new Map([['Negate', 3]]));
    assert.deepEqual([...(await getCollection(db, user.id, 'arena'))], [['Negate', 3]]);
    assert.deepEqual([...(await getCollection(db, user.id, 'paper'))], [['Force of Will', 2]]);

    const summaries = await collectionSummaries(db, user.id);
    assert.deepEqual(summaries.map((s) => [s.platform, s.cards, s.copies]).sort(), [['arena', 1, 3], ['paper', 1, 2]]);

    await deleteCollection(db, user.id, 'arena');
    assert.equal((await getCollection(db, user.id, 'arena')).size, 0);
    await saveCollection(db, user.id, 'paper', new Map());
    assert.equal((await getCollection(db, user.id, 'paper')).size, 0);
  });
});

describe('torneios e meta', () => {
  const today = new Date().toISOString().slice(0, 10);
  const burn = parseDecklist('4 Lightning Bolt\n4 Goblin Guide\n20 Mountain\n\n2 Smash to Smithereens');
  const control = parseDecklist('4 Counterspell\n3 Supreme Verdict\n24 Island');
  const tournament = (id: string, results: Tournament['results']): Tournament => ({
    id,
    name: 'Modern Challenge 32',
    format: 'modern',
    date: today,
    url: `https://www.mtgo.com/decklist/${id}`,
    players: 40,
    results,
  });
  const result = (player: string, deck: typeof burn, placement: number) => ({ player, placement, wins: null, losses: null, url: null, deck });

  it('a mesma lista em dois torneios vira um deck só', async () => {
    await storeTournament(db, tournament('t1', [result('a', burn, 1), result('b', control, 2)]), 'teste');
    await storeTournament(db, tournament('t2', [result('c', burn, 1)]), 'teste');
    const [count] = await db.query<{ decks: number; results: number }>(
      'select (select count(*)::int from decks) as decks, (select count(*)::int from event_results) as results',
    );
    assert.deepEqual(count, { decks: 2, results: 3 });
  });

  it('regravar um torneio troca os resultados em vez de duplicar', async () => {
    await storeTournament(db, tournament('t2', [result('c', burn, 1), result('d', burn, 2)]), 'teste');
    const rows = await db.query('select 1 from event_results where event_id = $1', ['t2']);
    assert.equal(rows.length, 2);
  });

  it('calcula a participação por arquétipo e separa os sem arquétipo', async () => {
    const [archetype] = await db.query<{ id: number }>(`insert into archetypes (format, name, signature) values ('modern', 'Burn', '{}') returning id`);
    await db.query(`update decks set archetype_id = $1 where id in (select deck_id from event_results where player_handle = 'a')`, [archetype!.id]);
    await refreshMetaSnapshots(db, 'modern');

    const meta = await getMeta(db, 'modern', 7);
    assert.deepEqual(meta.map((m) => [m.name, m.decks]), [['Burn', 3], [null, 1]]);
    assert.equal(meta[0]!.share, 0.75);
    assert.deepEqual(await getMeta(db, 'standard', 7), []);

    const status = await getFormatStatus(db, 'modern', 7);
    assert.deepEqual([status.events, status.results, status.lastEventDate], [2, 4, today]);
  });

  it('renomear arquétipo marca como nomeado e recusa nome repetido no formato', async () => {
    const [other] = await db.query<{ id: number }>(`insert into archetypes (format, name, signature) values ('modern', 'Auto / Nome', '{}') returning id`);
    assert.equal(await renameArchetype(db, other!.id, 'Burn'), false);
    assert.equal(await renameArchetype(db, other!.id, 'Azorius Control'), true);
    assert.equal(await renameArchetype(db, 999_999, 'Qualquer'), false);
    const renamed = await getArchetype(db, other!.id);
    assert.deepEqual([renamed?.name, renamed?.autoNamed], ['Azorius Control', false]);
  });

  it('lembra os arquivos já lidos e atualiza o hash', async () => {
    await markIngested(db, 'a.json', 'sha1');
    await markIngested(db, 'a.json', 'sha2');
    assert.deepEqual([...(await ingestedFiles(db))], [['a.json', 'sha2']]);
  });
});

describe('partidas do Arena', () => {
  const record = (id: string, overrides: Partial<MatchRecord> = {}): MatchRecord => ({
    id,
    eventId: 'Ladder',
    startedAt: '2026-10-01T12:00:00.000Z',
    result: 'win',
    gamesWon: 1,
    gamesLost: 0,
    onPlay: true,
    deckName: 'Mono Red',
    deck: { main: [{ name: 'Lightning Bolt', quantity: 4 }], sideboard: [], commander: [] },
    deckArchetype: null,
    opponentCards: ["Lim-Dûl's Vault", 'Opt'],
    opponentArchetype: null,
    ...overrides,
  });

  it('salva, não duplica na reimportação e devolve da mais recente para a mais antiga', async () => {
    const user = (await createUser(db, 'edu@exemplo.com', 'senha-segura'))!;
    const [archetype] = await db.query<{ id: number }>(`insert into archetypes (format, name, signature) values ('standard', 'Izzet', '{}') returning id`);
    const izzet = { id: archetype!.id, name: 'Izzet', format: 'standard' };

    assert.equal(await saveMatches(db, user.id, [record('a'), record('b', { startedAt: '2026-10-02T12:00:00.000Z', result: 'loss' })]), 2);
    const again = [record('a', { opponentArchetype: { ...izzet, confidence: 0.75 }, deckArchetype: izzet }), record('c', { startedAt: null, deck: null, deckName: null, onPlay: null })];
    assert.equal(await saveMatches(db, user.id, again), 1);
    assert.equal(await saveMatches(db, user.id, []), 0);

    const stored = await listMatches(db, user.id);
    assert.deepEqual(stored.map((m) => m.id), ['b', 'a', 'c']);
    assert.deepEqual(stored[1], again[0]);
    assert.deepEqual(stored[2], again[1]);
  });

  it('cada pessoa vê só as suas, e apagar a conta leva as partidas junto', async () => {
    const one = (await createUser(db, 'fabi@exemplo.com', 'senha-segura'))!;
    const two = (await createUser(db, 'gui@exemplo.com', 'senha-segura'))!;
    await saveMatches(db, one.id, [record('x')]);
    await saveMatches(db, two.id, [record('x'), record('y')]);
    assert.equal((await listMatches(db, one.id)).length, 1);

    await deleteMatches(db, one.id);
    assert.equal((await listMatches(db, one.id)).length, 0);
    assert.equal((await listMatches(db, two.id)).length, 2);

    await deleteUser(db, two.id);
    assert.equal((await db.query('select 1 from matches where user_id = $1', [two.id])).length, 0);
  });
});

describe('chave do tracker', () => {
  it('identifica a pessoa, registra o uso e guarda só o hash', async () => {
    const user = (await createUser(db, 'hugo@exemplo.com', 'senha-segura'))!;
    assert.equal(await getApiTokenInfo(db, user.id), null);
    const token = await createApiToken(db, user.id);
    assert.match(token, /^mtgm_[\w-]{40,}$/);
    assert.equal((await getApiTokenInfo(db, user.id))?.lastUsedAt, null);

    assert.equal((await getApiTokenUser(db, token))?.email, 'hugo@exemplo.com');
    assert.notEqual((await getApiTokenInfo(db, user.id))?.lastUsedAt, null);
    assert.equal(await getApiTokenUser(db, 'mtgm_inventado'), null);
    assert.equal(await getApiTokenUser(db, token.slice(5)), null);
    const [stored] = await db.query<{ token_hash: string }>('select token_hash from api_tokens where user_id = $1', [user.id]);
    assert.ok(!token.includes(stored!.token_hash) && !stored!.token_hash.includes(token));
  });

  it('gerar outra invalida a anterior; revogar e apagar a conta invalidam todas', async () => {
    const user = (await createUser(db, 'iara@exemplo.com', 'senha-segura'))!;
    const first = await createApiToken(db, user.id);
    const second = await createApiToken(db, user.id);
    assert.equal(await getApiTokenUser(db, first), null);
    assert.equal((await getApiTokenUser(db, second))?.id, user.id);
    await revokeApiToken(db, user.id);
    assert.equal(await getApiTokenUser(db, second), null);

    const third = await createApiToken(db, user.id);
    await deleteUser(db, user.id);
    assert.equal(await getApiTokenUser(db, third), null);
  });
});
