import 'server-only';
import { deckColors, isLand, type CardDatabase } from '@mtg-meta/core';
import type { CardRef, DeckLook } from './cards-shared';

export function cardRef(name: string, cards: CardDatabase): CardRef {
  const card = cards.get(name);
  return { name: card?.name ?? name, imageId: card?.imageId ?? null };
}

/** Cores e cartas de destaque a partir de "nome → cópias" (assinatura de arquétipo ou main de um deck). */
export function deckLook(entries: Iterable<[string, number]>, cards: CardDatabase, highlights = 3): DeckLook {
  const list = [...entries];
  const top = list
    .filter(([name]) => {
      const card = cards.get(name);
      return card !== undefined && !isLand(card) && card.imageId !== undefined;
    })
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, highlights)
    .map(([name]) => cardRef(name, cards));
  return { colors: deckColors(list, cards), cards: top };
}
