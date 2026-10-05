import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDecklist, parseMtgoTournament, parseResult } from '../src/mtgo.ts';

test('parseResult lê colocação e campanha', () => {
  assert.deepEqual(parseResult('1st Place'), { placement: 1, wins: null, losses: null });
  assert.deepEqual(parseResult('22nd Place'), { placement: 22, wins: null, losses: null });
  assert.deepEqual(parseResult('5-0'), { placement: null, wins: 5, losses: 0 });
  assert.deepEqual(parseResult(''), { placement: null, wins: null, losses: null });
});

test('parseMtgoTournament converte torneio com standings', () => {
  const tournament = parseMtgoTournament({
    Tournament: {
      Date: '2026-09-10',
      Name: 'Modern Challenge 64',
      Uri: 'https://www.mtgo.com/decklist/modern-challenge-64-2026-09-1012854060',
      Formats: 'Modern',
      PlayerCount: 93,
    },
    Decks: [
      {
        Player: 'Alice',
        Result: '1st Place',
        AnchorUri: 'https://www.mtgo.com/decklist/x#deck_Alice',
        Mainboard: [
          { Count: 4, CardName: 'Lightning Bolt' },
          { Count: 1, CardName: 'Lightning Bolt' },
        ],
        Sideboard: [{ Count: 2, CardName: 'Pyroblast' }],
      },
      { Player: 'Vazio', Result: '2nd Place', Mainboard: [], Sideboard: [] },
    ],
    Standings: [{ Rank: 1, Player: 'Alice', Wins: 6, Losses: 0 }],
  });
  assert.equal(tournament.id, 'modern-challenge-64-2026-09-1012854060');
  assert.equal(tournament.format, 'modern');
  assert.equal(tournament.players, 93);
  assert.equal(tournament.results.length, 1);
  const [alice] = tournament.results;
  assert.deepEqual(alice!.deck.main, [{ name: 'Lightning Bolt', quantity: 5 }]);
  assert.deepEqual([alice!.placement, alice!.wins, alice!.losses], [1, 6, 0]);
});

test('ligas trazem só a campanha 5-0', () => {
  const league = parseMtgoTournament({
    Tournament: { Date: '2026-10-03', Name: 'Standard League', Uri: 'https://www.mtgo.com/decklist/standard-league-2026-10-0311129', Formats: 'Standard' },
    Decks: [{ Player: 'Bob', Result: '5-0', Mainboard: [{ Count: 4, CardName: 'Opt' }], Sideboard: [] }],
  });
  assert.equal(league.players, null);
  assert.deepEqual([league.results[0]!.placement, league.results[0]!.wins, league.results[0]!.losses], [null, 5, 0]);
});

test('formatDecklist gera texto importável', () => {
  const text = formatDecklist({ name: 'x', main: [{ name: 'Opt', quantity: 4 }], sideboard: [{ name: 'Negate', quantity: 2 }], commander: [], warnings: [] });
  assert.equal(text, 'Deck\n4 Opt\n\nSideboard\n2 Negate');
});
