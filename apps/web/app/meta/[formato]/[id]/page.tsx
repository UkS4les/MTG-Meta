import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { deckColors, FORMATS, formatDecklist, isFormatKey, isLand, type DeckEntry } from '@mtg-meta/core';
import { getArchetype, getArchetypeResults, getDeck, getMeta, META_PERIODS, type ArchetypeResult } from '@mtg-meta/db';
import { CardGrid, type GridCard } from '@/components/card-grid';
import { CardLink } from '@/components/card-link';
import { ColorPips } from '@/components/color-pips';
import { CopyButton } from '@/components/copy-button';
import { WantButton } from '@/components/want-button';
import { cardRef } from '@/lib/cards-view';
import { date, percent } from '@/lib/format';
import { cardDb, getDb } from '@/lib/server';

interface Props {
  params: Promise<{ formato: string; id: string }>;
}

async function load(params: Props['params']) {
  const { formato, id } = await params;
  if (!isFormatKey(formato) || !/^\d{1,9}$/.test(id)) return null;
  const archetype = await getArchetype(await getDb(), Number(id));
  return archetype && archetype.format === formato ? { format: formato, archetype } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load(params);
  if (!found) return {};
  return {
    title: `${found.archetype.name} (${FORMATS[found.format]})`,
    description: `Lista representativa, cartas-chave e resultados recentes de ${found.archetype.name} no ${FORMATS[found.format]} do Magic Online.`,
  };
}

function resultLabel(result: ArchetypeResult): string {
  if (result.placement !== null) return `${result.placement}º lugar`;
  if (result.wins !== null && result.losses !== null) return `${result.wins}-${result.losses}`;
  return '—';
}

export default async function ArchetypePage({ params }: Props) {
  const found = await load(params);
  if (!found) notFound();
  const { format, archetype } = found;
  const db = await getDb();

  const [deck, results, ...metas] = await Promise.all([
    archetype.sampleDeckId === null ? null : getDeck(db, archetype.sampleDeckId, archetype.name),
    getArchetypeResults(db, archetype.id, 20),
    ...META_PERIODS.map((period) => getMeta(db, format, period)),
  ]);
  const shares = META_PERIODS.map((period, index) => ({ period, row: metas[index]!.find((r) => r.archetypeId === archetype.id) }));
  const keyCards = Object.entries(archetype.signature)
    .filter(([, copies]) => copies >= 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 16);
  const count = (entries: DeckEntry[]) => entries.reduce((total, e) => total + e.quantity, 0);
  const cards = cardDb();
  const colors = deckColors(Object.entries(archetype.signature), cards);
  // Mágicas primeiro, terrenos no fim, como a maioria dos sites de decklist mostra.
  const toGrid = (entries: DeckEntry[]): GridCard[] =>
    entries
      .map((entry) => ({ ...cardRef(entry.name, cards), quantity: entry.quantity, land: (() => { const card = cards.get(entry.name); return card ? isLand(card) : false; })() }))
      .sort((a, b) => Number(a.land) - Number(b.land) || b.quantity - a.quantity || a.name.localeCompare(b.name));

  return (
    <>
      <p className="small">
        <Link href={`/meta/${format}`}>← Meta de {FORMATS[format]}</Link>
      </p>
      <h1>{archetype.name}</h1>
      <p className="actions">
        <ColorPips colors={colors} />
        <WantButton deck={{ id: archetype.id, format, name: archetype.name }} />
      </p>
      <p className="muted">
        {shares.map(({ period, row }) => `${row ? percent(row.share) : '0%'} em ${period} dias`).join(' · ')}
        {archetype.autoNamed && <span className="tag">nome provisório</span>}
      </p>

      {deck && (
        <>
          <h2>Lista representativa</h2>
          <p className="small muted">A lista publicada mais próxima da média do arquétipo. É ela que entra no cálculo de “O que posso montar”.</p>
          <div className="card">
            <p className="small muted">Main ({count(deck.main)})</p>
            <CardGrid cards={toGrid(deck.main)} />
            {deck.sideboard.length > 0 && (
              <>
                <p className="small muted">Sideboard ({count(deck.sideboard)})</p>
                <CardGrid cards={toGrid(deck.sideboard)} />
              </>
            )}
            <div className="actions">
              <CopyButton text={formatDecklist(deck)} label="Copiar lista (Arena e MTGO)" />
              <Link href={`/montar?formato=${format}`}>Quanto falta para eu montar?</Link>
            </div>
          </div>
        </>
      )}

      <h2>Cartas-chave</h2>
      <p className="small muted">Média de cópias no main entre as listas dos últimos 60 dias (terrenos não entram).</p>
      <div className="card">
        <ul className="card-list columns">
          {keyCards.map(([name, copies]) => (
            <li key={name}>
              <span className="qty">{copies.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</span>
              <CardLink name={name} imageId={cards.get(name)?.imageId ?? null} />
            </li>
          ))}
        </ul>
      </div>

      <h2>Resultados recentes</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Evento</th>
              <th>Resultado</th>
              <th>Lista no mtgo.com</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result, index) => (
              // O mesmo jogador pode repetir a lista em dois eventos de mesmo nome no mesmo dia: a posição desempata.
              <tr key={`${result.date}-${result.eventName}-${result.player}-${result.deckId}-${index}`}>
                <td className="num">{date(result.date)}</td>
                <td>{result.eventName}</td>
                <td>{resultLabel(result)}</td>
                <td>{result.url ? <a href={result.url} rel="noreferrer">{result.player}</a> : result.player}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
