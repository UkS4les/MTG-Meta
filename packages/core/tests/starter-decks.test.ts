import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_STARTER_DECKS } from '../src/starter-decks.ts';

test('decks iniciais do Arena: 15 decks de 60 cartas, sem nomes ou cartas repetidos', () => {
  assert.equal(ARENA_STARTER_DECKS.length, 15);
  assert.equal(ARENA_STARTER_DECKS.filter((d) => d.kind === 'mono').length, 5);
  assert.equal(new Set(ARENA_STARTER_DECKS.map((d) => d.name)).size, 15);
  for (const deck of ARENA_STARTER_DECKS) {
    assert.equal(deck.main.reduce((total, e) => total + e.quantity, 0), 60, deck.name);
    assert.equal(new Set(deck.main.map((e) => e.name)).size, deck.main.length, deck.name);
    assert.ok(deck.main.every((e) => e.quantity >= 1 && e.name.trim() === e.name), deck.name);
  }
});
