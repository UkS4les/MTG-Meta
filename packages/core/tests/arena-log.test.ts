import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyPartial, type Features } from '../src/archetypes.ts';
import { describeQueue, parseArenaLog, winRate, winRateBy } from '../src/arena-log.ts';

// Monta um log com a mesma forma do Player.log: cabeçalho de texto e, na linha seguinte ou na mesma, o JSON.
const HEADER = '[UnityCrossThreadLogger]5/13/2026 10:00:00 PM';
const line = (payload: unknown, prefix = '') => `${prefix}${JSON.stringify(payload)}`;

const login = (clientId: string) => line({ authenticateResponse: { clientId, sessionId: 's', screenName: 'Eu#12345' } }, `${HEADER} `);

function setDeck(eventName: string, name: string, main: [number, number][], side: [number, number][] = []) {
  const cards = (list: [number, number][]) => list.map(([cardId, quantity]) => ({ cardId, quantity }));
  const request = { EventName: eventName, Summary: { DeckId: 'd1', Name: name }, Deck: { MainDeck: cards(main), Sideboard: cards(side), CommandZone: [], Companions: [] } };
  return line({ id: 'r1', request: JSON.stringify(request) }, '[UnityCrossThreadLogger]==> EventSetDeckV2 ');
}

function room(matchId: string, eventId: string, players: { userId: string; seat: number }[], final?: { scope: string; winner?: number; result?: string }[], timestamp = '1790000000000') {
  return [
    `${HEADER} matchGameRoomStateChangedEvent`,
    line({
      timestamp,
      matchGameRoomStateChangedEvent: {
        gameRoomInfo: {
          stateType: final ? 'MatchGameRoomStateType_MatchCompleted' : 'MatchGameRoomStateType_Playing',
          gameRoomConfig: { matchId, eventId, reservedPlayers: players.map((p) => ({ userId: p.userId, playerName: 'Fulano#99999', systemSeatId: p.seat, teamId: p.seat, eventId })) },
          ...(final && { finalMatchResult: { matchId, resultList: final.map((f) => ({ scope: f.scope, result: f.result ?? 'ResultType_WinLoss', winningTeamId: f.winner })) } }),
        },
      },
    }),
  ].join('\n');
}

function gre(localSeat: number, state: Record<string, unknown>) {
  return [
    `${HEADER} greToClientEvent`,
    line({ greToClientEvent: { greToClientMessages: [{ type: 'GREMessageType_GameStateMessage', systemSeatIds: [localSeat], gameStateMessage: state }] } }),
  ].join('\n');
}

const card = (grpId: number, ownerSeatId: number, type = 'GameObjectType_Card') => ({ instanceId: grpId * 10 + ownerSeatId, grpId, type, ownerSeatId, controllerSeatId: ownerSeatId });
const ME = { userId: 'eu', seat: 2 };
const THEM = { userId: 'outro', seat: 1 };
const game = (winner: number) => ({ scope: 'MatchScope_Game', winner });
const match = (winner: number) => ({ scope: 'MatchScope_Match', winner });

