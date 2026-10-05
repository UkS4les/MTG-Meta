/**
 * Confere o leitor do Player.log contra logs reais do Arena.
 *
 *   npm run logs:conferir
 *
 * Baixa alguns logs do acervo público manasight/manasight-corpus (licenças MIT e Apache-2.0;
 * nomes e identificadores de jogadores já vêm apagados) para data/logs-reais/ e verifica que:
 *   1. toda partida que o log registra como terminada, com pelo menos um jogo, foi lida;
 *   2. o lado da pessoa foi identificado: as cartas atribuídas ao oponente não podem ser, quase
 *      todas, cartas do deck da própria pessoa (é o que acontece quando os lados são trocados).
 *
 * O formato do log muda sem aviso; este é o teste que avisa quando isso acontecer.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseArenaLog } from '@mtg-meta/core';
import { dataDir } from '@mtg-meta/db';

const SOURCE = 'https://raw.githubusercontent.com/manasight/manasight-corpus/main/corpus';
/** Um de cada tipo de fila, para cobrir melhor de um, melhor de três, draft, selado e Pioneer. */
const SAMPLES = [
  'session_2026-02-23_0000_standard-bo1',
  'session_2026-03-11_2124_trad-standard-bo3',
  'session_2026-03-11_1847_quick-draft-selesnya',
  'session_2026-05-01_1751_sealed-matches',
  'session_2026-06-17_2005_pioneer-play-bo3',
];

async function load(name: string, dir: string): Promise<string> {
  const file = join(dir, `${name}.log`);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const response = await fetch(`${SOURCE}/${name}.log.gz`, { headers: { 'User-Agent': 'mtg-meta/0.3 (conferência do leitor de log)' } });
  if (!response.ok) throw new Error(`Não consegui baixar ${name}: HTTP ${response.status}`);
  const text = gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8');
  writeFileSync(file, text);
  return text;
}

/** Partidas terminadas com pelo menos um jogo, contadas direto no texto, sem passar pelo leitor. */
function finishedInLog(text: string): number {
  const ids = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes('finalMatchResult') || !line.includes('MatchScope_Game')) continue;
    const id = line.match(/"matchId"\s*:\s*"([^"]+)"/)?.[1];
    if (id) ids.add(id);
  }
  return ids.size;
}

async function main(): Promise<void> {
  const dir = join(dataDir(), 'logs-reais');
  mkdirSync(dir, { recursive: true });
  const problems: string[] = [];
  let total = 0;

  for (const name of SAMPLES) {
    const text = await load(name, dir);
    const parsed = parseArenaLog(text);
    const expected = finishedInLog(text);
    total += parsed.matches.length;
    console.log(`${name}: ${parsed.matches.length} de ${expected} partida(s) lida(s)`);
    if (parsed.matches.length !== expected) problems.push(`${name}: o log tem ${expected} partida(s) terminada(s), o leitor achou ${parsed.matches.length}`);

    for (const match of parsed.matches) {
      if (!match.deck) problems.push(`${name}: partida ${match.id.slice(0, 8)} sem deck`);
      if (!match.startedAt) problems.push(`${name}: partida ${match.id.slice(0, 8)} sem horário`);
      // Em draft e selado os dois lados usam as mesmas cartas da coleção; lá a comparação não diz nada.
      const constructed = (match.deck?.main.reduce((sum, card) => sum + card.quantity, 0) ?? 0) >= 60;
      if (!match.deck || !constructed || match.opponentCards.length < 5) continue;
      const mine = new Set(match.deck.main.map((card) => card.arenaId));
      const shared = match.opponentCards.filter((id) => mine.has(id)).length;
      if (shared / match.opponentCards.length > 0.5) {
        problems.push(`${name}: partida ${match.id.slice(0, 8)} com os lados provavelmente trocados (${shared} de ${match.opponentCards.length} cartas "do oponente" são do deck da pessoa)`);
      }
    }
  }

  if (problems.length > 0) {
    console.error(`\n${problems.length} problema(s):\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`\nTudo certo: ${total} partidas reais lidas em ${SAMPLES.length} logs.`);
}

main().catch((error: unknown) => {
  console.error(`Erro: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
