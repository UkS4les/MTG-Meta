import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildSignature,
  classifyDeck,
  clusterDecks,
  deckFeatures,
  deckKey,
  similarity,
  suggestName,
  type Features,
} from '../src/archetypes.ts';
import { parseDecklist } from '../src/parse-deck.ts';
import { testDb } from './helpers.ts';

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
