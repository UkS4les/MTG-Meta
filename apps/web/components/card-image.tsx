import { cardImageUrl, type CardImageSize } from '@mtg-meta/core';

/**
 * Imagem de uma carta, sempre inteira (as regras do Scryfall não permitem recortar a ilustração).
 * Sem imagem no banco de cartas, mostra um verso genérico com o nome.
 */
export function CardImage({ name, imageId, size = 'normal', className = '' }: { name: string; imageId: string | null; size?: CardImageSize; className?: string }) {
  if (!imageId) {
    return (
      <span className={`card-img card-blank ${className}`} role="img" aria-label={name}>
        <span>{name}</span>
      </span>
    );
  }
  return <img className={`card-img ${className}`} src={cardImageUrl(imageId, size)} alt={name} loading="lazy" decoding="async" />;
}
