import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Db } from './client.ts';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const SESSION_DAYS = 30;
export const MIN_PASSWORD_LENGTH = 8;

export interface User {
  id: string;
  email: string;
  /** Administra esta instalação (a primeira conta criada). */
  isAdmin: boolean;
}

const USER_COLUMNS = 'id, email, is_admin as "isAdmin"';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** No banco fica só o hash do token: quem ler a tabela não consegue se passar por ninguém. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Cria a conta. Devolve null se o e-mail já estiver cadastrado. */
export async function createUser(db: Db, email: string, password: string): Promise<User | null> {
  const rows = await db.query<User>(
    // A primeira conta da instalação nasce administradora.
    `insert into users (email, password_hash, is_admin) values ($1, $2, not exists (select 1 from users where is_admin))
     on conflict (email) do nothing returning ${USER_COLUMNS}`,
    [normalizeEmail(email), await hashPassword(password)],
  );
  return rows[0] ?? null;
}

export async function verifyLogin(db: Db, email: string, password: string): Promise<User | null> {
  const rows = await db.query<User & { password_hash: string }>(`select ${USER_COLUMNS}, password_hash from users where email = $1`, [
    normalizeEmail(email),
  ]);
  const user = rows[0];
  if (!user || !(await checkPassword(password, user.password_hash))) return null;
  return { id: user.id, email: user.email, isAdmin: user.isAdmin };
}

/** Devolve o token que vai no cookie. */
export async function createSession(db: Db, userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.query(`insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))`, [
    hashToken(token),
    userId,
    SESSION_DAYS,
  ]);
  await db.query('delete from sessions where expires_at < now()');
  return token;
}

export async function getSessionUser(db: Db, token: string): Promise<User | null> {
  const rows = await db.query<User>(
    `select u.id, u.email, u.is_admin as "isAdmin" from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.query('delete from sessions where token_hash = $1', [hashToken(token)]);
}

/** Apaga a conta e tudo que é dela (sessões e coleções saem em cascata). */
export async function deleteUser(db: Db, userId: string): Promise<void> {
  await db.query('delete from users where id = $1', [userId]);
}

export const API_TOKEN_PREFIX = 'mtgm_';

/** Gera a chave do tracker e invalida a anterior. O valor só existe aqui: no banco fica o hash. */
export async function createApiToken(db: Db, userId: string): Promise<string> {
  const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  await db.query(
    `insert into api_tokens (user_id, token_hash) values ($1, $2)
     on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = now(), last_used_at = null`,
    [userId, hashToken(token)],
  );
  return token;
}

export async function getApiTokenUser(db: Db, token: string): Promise<User | null> {
  if (!token.startsWith(API_TOKEN_PREFIX)) return null;
  const rows = await db.query<User>(
    `update api_tokens t set last_used_at = now() from users u
     where t.token_hash = $1 and u.id = t.user_id returning u.id, u.email, u.is_admin as "isAdmin"`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

export interface ApiTokenInfo {
  createdAt: string;
  lastUsedAt: string | null;
}

export async function getApiTokenInfo(db: Db, userId: string): Promise<ApiTokenInfo | null> {
  const rows = await db.query<{ created_at: Date; last_used_at: Date | null }>('select created_at, last_used_at from api_tokens where user_id = $1', [userId]);
  const row = rows[0];
  return row ? { createdAt: new Date(row.created_at).toISOString(), lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null } : null;
}

export async function revokeApiToken(db: Db, userId: string): Promise<void> {
  await db.query('delete from api_tokens where user_id = $1', [userId]);
}

/**
 * Troca a senha e encerra todas as sessões da conta: quem estava logado com a senha antiga sai.
 * Devolve false se a conta não existe.
 */
export async function setPassword(db: Db, userId: string, password: string): Promise<boolean> {
  const rows = await db.query('update users set password_hash = $2 where id = $1 returning id', [userId, await hashPassword(password)]);
  if (rows.length === 0) return false;
  await db.query('delete from sessions where user_id = $1', [userId]);
  return true;
}

/** Senha provisória, fácil de ditar: letras e números sem os que se confundem (0/O, 1/l/I). */
export function temporaryPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(12), (byte) => alphabet[byte % alphabet.length]).join('');
}

export interface UserSummary {
  id: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
}

export async function listUsers(db: Db): Promise<UserSummary[]> {
  const rows = await db.query<{ id: string; email: string; is_admin: boolean; created_at: Date }>('select id, email, is_admin, created_at from users order by created_at, id');
  return rows.map((r) => ({ id: r.id, email: r.email, isAdmin: r.is_admin, createdAt: new Date(r.created_at).toISOString() }));
}

export async function findUserByEmail(db: Db, email: string): Promise<User | null> {
  const rows = await db.query<User>(`select ${USER_COLUMNS} from users where email = $1`, [normalizeEmail(email)]);
  return rows[0] ?? null;
}
