import type { Color } from '@mtg-meta/core';
import { COLOR_PT } from '@/lib/cards-shared';

/** As cores de um deck como pontos coloridos; incolor vira um ponto cinza. */
export function ColorPips({ colors }: { colors: readonly Color[] }) {
  const label = colors.length === 0 ? 'Incolor' : colors.map((c) => COLOR_PT[c]).join(', ');
  return (
    <span className="mana" role="img" aria-label={label} title={label}>
      {colors.length === 0 ? <i className="mana-C" /> : colors.map((color) => <i key={color} className={`mana-${color}`} />)}
    </span>
  );
}
