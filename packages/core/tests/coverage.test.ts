import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeCoverage, rankDecks } from '../src/coverage.ts';
import type { Collection, Decklist, DeckEntry } from '../src/types.ts';
import { testDb } from './helpers.ts';

function deck(name: string, main: DeckEntry[], sideboard: DeckEntry[] = []): Decklist {
  return { name, main, sideboard, commander: [], warnings: [] };
}
const e = (quantity: number, name: string): DeckEntry => ({ quantity, name });

describe('computeCoverage', () => {
  const db = testDb();

  it('não conta terrenos básicos comuns, mas conta os snow', () => {
    const result = computeCoverage(deck('d', [e(20, 'Mountain'), e(4, 'Snow-Covered Island')]), new Map(), db, { platform: 'arena' });
    assert.equal(result.cardsNeeded, 4);
    assert.equal(result.cardsOwned, 0);
    assert.equal(result.wildcards.common, 4);
  });

  it('soma main + sideboard e limita ao que a pessoa tem', () => {
    const collection: Collection = new Map([['Eidolon of the Great Revel', 3]]);
    const result = computeCoverage(deck('d', [e(2, 'Eidolon of the Great Revel')], [e(2, 'Eidolon of the Great Revel')]), collection, db, {
      platform: 'arena',
    });
    assert.equal(result.cardsNeeded, 4);
    assert.equal(result.cardsOwned, 3);
    assert.equal(result.coverage, 0.75);
    assert.deepEqual(result.missing, [
      { name: 'Eidolon of the Great Revel', needed: 4, owned: 3, missing: 1, rarity: 'rare', unitPriceUsd: 2.5 },
    ]);
    assert.equal(result.wildcards.rare, 1);
  });

  it('calcula curingas por raridade e marca cartas que não existem no Arena', () => {
    const d = deck('d', [e(4, 'Bloodthirsty Adversary'), e(4, 'Monastery Swiftspear'), e(4, 'Force of Will')]);
    const result = computeCoverage(d, new Map([['Monastery Swiftspear', 1]]), db, { platform: 'arena' });
    assert.deepEqual(result.wildcards, { common: 0, uncommon: 3, rare: 0, mythic: 4 });
    assert.deepEqual(result.notOnArena, ['Force of Will']);
    // Ordem: raridade mais alta primeiro; carta sem raridade no Arena vai como mítica.
    assert.deepEqual(
      result.missing.map((m) => m.name),
      ['Bloodthirsty Adversary', 'Force of Will', 'Monastery Swiftspear'],
    );
  });

  it('no papel, soma o custo e avisa das cartas sem preço', () => {
    const d = deck('d', [e(4, 'Bloodthirsty Adversary'), e(2, 'Carta Sem Preço'), e(4, 'Kumano Faces Kakkazan')]);
    const collection: Collection = new Map([['Bloodthirsty Adversary', 2]]);
    const result = computeCoverage(d, collection, db, { platform: 'paper' });
    assert.equal(result.costUsd, 2 * 6 + 4 * 0.4);
    assert.deepEqual(result.unpricedMissing, ['Carta Sem Preço']);
    assert.deepEqual(result.notOnArena, []);
    // No papel a lista vem pelo peso no bolso, com as cartas sem preço no topo.
    assert.deepEqual(
      result.missing.map((m) => m.name),
      ['Carta Sem Preço', 'Bloodthirsty Adversary', 'Kumano Faces Kakkazan // Etching of Kumano'],
    );
  });

  it('no Arena, 4 cópias de uma carta "qualquer número" cobrem o deck inteiro', () => {
    const d = deck('ratos', [e(20, 'Persistent Petitioners')]);
    const collection: Collection = new Map([['Persistent Petitioners', 4]]);
    assert.equal(computeCoverage(d, collection, db, { platform: 'arena' }).coverage, 1);
    assert.equal(computeCoverage(d, collection, db, { platform: 'paper' }).coverage, 4 / 20);
  });

  it('conta nomes desconhecidos como faltando', () => {
    const result = computeCoverage(deck('d', [e(4, 'Carta Inventada'), e(4, 'Monastery Swiftspear')]), new Map([['Monastery Swiftspear', 4]]), db, {
      platform: 'arena',
    });
    assert.deepEqual(result.unknown, ['Carta Inventada']);
    assert.equal(result.coverage, 0.5);
  });

  it('deck só com básicos tem cobertura total', () => {
    assert.equal(computeCoverage(deck('d', [e(60, 'Mountain')]), new Map(), db, { platform: 'arena' }).coverage, 1);
  });
});

describe('rankDecks', () => {
  const db = testDb();
  const collection: Collection = new Map([
    ['Monastery Swiftspear', 4],
    ['Eidolon of the Great Revel', 4],
  ]);
  const decks = [
    deck('Metade', [e(4, 'Monastery Swiftspear'), e(4, 'Kumano Faces Kakkazan')]),
    deck('Quase', [e(4, 'Monastery Swiftspear'), e(4, 'Eidolon of the Great Revel'), e(1, 'Bloodthirsty Adversary')]),
    deck('Papel', [e(4, 'Force of Will')]),
  ];

  it('ordena por cobertura e manda para o fim o que não existe no Arena', () => {
    const ranked = rankDecks(decks, collection, db, { platform: 'arena' });
    assert.deepEqual(
      ranked.map((r) => r.deck.name),
      ['Quase', 'Metade', 'Papel'],
    );
  });

  it('por custo no Arena, menos curingas míticos vem primeiro', () => {
    const ranked = rankDecks(decks, collection, db, { platform: 'arena', sortBy: 'cost' });
    assert.deepEqual(
      ranked.map((r) => r.deck.name),
      ['Metade', 'Quase', 'Papel'],
    );
  });

  it('por custo no papel, ordena pelo valor em dólar', () => {
    const ranked = rankDecks(decks, collection, db, { platform: 'paper', sortBy: 'cost' });
    assert.deepEqual(
      ranked.map((r) => [r.deck.name, r.costUsd]),
      [
        ['Metade', 1.6],
        ['Quase', 6],
        ['Papel', 320],
      ],
    );
  });
});
