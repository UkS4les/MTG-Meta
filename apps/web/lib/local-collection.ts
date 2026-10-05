import type { Platform } from '@mtg-meta/core';
import { localCollectionKey } from './coverage';

// O navegador pode bloquear o armazenamento (aba anônima, cota cheia); nada aqui pode quebrar a página.

export function readLocalCollection(platform: Platform): string | null {
  try {
    return window.localStorage.getItem(localCollectionKey(platform));
  } catch {
    return null;
  }
}

/** Devolve false se o navegador recusou guardar. */
export function writeLocalCollection(platform: Platform, text: string): boolean {
  try {
    window.localStorage.setItem(localCollectionKey(platform), text);
    return true;
  } catch {
    return false;
  }
}

export function clearLocalCollection(platform: Platform): void {
  try {
    window.localStorage.removeItem(localCollectionKey(platform));
  } catch {
    // Nada guardado.
  }
}

export async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { erro?: string };
    if (body.erro) return body.erro;
  } catch {
    // Resposta sem JSON.
  }
  return `O servidor respondeu com erro ${response.status}.`;
}
