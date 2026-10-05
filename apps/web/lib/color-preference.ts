'use client';

import { useCallback, useEffect, useState } from 'react';
import { COLORS, type Color } from '@mtg-meta/core';

export interface ColorPreference {
  /** Cores que a pessoa gosta de jogar. Vazio = sem preferência. */
  colors: Color[];
  /** Esconder os decks que não cabem nessas cores (em vez de só apagá-los um pouco). */
  only: boolean;
}

const KEY = 'mtg-meta:cores';
const EVENT = 'mtg-meta:cores';
const NONE: ColorPreference = { colors: [], only: false };

function read(): ColorPreference {
  try {
    const stored = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Partial<ColorPreference> | null;
    if (!stored || !Array.isArray(stored.colors)) return NONE;
    return { colors: COLORS.filter((color) => stored.colors!.includes(color)), only: stored.only === true };
  } catch {
    return NONE;
  }
}

/** Preferência de cores de deck, guardada neste navegador e igual em todas as páginas abertas. */
export function useColorPreference(): [ColorPreference, (next: ColorPreference) => void] {
  const [preference, setPreference] = useState<ColorPreference>(NONE);

  useEffect(() => {
    const sync = () => setPreference(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const update = useCallback((next: ColorPreference) => {
    setPreference(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Sem armazenamento, a preferência vale só nesta página.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [preference, update];
}
