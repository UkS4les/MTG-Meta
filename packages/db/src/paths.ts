import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Sobe a partir da pasta atual até achar o package.json que declara os workspaces. */
export function repoRoot(start = process.cwd()): string {
  let dir = resolve(start);
  for (;;) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      try {
        if ((JSON.parse(readFileSync(manifest, 'utf8')) as { workspaces?: unknown }).workspaces) return dir;
      } catch {
        // package.json ilegível: continua subindo.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

/** Pasta dos dados locais (banco e cartas). Padrão: data/ na raiz do repositório. */
export function dataDir(): string {
  return process.env.MTG_DATA_DIR ? resolve(process.env.MTG_DATA_DIR) : join(repoRoot(), 'data');
}
