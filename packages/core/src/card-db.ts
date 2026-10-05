import { cardSlug, normalizeName } from './normalize.ts';
import type { CardDataFile, CardInfo } from './types.ts';

/**
 * Índice de cartas por nome. Aceita o nome completo ("Fable of the Mirror-Breaker // Reflection of Kiki-Jiki")
 * o nome de qualquer face ("Fable of the Mirror-Breaker"), que é como o Arena exporta,
 * ou um nome alternativo da carta.
 */
export class CardDatabase {
  private readonly byName = new Map<string, CardInfo>();
  private readonly byArenaId = new Map<number, CardInfo>();
  private bySlug: Map<string, CardInfo> | null = null;
  private list: CardInfo[] | null = null;
  /** Nome normalizado de cada carta, em ordem alfabética, para a busca. */
  private readonly searchIndex: { key: string; card: CardInfo }[] = [];

  constructor(
    cards: readonly CardInfo[],
    readonly meta?: CardDataFile['meta'],
  ) {
    for (const card of cards) {
      const key = normalizeName(card.name);
      this.byName.set(key, card);
      this.searchIndex.push({ key, card });
    }
    this.searchIndex.sort((a, b) => a.key.localeCompare(b.key));
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

  /** Todas as cartas, em ordem alfabética. */
  get all(): readonly CardInfo[] {
    return (this.list ??= this.searchIndex.map((entry) => entry.card));
  }

  /** Carta pelo endereço gerado por `cardSlug`. O índice só é montado quando alguém pede. */
  getBySlug(slug: string): CardInfo | undefined {
    if (!this.bySlug) {
      this.bySlug = new Map();
      // Em ordem alfabética, a primeira carta fica com o endereço se duas gerarem o mesmo.
      for (const { card } of this.searchIndex) {
        const key = cardSlug(card.name);
        if (!this.bySlug.has(key)) this.bySlug.set(key, card);
      }
    }
    return this.bySlug.get(slug);
  }

  /**
   * Busca por pedaço do nome, sem diferenciar maiúsculas nem acentos.
   * Nomes que começam com o texto vêm antes dos que só o contêm.
   */
  search(query: string, limit = 12): CardInfo[] {
    const text = normalizeName(query);
    if (text.length < 2) return [];
    const starts: CardInfo[] = [];
    const contains: CardInfo[] = [];
    for (const { key, card } of this.searchIndex) {
      if (key.startsWith(text)) starts.push(card);
      else if (contains.length < limit && key.includes(text)) contains.push(card);
      if (starts.length >= limit) break;
    }
    return [...starts, ...contains].slice(0, limit);
  }

  /** Carta pelo identificador do Arena (grpId do log). */
  getByArenaId(arenaId: number): CardInfo | undefined {
    return this.byArenaId.get(arenaId);
  }

  get size(): number {
    return new Set(this.byName.values()).size;
  }
}
