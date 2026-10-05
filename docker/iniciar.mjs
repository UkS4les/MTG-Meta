/**
 * Ponto de entrada do contêiner: prepara os dados e sobe o site.
 *
 * 1. Baixa o banco de cartas do Scryfall se não existir ou tiver mais de 24 h.
 * 2. Busca os torneios novos do MTGO (na primeira vez, os últimos 30 dias).
 * 3. Sobe o site e mantém os dois atualizados: torneios a cada 8 h, cartas uma vez por dia.
 *
 * Sem internet o site sobe do mesmo jeito com o que já estiver guardado.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const HOUR = 3_600_000;
const dataDir = resolve(process.env.MTG_DATA_DIR ?? 'data');
const port = process.env.PORT ?? '3000';
const cardsFile = join(dataDir, 'cards.json');
const log = (message) => console.log(`[iniciar] ${message}`);

function run(command, args, env = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('error', () => resolveRun(false));
    child.on('exit', (code) => resolveRun(code === 0));
  });
}

mkdirSync(dataDir, { recursive: true });
// A trava guarda o número do processo que abriu o banco. Num contêiner novo esse número pode
// coincidir com outro processo, e só este contêiner usa a pasta: uma trava que sobrou é sempre velha.
rmSync(join(dataDir, 'pglite.lock'), { force: true });

// Segredo que autoriza a ingestão pelo site. Gerado uma vez e guardado junto dos dados.
const secretFile = join(dataDir, '.cron-secret');
const secret = process.env.CRON_SECRET || (existsSync(secretFile) ? readFileSync(secretFile, 'utf8').trim() : '') || randomBytes(32).toString('hex');
if (!process.env.CRON_SECRET) writeFileSync(secretFile, secret, { mode: 0o600 });

const cardsAgeHours = () => (existsSync(cardsFile) ? (Date.now() - statSync(cardsFile).mtimeMs) / HOUR : Infinity);

async function refreshCards() {
  if (cardsAgeHours() < 24) return;
  log(existsSync(cardsFile) ? 'Atualizando o banco de cartas (Scryfall)...' : 'Baixando o banco de cartas (Scryfall, ~80 MB). Só na primeira vez demora.');
  // Grava em um arquivo ao lado e troca no fim: o site nunca lê um download pela metade.
  const next = `${cardsFile}.novo`;
  const ok = await run('npm', ['run', '--silent', 'cartas:baixar', '--', '--saida', next]);
  if (ok && existsSync(next)) {
    renameSync(next, cardsFile);
  } else {
    rmSync(next, { force: true });
    log(existsSync(cardsFile) ? 'Não consegui atualizar as cartas; sigo com as que já tenho.' : 'Não consegui baixar as cartas. Sem elas o site usa dados de exemplo; confira a internet e reinicie.');
  }
}

await refreshCards();
if (existsSync(cardsFile)) {
  log('Buscando torneios do MTGO...');
  const ok = await run('npm', ['run', '--silent', 'meta:ingerir', '--', '--dias', process.env.INGEST_DAYS ?? '30']);
  if (!ok) log('Não consegui buscar torneios agora; o site sobe com o que já está guardado.');
}

log(`Subindo o site na porta ${port}...`);
const site = spawn('npm', ['run', '--silent', 'start'], { stdio: 'inherit', env: { ...process.env, PORT: port, CRON_SECRET: secret } });
site.on('exit', (code) => process.exit(code ?? 1));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => site.kill(signal));

// Com o site no ar o banco é dele; a ingestão passa a ser pedida a ele.
setInterval(async () => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/jobs/ingerir`, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(10 * 60_000) });
    log(response.ok ? 'Torneios atualizados.' : `A atualização de torneios falhou (erro ${response.status}).`);
  } catch (error) {
    log(`A atualização de torneios falhou: ${error instanceof Error ? error.message : error}`);
  }
}, 8 * HOUR);
setInterval(refreshCards, HOUR);
