import type { Color } from '@mtg-meta/core';

/** O mínimo para mostrar uma carta: o nome e, quando o banco de cartas tem, a imagem. */
export interface CardRef {
  name: string;
  imageId: string | null;
}

/** Cores e cartas que representam um arquétipo ou deck na tela. */
export interface DeckLook {
  colors: Color[];
  /** As cartas não-terreno mais usadas, da mais para a menos. */
  cards: CardRef[];
}

export const COLOR_PT: Record<Color, string> = { W: 'Branco', U: 'Azul', B: 'Preto', R: 'Vermelho', G: 'Verde' };

/** Resultado da busca de cartas do editor de decks. */
export interface CardSuggestion extends CardRef {
  typeLine: string;
  colors: Color[];
}
