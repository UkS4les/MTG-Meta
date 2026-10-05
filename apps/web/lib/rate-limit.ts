import 'server-only';

/** Depois de tantas senhas erradas para o mesmo e-mail, o login dele fica bloqueado por um tempo. */
export const MAX_FAILURES = 8;
export const WINDOW_MINUTES = 15;

const globalLimits = globalThis as typeof globalThis & { __mtgMetaLoginFailures?: Map<string, number[]> };
const failures: Map<string, number[]> = (globalLimits.__mtgMetaLoginFailures ??= new Map());

function recent(key: string, now: number): number[] {
  const kept = (failures.get(key) ?? []).filter((time) => now - time < WINDOW_MINUTES * 60_000);
  if (kept.length > 0) failures.set(key, kept);
  else failures.delete(key);
  return kept;
}

/**
 * Minutos que faltam para o e-mail poder tentar de novo; 0 = pode tentar.
 * A contagem fica na memória do servidor: reiniciar zera, o que basta para barrar quem tenta
 * adivinhar senhas em sequência.
 */
export function loginBlockedFor(email: string, now = Date.now()): number {
  const kept = recent(email, now);
  if (kept.length < MAX_FAILURES) return 0;
  return Math.max(1, Math.ceil((kept[0]! + WINDOW_MINUTES * 60_000 - now) / 60_000));
}

export function recordLoginFailure(email: string, now = Date.now()): void {
  failures.set(email, [...recent(email, now), now]);
  // Tentativas com e-mails inventados não podem encher a memória.
  if (failures.size > 10_000) failures.delete(failures.keys().next().value!);
}

export function clearLoginFailures(email: string): void {
  failures.delete(email);
}
