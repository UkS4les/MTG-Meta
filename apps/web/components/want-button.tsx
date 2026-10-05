'use client';

import { useWantedDecks, type WantedDeck } from '@/lib/wanted';

/** Marca ou desmarca um arquétipo como "quero montar". */
export function WantButton({ deck }: { deck: WantedDeck }) {
  const { isWanted, toggle } = useWantedDecks();
  const on = isWanted(deck.id);
  return (
    <button type="button" className={`want-button${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggle(deck)}>
      <span aria-hidden="true">{on ? '★' : '☆'}</span> {on ? 'Quero montar' : 'Marcar como objetivo'}
    </button>
  );
}