describe('parseArenaLog', () => {
  it('lê uma partida completa: deck, resultado, quem começou e cartas do oponente', () => {
    const log = [
      'DETAILED LOGS: ENABLED',
      login('eu'),
      setDeck('Ladder', 'Mono Red', [[100, 4], [101, 20], [100, 1]], [[102, 2]]),
      room('m1', 'Ladder', [THEM, ME]),
      gre(2, { gameInfo: { matchID: 'm1', gameNumber: 1 }, turnInfo: { turnNumber: 1, activePlayer: 2 }, gameObjects: [card(100, 2), card(500, 1)] }),
      gre(2, { turnInfo: { turnNumber: 2, activePlayer: 1 }, gameObjects: [card(501, 1), card(500, 1), card(900, 1, 'GameObjectType_Token'), { grpId: 0, type: 'GameObjectType_Card', ownerSeatId: 1 }] }),
      room('m1', 'Ladder', [THEM, ME], [game(2), match(2)]),
    ].join('\n');
    const parsed = parseArenaLog(log);
    assert.equal(parsed.detailedLogs, true);
    assert.deepEqual([parsed.unfinished, parsed.unresolved], [0, 0]);
    assert.deepEqual(parsed.matches, [
      {
        id: 'm1',
        eventId: 'Ladder',
        startedAt: '2026-09-21T14:13:20.000Z',
        result: 'win',
        gamesWon: 1,
        gamesLost: 0,
        onPlay: true,
        deck: { name: 'Mono Red', main: [{ arenaId: 100, quantity: 5 }, { arenaId: 101, quantity: 20 }], sideboard: [{ arenaId: 102, quantity: 2 }], commander: [] },
        opponentCards: [500, 501],
      },
    ]);
  });

  it('melhor de três: conta os jogos e usa quem começou o primeiro', () => {
    const log = [
      login('eu'),
      room('m2', 'Traditional_Ladder', [ME, THEM].map((p, i) => ({ ...p, seat: i + 1 }))),
      gre(1, { gameInfo: { gameNumber: 1 }, turnInfo: { turnNumber: 1, activePlayer: 2 } }),
      gre(1, { gameInfo: { gameNumber: 2 }, turnInfo: { turnNumber: 1, activePlayer: 1 } }),
      room('m2', 'Traditional_Ladder', [{ userId: 'eu', seat: 1 }, { userId: 'outro', seat: 2 }], [game(2), game(1), game(2), match(2)]),
    ].join('\n');
    const [m] = parseArenaLog(log).matches;
    assert.deepEqual([m!.result, m!.gamesWon, m!.gamesLost, m!.onPlay, m!.deck], ['loss', 1, 2, false, null]);
  });

  it('sem login no log, descobre o lugar da pessoa pelas mensagens do jogo', () => {
    const log = [room('m3', 'Play', [THEM, ME]), gre(2, { turnInfo: { turnNumber: 1, activePlayer: 1 } }), room('m3', 'Play', [THEM, ME], [game(1), match(1)])].join('\n');
    const parsed = parseArenaLog(log);
    assert.deepEqual([parsed.matches[0]!.result, parsed.matches[0]!.onPlay], ['loss', false]);
  });

  it('não inventa resultado quando não sabe quem é a pessoa, nem conta partida sem fim', () => {
    const log = [
      room('semlado', 'Play', [THEM, ME], [game(1), match(1)]),
      login('eu'),
      room('cortada', 'Play', [THEM, ME]),
      room('m4', 'Play', [THEM, ME]),
      room('m4', 'Play', [THEM, ME], [{ scope: 'MatchScope_Game', result: 'ResultType_Draw' }, { scope: 'MatchScope_Match', result: 'ResultType_Draw' }]),
      room('aberta', 'Play', [THEM, ME]),
    ].join('\n');
    const parsed = parseArenaLog(log);
    assert.deepEqual(parsed.matches.map((m) => [m.id, m.result]), [['m4', 'draw']]);
    assert.deepEqual([parsed.unresolved, parsed.unfinished], [1, 2]);
  });

  it('a mesma partida repetida no log entra uma vez só', () => {
    const one = [login('eu'), room('m5', 'Play', [THEM, ME]), room('m5', 'Play', [THEM, ME], [game(2), match(2)])].join('\n');
    assert.equal(parseArenaLog(`${one}\n${one}`).matches.length, 1);
  });

  it('usa o deck da fila certa, aceita JSON em várias linhas, horário em ticks e final de linha do Windows', () => {
    const pretty = JSON.stringify(JSON.parse(room('m6', 'Explorer_Ladder', [THEM, ME], [game(2), match(2)], '638900000000000000').split('\n')[1]!), null, 2);
    const log = [
      login('eu'),
      setDeck('Explorer_Ladder', 'Pioneer', [[7, 4]]),
      setDeck('Ladder', 'Standard', [[8, 4]]),
      room('m6', 'Explorer_Ladder', [THEM, ME]),
      'texto solto { que não é JSON',
      `${HEADER} matchGameRoomStateChangedEvent`,
      pretty,
    ].join('\r\n');
    const [m] = parseArenaLog(log).matches;
    assert.equal(m!.deck?.name, 'Pioneer');
    assert.equal(m!.result, 'win');
    assert.match(m!.startedAt!, /^20\d\d-/);
  });

  it('log vazio ou sem partidas não dá erro', () => {
    assert.deepEqual(parseArenaLog(''), { matches: [], detailedLogs: null, unfinished: 0, unresolved: 0 });
    assert.equal(parseArenaLog('DETAILED LOGS: DISABLED\n[UnityCrossThreadLogger]nada').detailedLogs, false);
  });
});

