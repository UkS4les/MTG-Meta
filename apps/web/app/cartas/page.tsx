import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { cardSlug, COLORS } from '@mtg-meta/core';
import { CardImage } from '@/components/card-image';
import { browseCards, CARD_TYPES, filtersUrl, readFilters, SORTS } from '@/lib/card-browse';
import { COLOR_PT } from '@/lib/cards-shared';
import { integer, RARITY_PT, usd } from '@/lib/format';
import { cardDb } from '@/lib/server';

export const metadata: Metadata = {
  title: 'Cartas',
  description: 'Todas as cartas de Magic com imagem, preço, raridade e texto. Filtre por cor, tipo e raridade e veja em quais decks do meta cada uma aparece.',
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CardsPage({ searchParams }: Props) {
  const filters = readFilters(await searchParams);
  const { cards, total, pages } = browseCards(cardDb(), filters);
  const page = Math.min(filters.page, pages);

  return (
    <>
      <h1>Cartas</h1>
      <p className="muted">Todas as cartas, com imagem e preço. Abra uma para ver o texto, as raridades e em quais decks do meta ela aparece.</p>

      {/* Formulário comum, enviado pelo endereço: funciona sem JavaScript e o resultado pode ser compartilhado. */}
      <form className="card filters" action="/cartas" method="get">
        <div className="filter-wide">
          <label htmlFor="q">Nome, tipo ou texto</label>
          <input id="q" name="q" type="search" defaultValue={filters.query} placeholder="Ex.: lightning, dragon, draw a card" />
        </div>
        <div>
          <label htmlFor="tipo">Tipo</label>
          <select id="tipo" name="tipo" defaultValue={filters.type ?? ''}>
            <option value="">Todos</option>
            {Object.entries(CARD_TYPES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="raridade">Raridade</label>
          <select id="raridade" name="raridade" defaultValue={filters.rarity ?? ''}>
            <option value="">Todas</option>
            {Object.entries(RARITY_PT).map(([key, label]) => (
              <option key={key} value={key}>
                {label[0]!.toUpperCase() + label.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ordenar">Ordenar por</label>
          <select id="ordenar" name="ordenar" defaultValue={filters.sort}>
            {Object.entries(SORTS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="filter-wide color-checks">
          <legend>Cores (mostra as cartas que cabem nas cores marcadas)</legend>
          {COLORS.map((color) => (
            <label key={color} className="mana-check" title={COLOR_PT[color]}>
              <input type="checkbox" name="cor" value={color} defaultChecked={filters.colors.includes(color)} />
              <i className={`mana-${color}`} aria-hidden="true" />
              <span className="sr-only">{COLOR_PT[color]}</span>
            </label>
          ))}
          <label className="check">
            <input type="checkbox" name="arena" value="1" defaultChecked={filters.arena} />
            Só as que existem no Arena
          </label>
        </fieldset>
        <div className="actions filter-wide">
          <button type="submit" className="button">
            Buscar
          </button>
          <Link href="/cartas">Limpar filtros</Link>
        </div>
      </form>

      <p className="small muted">
        {total === 0 ? 'Nenhuma carta com esses filtros.' : `${integer(total)} ${total === 1 ? 'carta' : 'cartas'}${pages > 1 ? ` · página ${integer(page)} de ${integer(pages)}` : ''}`}
      </p>

      <div className="card-grid browse">
        {cards.map((card, index) => (
          <Link key={card.name} href={`/cartas/${cardSlug(card.name)}`} prefetch={false} className="card-tile" style={{ '--i': Math.min(index, 30) } as CSSProperties}>
            <CardImage name={card.name} imageId={card.imageId ?? null} />
            <span className="card-caption">
              <span className="card-caption-name">{card.name}</span>
              <span className={card.priceUsd === null ? 'muted' : 'price'}>{card.priceUsd === null ? 'sem preço' : usd(card.priceUsd)}</span>
            </span>
          </Link>
        ))}
      </div>

      {pages > 1 && (
        <nav className="pager" aria-label="Páginas">
          {page > 1 ? (
            <Link href={filtersUrl(filters, page - 1)} className="button secondary">
              ← Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="small muted">
            {integer(page)} de {integer(pages)}
          </span>
          {page < pages ? (
            <Link href={filtersUrl(filters, page + 1)} className="button secondary">
              Próxima →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
      <p className="small muted">Preços em dólar da impressão em papel mais barata no Scryfall, atualizados uma vez por dia.</p>
    </>
  );
}
