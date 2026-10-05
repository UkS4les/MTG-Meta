import { normalizeName } from './normalize.ts';
import type { CardDataFile, CardInfo } from './types.ts';

/**
 * Índice de cartas por nome. Aceita o nome completo ("Fable of the Mirror-Breaker // Reflection of Kiki-Jiki")
 * o nome de qualquer face ("Fable of the Mirror-Breaker"), que é como o Arena exporta,
 * ou um nome alternativo da carta.
 */
export class CardDatabase {
  private readonly byName = new Map<string, CardInfo>();
  private readonly byArenaId = new Map<number, CardInfo>();

  constructor(
    cards: readonly CardInfo[],
    readonly meta?: CardDataFile['meta'],
  ) {
    for (const card of cards) this.byName.set(normalizeName(card.name), card);
    for (const card of cards) {
      for (const id of card.arenaIds ?? []) this.byArenaId.set(id, card);
    }
    // Faces e nomes alternativos entram depois e nunca sobrescrevem um nome completo.
    for (const card of cards) {
      for (const other of [...card.faceNames, ...(card.aliases ?? [])]) {
        const key = normalizeName(other);
        if (!this.byName.has(key)) this.byName.set(key, card);
      }
    }
  }

  get(name: string): CardInfo | undefined {
    return this.byName.get(normalizeName(name));
  }

  /** Carta pelo identificador do Arena (grpId do log). */
  getByArenaId(arenaId: number): CardInfo | undefined {
    return this.byArenaId.get(arenaId);
  }

  get size(): number {
    return new Set(this.byName.values()).size;
  }
}
