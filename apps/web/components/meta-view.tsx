import Link from 'next/link';
import { FORMATS, FORMAT_KEYS, type FormatKey } from '@mtg-meta/core';
import { getFormatStatus, getMeta, META_PERIODS, type MetaPeriod } from '@mtg-meta/db';
import { deckLook } from '@/lib/cards-view';
import { date, integer } from '@/lib/format';
import { cardDb, getDb } from '@/lib/server';
import { MetaTable, type MetaTableRow } from './meta-table';

export function parsePeriod(value: string | string[] | undefined): MetaPeriod {
  const days = Number(Array.isArray(value) ? value[0] : value);
  return META_PERIODS.find((p) => p === days) ?? 30;
}

export async function MetaView({ format, period }: { format: FormatKey; period: MetaPeriod }) {
  const db = await getDb();
  const [rows, status] = await Promise.all([getMeta(db, format, period), getFormatStatus(db, format, period)]);
  const cards = cardDb();
  const tableRows: MetaTableRow[] = rows.map((row) => ({
    id: row.archetypeId,
    name: row.name,
    share: row.share,
    decks: row.decks,
    ...deckLook(Object.entries(row.signature), cards, 2),
  }));
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
          <MetaTable format={format} rows={tableRows} />
          {hasAutoNames && (
            <p className="small muted">
              Os arquétipos são agrupados automaticamente por semelhança entre as listas. Enquanto ninguém dá o nome usado pela comunidade,
              cada um aparece com o nome da combinação de cores e as duas cartas que mais o distinguem dos outros.
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
