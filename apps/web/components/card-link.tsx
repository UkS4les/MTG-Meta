'use client';

import { useState, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { cardImageUrl, cardSlug } from '@mtg-meta/core';

const WIDTH = 244;
const HEIGHT = 340;

/** Nome de carta que leva à página dela e, com o mouse em cima, mostra a carta ao lado. */
export function CardLink({ name, imageId, children }: { name: string; imageId: string | null; children?: ReactNode }) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  function show(event: PointerEvent<HTMLAnchorElement>) {
    // No toque não existe "passar por cima": o toque já abre o link.
    if (!imageId || event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fitsRight = rect.right + 16 + WIDTH < window.innerWidth;
    setPosition({
      left: fitsRight ? rect.right + 16 : Math.max(8, rect.left - 16 - WIDTH),
      top: Math.min(Math.max(8, rect.top + rect.height / 2 - HEIGHT / 2), window.innerHeight - HEIGHT - 8),
    });
  }

  return (
    <>
      <Link href={`/cartas/${cardSlug(name)}`} prefetch={false} onPointerEnter={show} onPointerLeave={() => setPosition(null)}>
        {children ?? name}
      </Link>
      {position &&
        imageId &&
        // No corpo da página: dentro de um cartão com desfoque a posição fixa ficaria presa a ele.
        createPortal(<img className="card-preview" src={cardImageUrl(imageId, 'normal')} alt="" style={position} />, document.body)}
    </>
  );
}
