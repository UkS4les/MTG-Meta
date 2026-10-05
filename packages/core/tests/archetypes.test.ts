import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildSignature,
  deckColors,
  fitsColors,
  classifyDeck,
  clusterDecks,
  deckFeatures,
  deckKey,
  similarity,
  suggestName,
  type Features,
} from '../src/archetypes.ts';
import { parseDecklist } from '../src/parse-deck.ts';
import { CardDatabase } from '../src/card-db.ts';
import { cardImageUrl } from '../src/images.ts';
import { cardSlug } from '../src/normalize.ts';
import { card, testDb } from './helpers.ts';

const f = (cards: Record<string, number>): Features => new Map(Object.entries(cards));

test('deckFeatures ignora terrenos e sideboard', () => {
  const deck = parseDecklist('4 Monastery Swiftspear\n20 Mountain\n2 Snow-Covered Island\n\n3 Force of Will');
  assert.deepEqual([...deckFeatures(deck, testDb())], [['Monastery Swiftspear', 4]]);
});

test('deckFeatures usa o nome oficial e mantém cartas desconhecidas', () => {
  const deck = parseDecklist('4 Kumano Faces Kakkazan\n2 Carta Inventada');
  assert.deepEqual([...deckFeatures(deck, testDb())], [
    ['Kumano Faces Kakkazan // Etching of Kumano', 4],
    ['Carta Inventada', 2],
  ]);
});

test('similarity: idênticos = 1, sem cartas em comum = 0, parcial entre os dois', () => {
  assert.equal(similarity(f({ A: 4, B: 4 }), f({ A: 4, B: 4 })), 1);
  assert.equal(similarity(f({ A: 4 }), f({ B: 4 })), 0);
  assert.equal(similarity(f({ A: 4, B: 2 }), f({ A: 2, C: 2 })), 2 / 8);
  assert.equal(similarity(f({}), f({})), 0);
});

test('buildSignature tira a média e descarta cartas raras nas listas', () => {
  const members = Array.from({ length: 20 }, () => f({ A: 4, B: 2 }));
  members[0] = f({ A: 4, B: 2, Raro: 1 });
  const signature = buildSignature(members);
  assert.equal(signature.get('A'), 4);
  assert.equal(signature.get('B'), 2);
  assert.equal(signature.has('Raro'), false);
});

test('classifyDeck escolhe o mais parecido e respeita o limite', () => {
  const archetypes = [
    { id: 'burn', features: f({ Bolt: 4, Spike: 4, Guide: 4 }) },
    { id: 'control', features: f({ Counterspell: 4, Verdict: 3 }) },
  ];
  assert.equal(classifyDeck(f({ Bolt: 4, Spike: 4, Eidolon: 4 }), archetypes)?.id, 'burn');
  assert.equal(classifyDeck(f({ Bolt: 1, Tarmogoyf: 4, Thoughtseize: 4 }), archetypes), null);
});

test('clusterDecks separa arquétipos e junta variações do mesmo', () => {
  const decks = [
    f({ Bolt: 4, Spike: 4, Guide: 4, Eidolon: 4 }),
    f({ Counterspell: 4, Verdict: 3, Teferi: 2 }),
    f({ Bolt: 4, Spike: 4, Guide: 4, Skewer: 4 }),
    f({ Counterspell: 4, Verdict: 4, Teferi: 2 }),
    f({ Bolt: 4, Spike: 4, Guide: 4, Eidolon: 3, Skewer: 1 }),
    f({ Sozinho: 4 }),
  ];
  const clusters = clusterDecks(decks);
  assert.deepEqual(clusters.map((c) => c.members), [[0, 2, 4], [1, 3], [5]]);
  assert.equal(clusters[0]!.signature.get('Bolt'), 4);
});

test('clusterDecks une grupos que a ordem de entrada separou', () => {
  // Os dois extremos não se parecem o bastante para ficar juntos de início,
  // mas as assinaturas dos grupos convergem quando as listas intermediárias chegam.
  const decks = [
    f({ A: 4, B: 4, C: 4, D: 4, E: 4 }),
    f({ A: 4, B: 4, X: 4, Y: 4, Z: 4 }),
    f({ A: 4, B: 4, C: 4, X: 4, Y: 4 }),
    f({ A: 4, B: 4, C: 4, D: 4, X: 4 }),
    f({ A: 4, B: 4, C: 4, X: 4, Z: 4 }),
  ];
  const clusters = clusterDecks(decks);
  for (const [i, a] of clusters.entries()) {
    for (const b of clusters.slice(i + 1)) assert.ok(similarity(a.signature, b.signature) < 0.4);
  }
  assert.equal(clusters.flatMap((c) => c.members).length, decks.length);
});

