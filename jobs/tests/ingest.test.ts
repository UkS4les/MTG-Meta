import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { CardDatabase, type CardInfo, type MtgoTournamentFile } from '@mtg-meta/core';
import { getArchetypeDecks, getMeta, listArchetypes, openDb, type Db } from '@mtg-meta/db';
import { runIngest } from '../src/ingest.ts';
import { selectFiles, type Fetch, type SourceFile } from '../src/source.ts';

const card = (name: string, typeLine = 'Instant'): CardInfo => ({
  name,
  faceNames: [],
  typeLine,
  freeBasic: typeLine.startsWith('Basic Land'),
  anyNumber: false,
  arenaRarity: 'common',
  paperRarity: 'common',
  priceUsd: 0.1,
});
const cards = new CardDatabase([card('Mountain', 'Basic Land — Mountain'), card('Island', 'Basic Land — Island')]);

const today = new Date().toISOString().slice(0, 10);
const [year, month, day] = today.split('-');
const dir = `Tournaments/MTGO/${year}/${month}/${day}`;

const list = (cardsOf: Record<string, number>) => Object.entries(cardsOf).map(([CardName, Count]) => ({ CardName, Count }));
const burn = (flex: string) => list({ 'Lightning Bolt': 4, 'Goblin Guide': 4, 'Lava Spike': 4, [flex]: 4, Mountain: 20 });
const control = (flex: string) => list({ Counterspell: 4, 'Supreme Verdict': 4, 'Teferi, Hero of Dominaria': 3, [flex]: 2, Island: 24 });

function challenge(decks: { Count: number; CardName: string }[][]): MtgoTournamentFile {
  return {
    Tournament: { Date: today, Name: 'Modern Challenge 32', Uri: 'https://www.mtgo.com/decklist/modern-challenge-32-1', Formats: 'Modern', PlayerCount: 50 },
    Decks: decks.map((Mainboard, i) => ({ Player: `p${i}`, Result: `${i + 1}th Place`, Mainboard, Sideboard: [] })),
  };
}

/** Finge o GitHub: a listagem de arquivos e o conteúdo de cada um. */
function fakeSource(files: Record<string, { sha: string; body: MtgoTournamentFile | 'broken' }>): { fetch: Fetch; downloads: string[] } {
  const downloads: string[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/git/trees/')) {
      return Response.json({ truncated: false, tree: Object.entries(files).map(([path, f]) => ({ path, sha: f.sha, type: 'blob' })) });
    }
    const path = Object.keys(files).find((p) => url.endsWith(p));
    if (!path) return new Response('not found', { status: 404 });
    downloads.push(path);
    const { body } = files[path]!;
    return body === 'broken' ? new Response('{ não é json', { status: 200 }) : Response.json(body);
  }) as Fetch;
  return { fetch: fetchFn, downloads };
}

describe('selectFiles', () => {
  const file = (slug: string, date: string): SourceFile => ({ path: `x/${slug}.json`, sha: 's', date, slug });
  it('filtra por formato e data sem confundir premodern com modern', () => {
    const files = [file('modern-league-1', '2026-10-03'), file('premodern-league-1', '2026-10-03'), file('modern-league-0', '2026-09-01'), file('legacy-league-1', '2026-10-03')];
    assert.deepEqual(selectFiles(files, ['modern', 'standard'], '2026-10-01').map((f) => f.slug), ['modern-league-1']);
  });
});

