import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FORMATS, isFormatKey } from '@mtg-meta/core';
import { getArchetypesUsingCard } from '@mtg-meta/db';
import { CardImage } from '@/components/card-image';
import { ColorPips } from '@/components/color-pips';
import { ManaCost } from '@/components/mana-cost';
import { percent, RARITY_PT, scryfallUrl, usd } from '@/lib/format';
import { cardDb, getDb } from '@/lib/server';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const card = cardDb().getBySlug((await params).slug);
  if (!card) return {};
  return {
    title: card.name,
    description: `${card.name}: ${card.typeLine}. ${card.priceUsd === null ? '' : `A partir de ${usd(card.priceUsd)}. `}Veja o texto, as raridades e os decks do meta que usam esta carta.`,
  };
}

export default async function CardPage({ params }: Props) {
  const card = cardDb().getBySlug((await params).slug);
  if (!card) notFound();
  const usage = (await getArchetypesUsingCard(await getDb(), card.name)).filter((u) => isFormatKey(u.format));
  // Em cartas de duas faces o texto vem com uma face por bloco, separadas por uma linha "//".
  const faces = (card.text ?? '').split('\n//\n').filter(Boolean);

  return (
    <>
      <p className="small">
        <Link href="/cartas">← Cartas</Link>
      </p>
      <div className="card-page">
        <div className="card-page-image">
          <CardImage name={card.name} imageId={card.imageId ?? null} size="large" />
        </div>
        <div>
          <h1>{card.name}</h1>
          <p className="card-line">
            <ManaCost cost={card.manaCost ?? ''} />
            <span>{card.typeLine}</span>
            <ColorPips colors={card.colors ?? []} />
          </p>

          <div className="tiles card-facts">
            <div className="tile">
              <span className="tile-label">Preço em papel</span>
              <span className="tile-value">{card.priceUsd === null ? '—' : usd(card.priceUsd)}</span>
              <span className="small muted">{card.priceUsd === null ? 'Sem preço no Scryfall' : 'Impressão mais barata'}</span>
            </div>
            <div className="tile">
              <span className="tile-label">Papel</span>
              <span className={`tile-word${card.paperRarity ? ` rarity-${card.paperRarity}` : ''}`}>{card.paperRarity ? RARITY_PT[card.paperRarity] : '—'}</span>
              <span className="small muted">{card.paperRarity ? 'Menor raridade impressa' : 'Só existe em formato digital'}</span>
            </div>
            <div className="tile">
              <span className="tile-label">Arena</span>
              <span className={`tile-word${card.arenaRarity ? ` rarity-${card.arenaRarity}` : ''}`}>{card.arenaRarity ? RARITY_PT[card.arenaRarity] : '—'}</span>
              <span className="small muted">{card.arenaRarity ? 'Curinga necessário' : 'Não existe no Arena'}</span>
            </div>
          </div>

          {faces.length > 0 && (
            <div className="card oracle">
              {faces.map((face, index) => (
                <div key={index}>
                  {index > 0 && <hr />}
                  {face.split('\n').map((line, lineIndex) => (
                    <p key={lineIndex}>{line}</p>
                  ))}
                </div>
              ))}
            </div>
          )}
          {card.aliases && card.aliases.length > 0 && <p className="small muted">Também impressa como: {card.aliases.join(', ')}</p>}
          {card.anyNumber && <p className="small muted">Um deck pode ter qualquer número de cópias desta carta.</p>}
          <p className="small">
            <a href={scryfallUrl(card.name)} rel="noreferrer">
              Ver todas as impressões no Scryfall ↗
            </a>
          </p>
        </div>
      </div>

      <h2>Decks do meta que usam esta carta</h2>
      {usage.length === 0 ? (
        <p className="muted">Nenhum arquétipo do meta atual (Standard, Pioneer, Modern, Pauper) usa esta carta no main.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Arquétipo</th>
                <th>Formato</th>
                <th className="num">Cópias (média)</th>
                <th className="num">Participação em 30 dias</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link href={`/meta/${u.format}/${u.id}`}>{u.name}</Link>
                  </td>
                  <td>{FORMATS[u.format as keyof typeof FORMATS]}</td>
                  <td className="num">{u.copies.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td>
                  <td className="num">{u.share > 0 ? percent(u.share) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
