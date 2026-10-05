import 'server-only';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { cookies, headers } from 'next/headers';
import type { CardDatabase } from '@mtg-meta/core';
import { dataDir, getApiTokenUser, getDb, getSessionUser, SESSION_DAYS, type User } from '@mtg-meta/db';
import { loadCards, type LoadedCards } from '@mtg-meta/jobs';

export { getDb };

export const SESSION_COOKIE = 'sessao';

const globalCards = globalThis as typeof globalThis & { __mtgMetaCards?: LoadedCards & { file: string | null; mtimeMs: number; checkedAt: number } };

function cardsFile(): { file: string | null; mtimeMs: number } {
  const file = process.env.CARDS_FILE ?? join(dataDir(), 'cards.json');
  try {
    return { file, mtimeMs: statSync(/* turbopackIgnore: true */ file).mtimeMs };
  } catch {
    return { file: null, mtimeMs: 0 };
  }
}

/**
 * Banco de cartas em memória. É recarregado quando o arquivo muda no disco (a atualização diária
 * do Scryfall), conferindo no máximo uma vez por minuto.
 */
export function getCards(): LoadedCards {
  const cached = globalCards.__mtgMetaCards;
  const now = Date.now();
  if (cached && now - cached.checkedAt < 60_000) return cached;
  const current = cardsFile();
  if (cached && cached.file === current.file && cached.mtimeMs === current.mtimeMs) {
    cached.checkedAt = now;
    return cached;
  }
  try {
    globalCards.__mtgMetaCards = { ...loadCards(), ...current, checkedAt: now };
  } catch (error) {
    // Arquivo pela metade (download em andamento): fica com o que já estava carregado.
    if (!cached) throw error;
    cached.checkedAt = now;
  }
  return globalCards.__mtgMetaCards!;
}

export function cardDb(): CardDatabase {
  return getCards().cards;
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionUser(await getDb(), token);
}

/**
 * Quem está fazendo a requisição: o tracker se identifica com a chave no cabeçalho Authorization;
 * o navegador, com o cookie de sessão. Uma chave inválida não cai para o cookie.
 */
export async function requestUser(request: Request): Promise<User | null> {
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (bearer) return getApiTokenUser(await getDb(), bearer);
  return currentUser();
}

export async function setSessionCookie(token: string): Promise<void> {
  // "Secure" só quando a página veio por HTTPS (atrás de um proxy, ele avisa neste cabeçalho).
  // Em HTTP puro, como num computador de casa acessado pelo celular, o navegador recusaria o cookie.
  const https = (await headers()).get('x-forwarded-proto')?.split(',')[0]?.trim() === 'https';
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: https,
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}
