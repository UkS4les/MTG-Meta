import type { MtgoTournamentFile } from '@mtg-meta/core';

/**
 * Fonte: github.com/modometa/modometa-mtgo-data (licença MIT), que raspa o mtgo.com a cada ~8 h
 * e publica um JSON por torneio em Tournaments/MTGO/AAAA/MM/DD/<evento>.json.
 */
export const SOURCE_NAME = 'modometa-mtgo-data';
const REPO = 'modometa/modometa-mtgo-data';
const BRANCH = 'main';
const USER_AGENT = 'mtg-meta/0.2 (ingestão de torneios)';
const PATH_RE = /^Tournaments\/MTGO\/(\d{4})\/(\d{2})\/(\d{2})\/([a-z0-9-]+)\.json$/;

export interface SourceFile {
  path: string;
  /** Hash do conteúdo no git: muda quando o arquivo é atualizado. */
  sha: string;
  /** AAAA-MM-DD. */
  date: string;
  slug: string;
}

export type Fetch = typeof fetch;

/** Lista todos os arquivos de torneio do repositório em uma única chamada à API do GitHub. */
export async function listSourceFiles(fetchFn: Fetch = fetch): Promise<SourceFile[]> {
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' };
  // Sem token o GitHub permite 60 chamadas por hora por IP, o que sobra para uma chamada por execução.
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetchFn(`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`, { headers });
  if (!response.ok) throw new Error(`GitHub respondeu ${response.status} ao listar os torneios de ${REPO}.`);
  const body = (await response.json()) as { truncated?: boolean; tree: { path: string; sha: string; type: string }[] };
  if (body.truncated) {
    throw new Error(`A lista de arquivos de ${REPO} veio cortada pelo GitHub; a ingestão precisa passar a listar por pasta.`);
  }
  const files: SourceFile[] = [];
  for (const item of body.tree) {
    const match = item.type === 'blob' ? item.path.match(PATH_RE) : null;
    if (match) files.push({ path: item.path, sha: item.sha, date: `${match[1]}-${match[2]}-${match[3]}`, slug: match[4]! });
  }
  return files;
}

export async function fetchSourceFile(path: string, fetchFn: Fetch = fetch): Promise<MtgoTournamentFile> {
  const response = await fetchFn(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/${path}`, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`Falha ao baixar ${path}: HTTP ${response.status}`);
  return (await response.json()) as MtgoTournamentFile;
}

/** Arquivos dos formatos pedidos a partir de uma data (inclusive). */
export function selectFiles(files: readonly SourceFile[], formats: readonly string[], since: string): SourceFile[] {
  return files
    .filter((file) => file.date >= since && formats.some((format) => file.slug.startsWith(`${format}-`)))
    .sort((a, b) => a.path.localeCompare(b.path));
}
