export type CardImageSize = 'small' | 'normal' | 'large';

/**
 * Endereço da imagem de uma carta no Scryfall, a partir do `imageId` do banco de cartas.
 * É sempre a carta inteira: as regras do Scryfall não permitem cortar o nome do artista
 * nem o aviso de copyright, então o site nunca usa recortes da ilustração.
 */
export function cardImageUrl(imageId: string, size: CardImageSize = 'normal'): string {
  return `https://cards.scryfall.io/${size}/front/${imageId[0]}/${imageId[1]}/${imageId}.jpg`;
}