describe('describeQueue', () => {
  it('traduz as filas conhecidas e mantém as desconhecidas legíveis', () => {
    assert.deepEqual(describeQueue('Ladder'), { label: 'Standard ranqueado', metaFormat: 'standard' });
    assert.deepEqual(describeQueue('Traditional_Ladder'), { label: 'Standard ranqueado (MD3)', metaFormat: 'standard' });
    assert.deepEqual(describeQueue('Play'), { label: 'Standard', metaFormat: 'standard' });
    assert.deepEqual(describeQueue('Traditional_Explorer_Ladder'), { label: 'Pioneer ranqueado (MD3)', metaFormat: 'pioneer' });
    assert.deepEqual(describeQueue('Historic_Ladder'), { label: 'Historic ranqueado', metaFormat: null });
    assert.deepEqual(describeQueue('PremierDraft_FDN_20261001'), { label: 'Draft', metaFormat: null });
    assert.deepEqual(describeQueue('Brawl_Ladder'), { label: 'Brawl ranqueado', metaFormat: null });
    assert.deepEqual(describeQueue('Evento_Novo_2027'), { label: 'Evento Novo 2027', metaFormat: null });
  });
});

describe('winRate', () => {
  it('ignora empates na taxa e dá intervalo largo com poucas partidas', () => {
    const few = winRate(['win', 'win', 'win', 'win', 'win', 'loss', 'draw']);
    assert.deepEqual([few.matches, few.wins, few.losses, few.draws], [7, 5, 1, 1]);
    assert.equal(few.rate, 5 / 6);
    assert.ok(few.low! < 0.45 && few.high! > 0.95);
    const many = winRate([...Array<'win'>(500).fill('win'), ...Array<'loss'>(500).fill('loss')]);
    assert.ok(many.high! - many.low! < 0.07);
    assert.deepEqual(winRate(['draw']).rate, null);
  });

  it('winRateBy agrupa, pula chave nula e ordena por volume', () => {
    const groups = winRateBy(
      [{ result: 'win' as const, deck: 'A' }, { result: 'loss' as const, deck: 'B' }, { result: 'win' as const, deck: 'B' }, { result: 'win' as const, deck: null }],
      (m) => m.deck,
    );
    assert.deepEqual(groups.map((g) => [g.key, g.matches, g.wins]), [['B', 2, 1], ['A', 1, 1]]);
  });
});

describe('classifyPartial', () => {
  const f = (cards: Record<string, number>): Features => new Map(Object.entries(cards));
  const archetypes = [
    { id: 'burn', features: f({ Bolt: 4, Guide: 4, Spike: 3.6, Eidolon: 0.4 }) },
    { id: 'control', features: f({ Counterspell: 4, Verdict: 3, Bolt: 0.5 }) },
  ];

  it('reconhece pelo que foi visto e dá a confiança', () => {
    assert.deepEqual(classifyPartial(['Bolt', 'Guide', 'Spike'], archetypes), { id: 'burn', score: 1 });
    const mixed = classifyPartial(['Bolt', 'Guide', 'Spike', 'Carta de Fora'], archetypes);
    assert.deepEqual([mixed?.id, mixed?.score], ['burn', 0.75]);
  });

  it('não arrisca com poucas cartas nem quando nada combina', () => {
    assert.equal(classifyPartial(['Bolt', 'Guide'], archetypes), null);
    assert.equal(classifyPartial(['Bolt', 'Bolt', 'Guide', 'Guide'], archetypes), null);
    assert.equal(classifyPartial(['X', 'Y', 'Bolt'], archetypes), null);
  });
});
