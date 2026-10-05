import Link from 'next/link';
import type { CSSProperties } from 'react';
import { FORMATS, FORMAT_KEYS, type FormatKey } from '@mtg-meta/core';
import { getFormatStatus, getMeta, META_PERIODS, type MetaPeriod } from '@mtg-meta/db';
import { date, integer, percent } from '@/lib/format';
import { getDb } from '@/lib/server';

export function parsePeriod(value: string | string[] | undefined): MetaPeriod {
  const days = Number(Array.isArray(value) ? value[0] : value);
  return META_PERIODS.find((p) => p === days) ?? 30;
}

export async function MetaView({ format, period }: { format: FormatKey; period: MetaPeriod }) {
  const db = await getDb();
  const [rows, status] = await Promise.all([getMeta(db, format, period), getFormatStatus(db, format, period)]);
  const largest = Math.max(...rows.map((r) => r.share), 0.0001);
  const hasAutoNames = rows.some((r) => r.autoNamed);

  return (
    <>
      <h1>Meta de {FORMATS[format]} no Magic Online</h1>
      <p className="muted">
        Participação de cada arquétipo entre as listas publicadas pelo MTGO: o top 32 dos Challenges e as campanhas 5-0 das Ligas.
      </p>

      <div className="toolbar">
        <nav className="tabs" aria-label="Formato">
          {FORMAT_KEYS.map((key) => (
            <Link key={key} href={`/meta/${key}${period === 30 ? '' : `?dias=${period}`}`} aria-current={key === format ? 'page' : undefined}>
              {FORMATS[key]}
            </Link>
          ))}
        </nav>
        <nav className="tabs" aria-label="Período">
          {META_PERIODS.map((p) => (
            <Link key={p} href={`/meta/${format}${p === 30 ? '' : `?dias=${p}`}`} aria-current={p === period ? 'page' : undefined}>
              {p} dias
            </Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <p>Ainda não há torneios de {FORMATS[format]} neste período.</p>
          <p className="muted small">
            Os dados entram pela ingestão (<code>npm run meta:ingerir</code>).
          </p>
        </div>
      ) : (
        <>
          <p className="small muted">
            {integer(status.results)} listas de {integer(status.events)} eventos nos últimos {period} dias
            {status.lastEventDate && <> · evento mais recente em {date(status.lastEventDate)}</>}
          </p>
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
                {rows.map((row, index) => (
                  <tr key={row.archetypeId ?? 'outros'} className={row.archetypeId !== null && index < 3 ? `top top-${index + 1}` : undefined} style={{ '--i': Math.min(index, 24) } as CSSProperties}>
                    <td className="num rank">{row.archetypeId === null ? '' : <span>{index + 1}</span>}</td>
                    <td>
                      {row.archetypeId === null ? (
                        <span className="muted">Outros (sem arquétipo definido)</span>
                      ) : (
                        <Link href={`/meta/${format}/${row.archetypeId}`}>{row.name}</Link>
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
                ))}
              </tbody>
            </table>
          </div>
          {hasAutoNames && (
            <p className="small muted">
              Os arquétipos são agrupados automaticamente por semelhança entre as listas. Enquanto ninguém dá o nome usado pela comunidade,
              cada um aparece com as duas cartas que mais o distinguem dos outros.
            </p>
          )}
          <p className="small muted">
            Isto mede presença entre os melhores resultados, não taxa de vitória: o MTGO não publica as listas de quem ficou fora do top 32
            nem das Ligas abaixo de 5-0.
          </p>
        </>
      )}
    </>
  );
}
