'use client';

import { useCallback, useEffect, useState } from 'react';

/** Um arquétipo do meta que a pessoa marcou como objetivo. */
export interface WantedDeck {
  id: number;
  format: string;
  name: string;
}

const KEY = 'mtg-meta:quero';
const EVENT = 'mtg-meta:quero';

function read(): WantedDeck[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter((d): d is WantedDeck => d !== null && typeof d === 'object' && typeof d.id === 'number' && typeof d.format === 'string' && typeof d.name === 'string');
  } catch {
    return [];
  }
}

/** Decks que a pessoa quer montar, guardados neste navegador e iguais em todas as páginas abertas. */
export function useWantedDecks(): { wanted: WantedDeck[]; isWanted: (id: number) => boolean; toggle: (deck: WantedDeck) => void } {
  const [wanted, setWanted] = useState<WantedDeck[]>([]);

  useEffect(() => {
    const sync = () => setWanted(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const toggle = useCallback((deck: WantedDeck) => {
    const current = read();
    const next = current.some((d) => d.id === deck.id) ? current.filter((d) => d.id !== deck.id) : [...current, deck];
    setWanted(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Sem armazenamento, a marcação vale só nesta página.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { wanted, isWanted: (id) => wanted.some((d) => d.id === id), toggle };
}
