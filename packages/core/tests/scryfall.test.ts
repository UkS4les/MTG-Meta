import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { CardDatabase } from '../src/card-db.ts';
import { readJsonArray } from '../src/json-stream.ts';
import { buildCardsFromScryfall, type ScryfallCard } from '../src/scryfall.ts';

function printing(overrides: Partial<ScryfallCard> & { name: string }): ScryfallCard {
  return {
    id: Math.random().toString(36),
    oracle_id: `oracle-${overrides.name}`,
    layout: 'normal',
    rarity: 'common',
    games: ['paper'],
    set_type: 'expansion',
    type_line: 'Instant',
    prices: { usd: '0.10' },
    ...overrides,
  };
}

describe('buildCardsFromScryfall', () => {
  it('guarda os identificadores do Arena de todas as impressões', () => {
    const cards = buildCardsFromScryfall([
      printing({ name: 'Opt', arena_id: 70001, games: ['arena'] }),
      printing({ name: 'Opt', arena_id: 81234, games: ['arena'] }),
      printing({ name: 'Opt', arena_id: 81234, games: ['arena'] }),
      printing({ name: 'Opt' }),
    ]);
    assert.deepEqual(cards[0]!.arenaIds, [70001, 81234]);
    const db = new CardDatabase(cards);
    assert.equal(db.getByArenaId(81234)?.name, 'Opt');
    assert.equal(db.getByArenaId(1), undefined);
  });

  it('guarda nomes alternativos em inglês e encontra a carta por eles', () => {
    const cards = buildCardsFromScryfall([
      printing({ name: 'Spider Manifestation', lang: 'en', games: ['paper'] }),
      printing({ name: 'Spider Manifestation', lang: 'en', printed_name: 'Leyline Weaver', games: ['mtgo'] }),
      printing({ name: 'Spider Manifestation', lang: 'en', printed_name: 'Leyline Weaver', games: ['arena'] }),
      printing({ name: 'Spider Manifestation', lang: 'ja', printed_name: 'スパイダー' }),
      printing({ name: 'Dorothea, Vengeful Victim', lang: 'en', flavor_name: 'Godzilla, Test Monster' }),
    ]);
    const spider = cards.find((c) => c.name === 'Spider Manifestation')!;
    assert.deepEqual(spider.aliases, ['Leyline Weaver']);
    const db = new CardDatabase(cards);
    assert.equal(db.get('leyline weaver')?.name, 'Spider Manifestation');
    assert.equal(db.get('Godzilla, Test Monster')?.name, 'Dorothea, Vengeful Victim');
    assert.equal(db.size, 2);
  });

  it('pega a menor raridade por plataforma e o menor preço em papel', () => {
    const cards = buildCardsFromScryfall([
      printing({ name: 'Fatal Push', rarity: 'rare', games: ['arena'], prices: { usd: null } }),
      printing({ name: 'Fatal Push', rarity: 'uncommon', games: ['paper', 'mtgo'], prices: { usd: '1.50' } }),
      printing({ name: 'Fatal Push', rarity: 'uncommon', games: ['paper'], prices: { usd: null, usd_foil: '0.90' } }),
    ]);
    assert.equal(cards.length, 1);
    assert.equal(cards[0]!.arenaRarity, 'rare');
    assert.equal(cards[0]!.paperRarity, 'uncommon');
    assert.equal(cards[0]!.priceUsd, 0.9);
  });

  it('ignora tokens e impressões de memorabilia', () => {
    const cards = buildCardsFromScryfall([
      printing({ name: 'Goblin', layout: 'token' }),
      printing({ name: 'Lightning Bolt', set_type: 'memorabilia', prices: { usd: '0.01' } }),
      printing({ name: 'Lightning Bolt', prices: { usd: '1.00' } }),
    ]);
    assert.deepEqual(
      cards.map((c) => [c.name, c.priceUsd]),
      [['Lightning Bolt', 1]],
    );
  });

  it('registra faces, básicos grátis (não snow) e a regra de "qualquer número"', () => {
    const cards = buildCardsFromScryfall([
      printing({
        name: 'Graveyard Trespasser // Graveyard Glutton',
        layout: 'transform',
        type_line: undefined,
        card_faces: [
          { name: 'Graveyard Trespasser', type_line: 'Creature — Human Werewolf' },
          { name: 'Graveyard Glutton', type_line: 'Creature — Werewolf' },
        ],
      }),
      printing({ name: 'Plains', type_line: 'Basic Land — Plains' }),
      printing({ name: 'Snow-Covered Plains', type_line: 'Basic Snow Land — Plains' }),
      printing({ name: 'Rat Colony', oracle_text: 'A deck can have any number of cards named Rat Colony.' }),
      printing({
        name: 'Zndrsplt // Reversível',
        oracle_id: undefined,
        layout: 'reversible_card',
        card_faces: [{ name: 'Zndrsplt', oracle_id: 'o-z' }, { name: 'Zndrsplt', oracle_id: 'o-z' }],
      }),
    ]);
    const db = new CardDatabase(cards);
    const trespasser = db.get('Graveyard Trespasser');
    assert.equal(trespasser?.name, 'Graveyard Trespasser // Graveyard Glutton');
    assert.equal(trespasser?.typeLine, 'Creature — Human Werewolf // Creature — Werewolf');
    assert.equal(db.get('Plains')?.freeBasic, true);
    assert.equal(db.get('Snow-Covered Plains')?.freeBasic, false);
    assert.equal(db.get('Rat Colony')?.anyNumber, true);
    assert.equal(db.get('Zndrsplt')?.name, 'Zndrsplt // Reversível');
  });
});

describe('readJsonArray', () => {
  it('lê objetos um a um, inclusive com chaves e aspas dentro de strings e entre blocos de leitura', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mtg-meta-'));
    const file = join(dir, 'bulk.json');
    const items = Array.from({ length: 3000 }, (_, i) => ({
      i,
      text: `{ texto com "aspas", chaves } e \\ barra ${'x'.repeat(i % 700)}`,
      nested: { list: [{ a: i }] },
    }));
    writeFileSync(file, `[\n${items.map((item) => JSON.stringify(item)).join(',\n')}\n]`);
    try {
      const read: unknown[] = [];
      for await (const item of readJsonArray(file)) read.push(item);
      assert.deepEqual(read, items);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
