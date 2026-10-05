import { FORMAT_KEYS, parseMtgoTournament, type CardDatabase } from '@mtg-meta/core';
import { ingestedFiles, markIngested, refreshMetaSnapshots, storeTournament, type Db } from '@mtg-meta/db';
import { classifyFormat, type ClassifyResult } from './classify.ts';
import { fetchSourceFile, listSourceFiles, selectFiles, SOURCE_NAME, type Fetch } from './source.ts';

export interface IngestOptions {
  /** Quantos dias para trás buscar torneios. */
  days?: number;
  formats?: readonly string[];
  log?: (message: string) => void;
  fetch?: Fetch;
  /** Pausa entre downloads, em ms, para não sobrecarregar a fonte. */
  delayMs?: number;
}

export interface IngestSummary {
  filesFound: number;
  filesDownloaded: number;
  filesFailed: number;
  results: number;
  formats: Record<string, ClassifyResult>;
}

export const DEFAULT_INGEST_DAYS = 30;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Baixa os torneios novos ou alterados, classifica os decks e recalcula o meta.
 * Pode rodar quantas vezes quiser: arquivo que não mudou na fonte não é baixado de novo.
 */
export async function runIngest(db: Db, cards: CardDatabase, options: IngestOptions = {}): Promise<IngestSummary> {
  const { days = DEFAULT_INGEST_DAYS, formats = FORMAT_KEYS, log = () => {}, fetch: fetchFn = fetch, delayMs = 100 } = options;

  const candidates = selectFiles(await listSourceFiles(fetchFn), formats, daysAgo(days));
  const known = await ingestedFiles(db);
  const pending = candidates.filter((file) => known.get(file.path) !== file.sha);
  log(`${candidates.length} torneio(s) nos últimos ${days} dias; ${pending.length} novo(s) ou alterado(s).`);

  const summary: IngestSummary = { filesFound: candidates.length, filesDownloaded: 0, filesFailed: 0, results: 0, formats: {} };
  for (const [index, file] of pending.entries()) {
    try {
      const tournament = parseMtgoTournament(await fetchSourceFile(file.path, fetchFn));
      // O nome do arquivo sugere o formato, mas quem manda é o que está dentro dele.
      if (formats.includes(tournament.format)) summary.results += await storeTournament(db, tournament, SOURCE_NAME);
      await markIngested(db, file.path, file.sha);
      summary.filesDownloaded++;
    } catch (error) {
      // Um arquivo ruim não derruba a ingestão; ele fica sem marca e entra de novo na próxima rodada.
      summary.filesFailed++;
      log(`Falha em ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if ((index + 1) % 50 === 0) log(`  ${index + 1}/${pending.length} baixados...`);
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  for (const format of formats) {
    const result = await classifyFormat(db, cards, format);
    await refreshMetaSnapshots(db, format);
    summary.formats[format] = result;
    log(
      `${format}: ${result.decks} deck(s) recentes, ${result.matched} encaixado(s) em arquétipos existentes, ` +
        `${result.newArchetypes} arquétipo(s) novo(s), ${result.unclassified} sem arquétipo.`,
    );
  }
  return summary;
}
