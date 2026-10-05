/**
 * Tracker do MTG Arena: fica rodando enquanto você joga e envia cada partida terminada para o site.
 *
 *   npm run tracker -- --servidor https://meu-site --chave mtgm_...   # primeira vez: guarda a configuração
 *   npm run tracker                                                   # depois disso
 *   npm run tracker -- --uma-vez                                      # envia o que há nos logs e sai
 *   npm run tracker -- --log "C:\pasta\do\MTGA"                       # pasta do log fora do lugar padrão
 *
 * A chave é gerada na página Conta do site. Ela só serve para enviar partidas.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { ArenaMatch } from '@mtg-meta/core';
import { configDir, findLogDir, logDirCandidates } from './paths.ts';
import { LogWatcher } from './watcher.ts';

interface Config {
  servidor?: string;
  chave?: string;
}

const CONFIG_FILE = join(configDir(), 'config.json');
const INTERVAL_MS = 3000;

function readConfig(): Config {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) as Config;
  } catch {
    return {};
  }
}

function writeConfig(config: Config): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  // A chave dá acesso de escrita ao histórico: só o dono do computador deve conseguir ler o arquivo.
  if (process.platform !== 'win32') chmodSync(CONFIG_FILE, 0o600);
}

function sender(server: string, key: string): (matches: ArenaMatch[]) => Promise<void> {
  const url = new URL('/api/partidas', server);
  return async (matches) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ partidas: matches }),
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 401) throw new Error('o site recusou a chave (gere outra na página Conta e rode de novo com --chave)');
    if (!response.ok) throw new Error(`o site respondeu com erro ${response.status}`);
    const body = (await response.json()) as { saved?: boolean };
    if (!body.saved) throw new Error('o site não gravou as partidas');
  };
}

const stamp = () => new Date().toLocaleTimeString('pt-BR');
const log = (message: string) => console.log(`[${stamp()}] ${message}`);

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      servidor: { type: 'string' },
      chave: { type: 'string' },
      log: { type: 'string' },
      'uma-vez': { type: 'boolean', default: false },
    },
  });

  const saved = readConfig();
  const server = values.servidor ?? process.env.MTG_META_SERVIDOR ?? saved.servidor;
  const key = values.chave ?? process.env.MTG_META_CHAVE ?? saved.chave;
  if (!server || !key) {
    throw new Error('Informe o endereço do site e a chave: npm run tracker -- --servidor https://... --chave mtgm_...\nA chave é gerada na página Conta do site.');
  }
  try {
    new URL(server);
  } catch {
    throw new Error(`"${server}" não é um endereço válido. Exemplo: http://localhost:3000`);
  }
  // Um envio vazio confere o endereço e a chave antes de guardar a configuração ou esperar uma partida.
  const send = sender(server, key);
  try {
    await send([]);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(reason.startsWith('o site') ? `Não deu para começar: ${reason}.` : `Não consegui falar com ${server}. O site está no ar?`);
  }
  if (values.servidor || values.chave) {
    writeConfig({ servidor: server, chave: key });
    log(`Configuração guardada em ${CONFIG_FILE}.`);
  }

  const logDir = values.log ?? findLogDir();
  if (!logDir) {
    throw new Error(`Não encontrei a pasta do log do Arena. Procurei em:\n  ${logDirCandidates().join('\n  ')}\nInforme a pasta com --log.`);
  }
  if (!existsSync(logDir)) throw new Error(`A pasta ${logDir} não existe.`);

  const watcher = new LogWatcher({ logDir, send, log, statePath: join(configDir(), 'enviadas.json') });
  log(`Acompanhando ${join(logDir, 'Player.log')} e enviando para ${server}.`);

  if (values['uma-vez']) {
    const sent = await watcher.tick();
    log(sent === 0 ? 'Nenhuma partida nova nos logs.' : `${sent} partida(s) enviada(s).`);
    return;
  }

  log('Deixe esta janela aberta enquanto joga. Ctrl+C para parar.');
  let running = false;
  const timer = setInterval(() => {
    // Uma verificação lenta (log grande, rede ruim) não pode se sobrepor à seguinte.
    if (running) return;
    running = true;
    watcher
      .tick()
      .catch((error: unknown) => log(`Erro ao ler o log: ${error instanceof Error ? error.message : String(error)}`))
      .finally(() => {
        running = false;
      });
  }, INTERVAL_MS);
  process.on('SIGINT', () => {
    clearInterval(timer);
    log('Tracker parado.');
    process.exit(0);
  });
  await watcher.tick();
}

main().catch((error: unknown) => {
  console.error(`Erro: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
