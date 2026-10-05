import Link from 'next/link';
import type { CSSProperties } from 'react';
import { cardSlug } from '@mtg-meta/core';
import type { CardRef } from '@/lib/cards-shared';
import { CardImage } from './card-image';

export interface GridCard extends CardRef {
  quantity: number;
}

/** Decklist em imagens: uma carta por posição, com a quantidade no canto. Cada uma leva à página da carta. */
export function CardGrid({ cards }: { cards: GridCard[] }) {
  return (
    <div className="card-grid">
      {cards.map((card, index) => (
        <Link key={card.name} href={`/cartas/${cardSlug(card.name)}`} prefetch={false} className="card-tile" title={card.name} style={{ '--i': Math.min(index, 30) } as CSSProperties}>
          <CardImage name={card.name} imageId={card.imageId} />
          <span className="qty-badge" aria-label={`${card.quantity} cópias`}>
            {card.quantity}×
          </span>
        </Link>
      ))}
    </div>
  );
}