test('suggestName prefere as cartas que só este arquétipo usa', () => {
  const burn = f({ Bolt: 4, Guide: 4, Spike: 3.5 });
  const others = [f({ Bolt: 4, Delver: 4 }), f({ Bolt: 4, Goyf: 4 })];
  assert.equal(suggestName(burn, others), 'Guide / Spike');
  assert.equal(suggestName(f({ 'Fire // Ice': 4 }), [], 1), 'Fire');
});

test('deckKey não depende da ordem das cartas', () => {
  const a = parseDecklist('4 Bolt\n2 Spike\n\n1 Shatter');
  const b = parseDecklist('2 Spike\n4 Bolt\n\n1 Shatter');
  const c = parseDecklist('2 Spike\n4 Bolt\n1 Shatter');
  assert.equal(deckKey(a), deckKey(b));
  assert.notEqual(deckKey(a), deckKey(c));
});

test('deckColors ignora terrenos e cores com poucas cópias; fitsColors aceita subconjuntos e incolores', () => {
  const db = new CardDatabase([
    card('Bolt', { colors: ['R'] }),
    card('Growth', { colors: ['G'] }),
    card('Splash', { colors: ['U'] }),
    card('Gold', { colors: ['R', 'G'] }),
    card('Relic', { colors: [] }),
    card('Taiga', { typeLine: 'Land — Mountain Forest', colors: ['R', 'G'] }),
    card('Tundra', { typeLine: 'Land', colors: ['W', 'U'] }),
  ]);
  assert.deepEqual(deckColors([['Bolt', 12], ['Growth', 10], ['Gold', 4], ['Splash', 1], ['Relic', 8], ['Tundra', 4], ['Desconhecida', 4]], db), ['R', 'G']);
  assert.deepEqual(deckColors([['Relic', 20], ['Taiga', 4]], db), []);
  assert.deepEqual(deckColors([], db), []);

  assert.equal(fitsColors(['R', 'G'], ['G', 'R', 'U']), true);
  assert.equal(fitsColors(['R', 'G'], ['R']), false);
  assert.equal(fitsColors([], ['W']), true);
  assert.equal(fitsColors(['R'], []), false);
});

test('busca de cartas: começo do nome primeiro, sem acento, com limite', () => {
  const db = new CardDatabase(['Lightning Bolt', 'Bolt Bend', 'Firebolt', "Lim-Dûl's Vault", 'Opt'].map((n) => card(n)));
  assert.deepEqual(db.search('bolt').map((c) => c.name), ['Bolt Bend', 'Firebolt', 'Lightning Bolt']);
  assert.deepEqual(db.search('LIM-DUL').map((c) => c.name), ["Lim-Dûl's Vault"]);
  assert.deepEqual(db.search('bolt', 1).map((c) => c.name), ['Bolt Bend']);
  assert.deepEqual(db.search('b'), []);
  assert.deepEqual(db.search('nada disso'), []);
});

test('cardImageUrl monta o endereço da carta inteira no Scryfall', () => {
  assert.equal(cardImageUrl('abcdef12-0000', 'small'), 'https://cards.scryfall.io/small/front/a/b/abcdef12-0000.jpg');
  assert.match(cardImageUrl('abcdef12-0000'), /\/normal\/front\//);
});

test('cardSlug gera endereço estável e getBySlug acha a carta', () => {
  assert.equal(cardSlug('Fire // Ice'), 'fire-ice');
  assert.equal(cardSlug("Lim-Dûl's Vault"), 'lim-dul-s-vault');
  assert.equal(cardSlug('  Urza, Lord High Artificer '), 'urza-lord-high-artificer');
  const db = new CardDatabase([card('Fire // Ice'), card("Lim-Dûl's Vault"), card('Opt')]);
  assert.equal(db.getBySlug('fire-ice')?.name, 'Fire // Ice');
  assert.equal(db.getBySlug('lim-dul-s-vault')?.name, "Lim-Dûl's Vault");
  assert.equal(db.getBySlug('nao-existe'), undefined);
  assert.deepEqual(db.all.map((c) => c.name), ['Fire // Ice', "Lim-Dûl's Vault", 'Opt']);
});
