'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { fitsColors } from '@mtg-meta/core';
import type { DeckLook } from '@/lib/cards-shared';
import { useColorPreference } from '@/lib/color-preference';
import { integer, percent } from '@/lib/format';
import { CardImage } from './card-image';
import { ColorFilter } from './color-filter';
import { ColorPips } from './color-pips';

export interface MetaTableRow extends DeckLook {
  /** null = decks sem arquétipo definido. */
  id: number | null;
  name: string | null;
  share: number;
  decks: number;
}

export function MetaTable({ format, rows }: { format: string; rows: MetaTableRow[] }) {
  const [preference, setPreference] = useColorPreference();
  const largest = Math.max(...rows.map((r) => r.share), 0.0001);
  const archetypes = rows.filter((r) => r.id !== null);
  const fits = (row: MetaTableRow) => row.id !== null && fitsColors(row.colors, preference.colors);
  const active = preference.colors.length > 0;
  const shown = active && preference.only ? rows.filter(fits) : rows;

  return (
    <>
      <ColorFilter preference={preference} onChange={setPreference} matching={archetypes.filter(fits).length} total={archetypes.length} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Arquétipo</th>
              <th className="num">Participação</th>
              <th aria-hidden="true" />
              <th className="num">Listas</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const rank = rows.indexOf(row);
              const classes = [row.id !== null && rank < 3 ? `top top-${rank + 1}` : '', active && !fits(row) ? 'dim' : '', active && fits(row) ? 'fits' : ''].join(' ').trim();
              return (
                <tr key={row.id ?? 'outros'} className={classes || undefined} style={{ '--i': Math.min(rank, 24) } as CSSProperties}>
                  <td className="num rank">{row.id === null ? '' : <span>{rank + 1}</span>}</td>
                  <td>
                    {row.id === null ? (
                      <span className="muted">Outros (sem arquétipo definido)</span>
                    ) : (
                      <Link href={`/meta/${format}/${row.id}`} className="archetype">
                        <span className="thumbs" aria-hidden="true">
                          {row.cards.slice(0, 2).map((card) => (
                            <CardImage key={card.name} name="" imageId={card.imageId} size="small" />
                          ))}
                        </span>
                        <span>
                          {row.name}
                          <ColorPips colors={row.colors} />
                        </span>
                      </Link>
                    )}
                  </td>
                  <td className="num">{percent(row.share)}</td>
                  <td className="bar-cell" aria-hidden="true">
                    <div className="bar">
                      <span style={{ width: `${(row.share / largest) * 100}%` }} />
                    </div>
                  </td>
                  <td className="num">{integer(row.decks)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {active && preference.only && shown.length === 0 && <p className="muted">Nenhum arquétipo deste formato cabe só nas cores escolhidas.</p>}
    </>
  );
}
