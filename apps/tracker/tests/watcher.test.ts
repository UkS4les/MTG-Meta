import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { ArenaMatch } from '@mtg-meta/core';
import { configDir, findLogDir, logDirCandidates } from '../src/paths.ts';
import { LogWatcher } from '../src/watcher.ts';

const players = [{ userId: 'eu', systemSeatId: 1, teamId: 1 }, { userId: 'outro', systemSeatId: 2, teamId: 2 }];
const login = `${JSON.stringify({ authenticateResponse: { clientId: 'eu' } })}\n`;
const room = (matchId: string, final?: number) =>
  `[UnityCrossThreadLogger]matchGameRoomStateChangedEvent\n${JSON.stringify({
    matchGameRoomStateChangedEvent: {
      gameRoomInfo: {
        stateType: final ? 'MatchGameRoomStateType_MatchCompleted' : 'MatchGameRoomStateType_Playing',
        gameRoomConfig: { matchId, eventId: 'Ladder', reservedPlayers: players },
        ...(final && { finalMatchResult: { matchId, resultList: [{ scope: 'MatchScope_Match', result: 'ResultType_WinLoss', winningTeamId: final }] } }),
      },
    },
  })}\n`;
const played = (matchId: string, winner: number) => room(matchId) + room(matchId, winner);

describe('LogWatcher', () => {
  let dir: string;
  let sentBatches: string[][];
  let failures: number;
  let messages: string[];
  const log = () => join(dir, 'Player.log');
  const watcher = (statePath?: string) =>
    new LogWatcher({
      logDir: dir,
      statePath,
      log: (message) => messages.push(message),
      send: async (matches: ArenaMatch[]) => {
        if (failures > 0) {
          failures--;
          throw new Error('servidor fora do ar');
        }
        sentBatches.push(matches.map((m) => m.id));
      },
    });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tracker-'));
    sentBatches = [];
    failures = 0;
    messages = [];
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('espera o log existir e avisa uma vez só', async () => {
    const w = watcher();
    assert.equal(await w.tick(), 0);
    assert.equal(await w.tick(), 0);
    assert.equal(messages.filter((m) => m.includes('Ainda não existe')).length, 1);
  });

  it('sem Player.log, ainda envia a sessão anterior e depois acompanha o arquivo novo', async () => {
    writeFileSync(join(dir, 'Player-prev.log'), login + played('antiga', 1));
    const w = watcher();
    assert.equal(await w.tick(), 1);
    assert.equal(await w.tick(), 0);
    writeFileSync(log(), login + played('nova', 1));
    assert.equal(await w.tick(), 1);
    assert.deepEqual(sentBatches, [['antiga'], ['nova']]);
  });

  it('na primeira verificação envia o que já está nos dois arquivos', async () => {
    writeFileSync(join(dir, 'Player-prev.log'), login + played('antiga', 1));
    writeFileSync(log(), login + played('nova', 2) + room('em-andamento'));
    const w = watcher();
    assert.equal(await w.tick(), 2);
    assert.deepEqual(sentBatches, [['antiga', 'nova']]);
    assert.equal(await w.tick(), 0);
  });

  it('envia cada partida quando ela termina, sem reenviar as anteriores', async () => {
    writeFileSync(log(), login);
    const w = watcher();
    assert.equal(await w.tick(), 0);
    appendFileSync(log(), room('m1'));
    assert.equal(await w.tick(), 0);
    appendFileSync(log(), room('m1', 1));
    assert.equal(await w.tick(), 1);
    appendFileSync(log(), played('m2', 2));
    assert.equal(await w.tick(), 1);
    assert.deepEqual(sentBatches, [['m1'], ['m2']]);
    assert.ok(messages.some((m) => m.includes('vitória')) && messages.some((m) => m.includes('derrota')));
  });

  it('quando o Arena reabre e o log recomeça, pega a sessão anterior do Player-prev.log', async () => {
    writeFileSync(log(), login + room('m1') + 'x'.repeat(4000));
    const w = watcher();
    await w.tick();
    // O jogo fechou no meio de uma verificação: m1 terminou e o arquivo foi trocado antes de ser relido.
    writeFileSync(join(dir, 'Player-prev.log'), login + played('m1', 1));
    writeFileSync(log(), login);
    assert.equal(await w.tick(), 1);
    assert.deepEqual(sentBatches, [['m1']]);
  });

  it('se o envio falha, tenta de novo na verificação seguinte', async () => {
    writeFileSync(log(), login + played('m1', 1));
    failures = 2;
    const w = watcher();
    assert.equal(await w.tick(), 0);
    assert.equal(await w.tick(), 0);
    assert.equal(await w.tick(), 1);
    assert.deepEqual(sentBatches, [['m1']]);
    assert.equal(messages.filter((m) => m.includes('servidor fora do ar')).length, 2);
  });

  it('lembra o que já enviou entre uma execução e outra', async () => {
    const statePath = join(dir, 'estado', 'enviadas.json');
    writeFileSync(log(), login + played('m1', 1));
    assert.equal(await watcher(statePath).tick(), 1);
    assert.deepEqual(JSON.parse(readFileSync(statePath, 'utf8')), { sent: ['m1'] });

    appendFileSync(log(), played('m2', 1));
    assert.equal(await watcher(statePath).tick(), 1);
    assert.deepEqual(sentBatches, [['m1'], ['m2']]);

    writeFileSync(statePath, 'arquivo estragado');
    assert.equal(await watcher(statePath).tick(), 2);
  });

  it('avisa quando Detailed Logs está desligado', async () => {
    writeFileSync(log(), 'DETAILED LOGS: DISABLED\n');
    const w = watcher();
    await w.tick();
    assert.equal(messages.filter((m) => m.includes('Detailed Logs')).length, 1);
  });
});

describe('caminhos', () => {
  it('monta a pasta do log de cada sistema', () => {
    assert.deepEqual(logDirCandidates('win32', 'C:\\Users\\ana', { USERPROFILE: 'C:\\Users\\ana' }), [join('C:\\Users\\ana', 'AppData', 'LocalLow', 'Wizards Of The Coast', 'MTGA')]);
    assert.deepEqual(logDirCandidates('darwin', '/Users/ana', {}), ['/Users/ana/Library/Logs/Wizards Of The Coast/MTGA']);
    const linux = logDirCandidates('linux', '/home/ana', {});
    assert.equal(linux.length, 3);
    assert.ok(linux.every((p) => p.includes('compatdata/2141910') && p.endsWith('Wizards Of The Coast/MTGA')));
  });

  it('acha a primeira pasta que existe e escolhe a pasta de configuração do sistema', () => {
    const real = mkdtempSync(join(tmpdir(), 'mtga-'));
    assert.equal(findLogDir(['/nao/existe', real]), real);
    assert.equal(findLogDir(['/nao/existe']), null);
    rmSync(real, { recursive: true });
    assert.equal(configDir('linux', '/home/ana', {}), '/home/ana/.config/mtg-meta-tracker');
    assert.equal(configDir('linux', '/home/ana', { XDG_CONFIG_HOME: '/cfg' }), '/cfg/mtg-meta-tracker');
    assert.equal(configDir('darwin', '/Users/ana', {}), '/Users/ana/Library/Application Support/mtg-meta-tracker');
  });
});
