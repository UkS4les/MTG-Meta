import 'server-only';
import type { Platform } from '@mtg-meta/core';

export function jsonError(message: string, status: number): Response {
  return Response.json({ erro: message }, { status });
}

export function parsePlatform(value: unknown): Platform | null {
  if (value === 'arena') return 'arena';
  if (value === 'paper' || value === 'papel') return 'paper';
  return null;
}

/** Lê o corpo JSON de uma requisição; devolve null se não for um objeto JSON válido. */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
