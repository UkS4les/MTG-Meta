import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { open, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArenaLog, type ArenaMatch } from '@mtg-meta/core';

/** O Arena escreve isto quando uma partida termina; é o sinal para reler o log. */
const MATCH_DONE = 'MatchGameRoomStateType_MatchCompleted';
/** Quantas partidas já enviadas o tracker lembra (bem mais do que cabe em dois arquivos de log). */
const MAX_REMEMBERED = 5000;

export interface WatcherOptions {
  /** Pasta com Player.log e Player-prev.log. */
  logDir: string;
  /** Envia as partidas; deve lançar erro se o servidor não aceitar, para o tracker tentar de novo. */
  send: (matches: ArenaMatch[]) => Promise<void>;
  log?: (message: string) => void;
  /** Arquivo onde fica a lista do que já foi enviado. Sem ele, a lista vale só enquanto o programa roda. */
  statePath?: string;
}

/**
 * Acompanha o Player.log: a cada verificação lê só o que foi acrescentado e, quando aparece o fim
 * de uma partida, relê o arquivo inteiro e envia as partidas que ainda não foram enviadas.
 * O Arena apaga o Player.log ao abrir (a sessão anterior vai para Player-prev.log), então na
 * primeira verificação e sempre que o arquivo encolhe os dois são lidos.
 */
export class LogWatcher {
  private offset = 0;
  private first = true;
  private pending = false;
  private missingNoted = false;
  private detailedNoted = false;
  private readonly sent: Set<string>;
  private readonly log: (message: string) => void;

  constructor(private readonly options: WatcherOptions) {
    this.log = options.log ?? (() => {});
    this.sent = new Set(this.loadState());
  }

  private loadState(): string[] {
    const { statePath } = this.options;
    if (!statePath || !existsSync(statePath)) return [];
    try {
      const state = JSON.parse(readFileSync(statePath, 'utf8')) as { sent?: unknown };
      return Array.isArray(state.sent) ? state.sent.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      // Arquivo corrompido: recomeça. Reenviar é inofensivo, o servidor não duplica partidas.
      return [];
    }
  }

  private saveState(): void {
    const { statePath } = this.options;
    if (!statePath) return;
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify({ sent: [...this.sent].slice(-MAX_REMEMBERED) }));
  }

  private async readMatches(file: string): Promise<ArenaMatch[]> {
    let text: string;
    try {
      text = await readFile(join(this.options.logDir, file), 'utf8');
    } catch {
      return [];
    }
    const parsed = parseArenaLog(text);
    if (parsed.detailedLogs === false && !this.detailedNoted) {
      this.detailedNoted = true;
      this.log('O log diz que "Detailed Logs" está desligado. No Arena: Options → Account → Detailed Logs (Plugin Support), e reinicie o jogo.');
    }
    return parsed.matches;
  }

  /** O trecho acrescentado ao Player.log desde a última verificação traz o fim de alguma partida? */
  private async appendedHasMatchEnd(path: string, size: number): Promise<boolean> {
    const handle = await open(path, 'r');
    try {
      // Recuar o tamanho do marcador cobre o caso de ele ter sido gravado metade antes, metade depois.
      const start = Math.max(0, this.offset - MATCH_DONE.length);
      const buffer = Buffer.alloc(size - start);
      await handle.read(buffer, 0, buffer.length, start);
      return buffer.includes(MATCH_DONE);
    } finally {
      await handle.close();
    }
  }

  /** Uma verificação. Devolve quantas partidas foram enviadas nela. */
  async tick(): Promise<number> {
    const path = join(this.options.logDir, 'Player.log');
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      if (!this.missingNoted) this.log(`Ainda não existe Player.log em ${this.options.logDir}. Ele aparece quando o Arena abre.`);
      this.missingNoted = true;
      // Sem Player.log ainda dá para enviar a sessão anterior, uma vez.
      if (!this.first) return 0;
      size = 0;
    }
    if (size > 0) this.missingNoted = false;

    const restarted = size < this.offset;
    if (restarted) this.log('O Arena foi reaberto: começou um log novo.');
    const includePrevious = this.first || restarted;
    let check = includePrevious || this.pending;
    if (!check && size > this.offset) check = await this.appendedHasMatchEnd(path, size);
    this.first = false;
    this.offset = size;
    if (!check) return 0;

    const matches = [...(includePrevious ? await this.readMatches('Player-prev.log') : []), ...(await this.readMatches('Player.log'))];
    const fresh = [...new Map(matches.filter((m) => !this.sent.has(m.id)).map((m) => [m.id, m])).values()];
    if (fresh.length === 0) {
      this.pending = false;
      return 0;
    }
    try {
      await this.options.send(fresh);
    } catch (error) {
      // Fica pendente: a próxima verificação tenta de novo mesmo sem nada novo no log.
      this.pending = true;
      this.log(`Não consegui enviar ${fresh.length} partida(s): ${error instanceof Error ? error.message : String(error)}. Vou tentar de novo.`);
      return 0;
    }
    this.pending = false;
    for (const match of fresh) this.sent.add(match.id);
    this.saveState();
    for (const match of fresh) {
      const result = match.result === 'win' ? 'vitória' : match.result === 'loss' ? 'derrota' : 'empate';
      this.log(`Partida enviada: ${result} ${match.gamesWon}–${match.gamesLost}${match.deck?.name ? ` com ${match.deck.name}` : ''} (${match.eventId}).`);
    }
    return fresh.length;
  }
}
