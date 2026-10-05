'use client';

import { COLORS, type Color } from '@mtg-meta/core';
import { COLOR_PT } from '@/lib/cards-shared';
import type { ColorPreference } from '@/lib/color-preference';

/** Escolha das cores de deck preferidas. `matching` e `total` dizem quantos decks cabem nelas. */
export function ColorFilter({ preference, onChange, matching, total }: { preference: ColorPreference; onChange: (next: ColorPreference) => void; matching: number; total: number }) {
  const toggle = (color: Color) => {
    const colors = preference.colors.includes(color) ? preference.colors.filter((c) => c !== color) : COLORS.filter((c) => c === color || preference.colors.includes(c));
    onChange({ colors, only: colors.length > 0 && preference.only });
  };
  const active = preference.colors.length > 0;

  return (
    <div className="color-filter">
      <span className="small muted">Suas cores</span>
      <span className="color-buttons" role="group" aria-label="Cores de deck preferidas">
        {COLORS.map((color) => (
          <button key={color} type="button" className={`mana-button mana-${color}`} aria-pressed={preference.colors.includes(color)} aria-label={COLOR_PT[color]} title={COLOR_PT[color]} onClick={() => toggle(color)} />
        ))}
      </span>
      {active ? (
        <>
          <label className="check">
            <input type="checkbox" checked={preference.only} onChange={(event) => onChange({ ...preference, only: event.target.checked })} />
            Mostrar só os que cabem ({matching} de {total})
          </label>
          <button type="button" className="link-button small" onClick={() => onChange({ colors: [], only: false })}>
            Limpar
          </button>
        </>
      ) : (
        <span className="small muted">Marque as cores que você joga para destacar os decks que cabem nelas.</span>
      )}
    </div>
  );
}
