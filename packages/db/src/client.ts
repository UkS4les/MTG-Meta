import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { dataDir } from './paths.ts';
import { MIGRATIONS } from './schema.ts';

type Row = Record<string, unknown>;

export interface Queryable {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

/**
 * O que o resto do sistema enxerga do banco. Hoje a implementação é o PGlite (Postgres embutido,
 * em arquivo local); trocar por um Postgres hospedado é escrever outra implementação desta interface.
 */
export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

async function migrate(pg: PGlite): Promise<void> {
  await pg.exec('create table if not exists schema_migrations (version integer primary key, applied_at timestamptz not null default now())');
  const applied = await pg.query<{ version: number }>('select version from schema_migrations');
  const done = new Set(applied.rows.map((r) => r.version));
  for (const [index, sql] of MIGRATIONS.entries()) {
    if (done.has(index + 1)) continue;
    await pg.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('insert into schema_migrations (version) values ($1)', [index + 1]);
    });
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * O PGlite só aceita um processo por vez na mesma pasta; dois ao mesmo tempo corrompem os dados.
 * O arquivo de trava guarda o PID de quem abriu.
 */
function acquireLock(lockFile: string): () => void {
  if (existsSync(lockFile)) {
    const pid = Number.parseInt(readFileSync(lockFile, 'utf8'), 10);
    if (Number.isFinite(pid) && pid !== process.pid && isAlive(pid)) {
      throw new Error(
        `O banco local já está aberto por outro processo (PID ${pid}), provavelmente o servidor do site. ` +
          'Pare esse processo antes. Só a ingestão roda com o site no ar: "npm run meta:ingerir -- --servidor http://localhost:3000".',
      );
    }
  }
  writeFileSync(lockFile, String(process.pid));
  const release = () => {
    try {
      if (readFileSync(lockFile, 'utf8') === String(process.pid)) rmSync(lockFile);
    } catch {
      // Já removido.
    }
  };
  process.once('exit', release);
  return release;
}

export interface OpenOptions {
  /** Pasta do banco. Padrão: <dados>/pglite. Use "memory://" em testes. */
  location?: string;
}

export async function openDb(options: OpenOptions = {}): Promise<Db> {
  const location = options.location ?? join(dataDir(), 'pglite');
  let release = () => {};
  if (!location.startsWith('memory://')) {
    mkdirSync(location, { recursive: true });
    release = acquireLock(`${location}.lock`);
  }

  let pg: PGlite;
  try {
    pg = await PGlite.create(location);
    await migrate(pg);
  } catch (error) {
    release();
    throw error;
  }

  return {
    async query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
      return (await pg.query<T>(sql, params)).rows;
    },
    transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      return pg.transaction((tx) =>
        fn({
          async query<R = Row>(sql: string, params: unknown[] = []): Promise<R[]> {
            return (await tx.query<R>(sql, params)).rows;
          },
        }),
      ) as Promise<T>;
    },
    async close(): Promise<void> {
      await pg.close();
      release();
    },
  };
}

const globalDb = globalThis as typeof globalThis & { __mtgMetaDb?: Promise<Db> };

/** Uma conexão por processo (sobrevive ao recarregamento de módulos do servidor de desenvolvimento). */
export function getDb(): Promise<Db> {
  globalDb.__mtgMetaDb ??= openDb().catch((error: unknown) => {
    globalDb.__mtgMetaDb = undefined;
    throw error;
  });
  return globalDb.__mtgMetaDb;
}