describe('runIngest', () => {
  let db: Db;
  before(async () => {
    db = await openDb({ location: 'memory://' });
  });
  after(() => db.close());

  const first = challenge([burn('Eidolon of the Great Revel'), burn('Skewer the Critics'), burn('Rift Bolt'), control('Negate'), control('Dovin’s Veto'), control('Absorb'), list({ Sozinho: 4 })]);
  const path = `${dir}/modern-challenge-32-1.json`;

  it('baixa, classifica e calcula o meta', async () => {
    const source = fakeSource({
      [path]: { sha: 'v1', body: first },
      [`${dir}/legacy-challenge-32-1.json`]: { sha: 'x', body: first },
      'README.md': { sha: 'r', body: first },
    });
    const summary = await runIngest(db, cards, { formats: ['modern'], fetch: source.fetch, delayMs: 0 });
    assert.deepEqual(source.downloads, [path]);
    assert.deepEqual([summary.filesDownloaded, summary.filesFailed, summary.results], [1, 0, 7]);
    assert.deepEqual(summary.formats.modern, { decks: 7, matched: 0, newArchetypes: 2, unclassified: 1 });

    const archetypes = await listArchetypes(db, 'modern');
    assert.equal(archetypes.length, 2);
    assert.ok(archetypes.every((a) => a.sampleDeckId !== null && !('Mountain' in a.signature) && !('Island' in a.signature)));

    const meta = await getMeta(db, 'modern', 30);
    assert.deepEqual(meta.map((m) => m.decks), [3, 3, 1]);
    assert.equal(meta.at(-1)!.archetypeId, null);
    assert.equal((await getArchetypeDecks(db, 'modern', 30)).length, 2);
  });

  it('não baixa de novo o que não mudou', async () => {
    const source = fakeSource({ [path]: { sha: 'v1', body: first } });
    const summary = await runIngest(db, cards, { formats: ['modern'], fetch: source.fetch, delayMs: 0 });
    assert.deepEqual(source.downloads, []);
    assert.equal(summary.formats.modern!.newArchetypes, 0);
  });

  it('arquivo alterado é relido e decks novos entram nos arquétipos existentes', async () => {
    const before = await listArchetypes(db, 'modern');
    const updated = challenge([...first.Decks.map((d) => d.Mainboard), burn('Monastery Swiftspear')]);
    const source = fakeSource({ [path]: { sha: 'v2', body: updated } });
    const summary = await runIngest(db, cards, { formats: ['modern'], fetch: source.fetch, delayMs: 0 });
    assert.deepEqual(source.downloads, [path]);
    assert.deepEqual(summary.formats.modern, { decks: 8, matched: 1, newArchetypes: 0, unclassified: 1 });
    const now = await listArchetypes(db, 'modern');
    assert.deepEqual(now.map((a) => [a.id, a.name]), before.map((a) => [a.id, a.name]));
    assert.deepEqual((await getMeta(db, 'modern', 30)).map((m) => m.decks), [4, 3, 1]);
  });

  it('um arquivo quebrado não derruba a ingestão e é tentado de novo depois', async () => {
    const other = `${dir}/modern-league-9.json`;
    const broken = fakeSource({ [path]: { sha: 'v2', body: first }, [other]: { sha: 'b1', body: 'broken' } });
    const failed = await runIngest(db, cards, { formats: ['modern'], fetch: broken.fetch, delayMs: 0 });
    assert.deepEqual([failed.filesDownloaded, failed.filesFailed], [0, 1]);

    const league: MtgoTournamentFile = {
      Tournament: { Date: today, Name: 'Modern League', Uri: 'https://www.mtgo.com/decklist/modern-league-9', Formats: 'Modern' },
      Decks: [{ Player: 'z', Result: '5-0', Mainboard: burn('Rift Bolt'), Sideboard: [] }],
    };
    const fixed = fakeSource({ [path]: { sha: 'v2', body: first }, [other]: { sha: 'b1', body: league } });
    const retried = await runIngest(db, cards, { formats: ['modern'], fetch: fixed.fetch, delayMs: 0 });
    assert.deepEqual([fixed.downloads, retried.filesDownloaded, retried.results], [[other], 1, 1]);
  });

  it('avisa quando o GitHub corta a listagem', async () => {
    const truncated = (async () => Response.json({ truncated: true, tree: [] })) as Fetch;
    await assert.rejects(runIngest(db, cards, { formats: ['modern'], fetch: truncated, delayMs: 0 }), /cortada/);
  });
});
