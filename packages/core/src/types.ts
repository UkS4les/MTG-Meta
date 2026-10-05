export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic';
export type Platform = 'arena' | 'paper';
export type Color = 'W' | 'U' | 'B' | 'R' | 'G';

/** As cinco cores na ordem tradicional do Magic. */
export const COLORS: readonly Color[] = ['W', 'U', 'B', 'R', 'G'];

/** Da mais comum para a mais rara. */
export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'mythic'];

/**
 * Uma carta no sentido "oracle": todas as impressões dela agrupadas.
 * É o formato do arquivo gerado por `npm run cartas:baixar`.
 */
export interface CardInfo {
  /** Nome oficial completo, ex.: "Fire // Ice". */
  name: string;
  /** Nomes de cada face (dupla-face, split, aventura). Vazio para cartas de uma face só. */
  faceNames: string[];
  /**
   * Outros nomes com que a carta foi impressa em inglês, ex.: "Leyline Weaver", o nome que
   * "Spider Manifestation" tem no MTGO e no Arena. As listas do MTGO usam esses nomes.
   */
  aliases?: string[];
  /** Custo de mana como o Scryfall escreve, ex.: "{1}{R}{G}". Faces separadas por " // ". */
  manaCost?: string;
  /** Texto de regras em inglês. Em cartas de duas faces, uma face por bloco, separadas por uma linha "//". */
  text?: string;
  /** Identidade de cor, na ordem W U B R G (branco, azul, preto, vermelho, verde). Vazio = incolor. */
  colors?: Color[];
  /**
   * Identificador no Scryfall da impressão usada como imagem da carta.
   * O endereço da imagem sai dele; veja `cardImageUrl`.
   */
  imageId?: string;
  /** Identificadores da carta no Arena (o "grpId" que aparece no log do jogo), um por impressão. */
  arenaIds?: number[];
  typeLine: string;
  /** Terreno básico comum (não-snow): grátis no Arena e tratado como já possuído no papel. */
  freeBasic: boolean;
  /** Regra "um deck pode ter qualquer número de cartas com este nome" (ex.: Persistent Petitioners). */
  anyNumber: boolean;
  /** Menor raridade entre as impressões do Arena (define o curinga); null = não existe no Arena. */
  arenaRarity: Rarity | null;
  /** Menor raridade entre as impressões em papel; null = carta só digital. */
  paperRarity: Rarity | null;
  /** Preço em USD da impressão em papel mais barata (dados do Scryfall, atualizados 1x por dia). */
  priceUsd: number | null;
}

export interface CardDataFile {
  meta: {
    source: 'scryfall' | 'example';
    generatedAt: string;
    bulkUpdatedAt?: string;
    note?: string;
  };
  cards: CardInfo[];
}

export interface DeckEntry {
  name: string;
  quantity: number;
}

export interface Decklist {
  name: string;
  format?: string;
  main: DeckEntry[];
  sideboard: DeckEntry[];
  /** Comandante(s). Companheiro entra no sideboard, como no Arena. */
  commander: DeckEntry[];
  /** Linhas que o parser não entendeu. */
  warnings: string[];
}

/** Nome oficial da carta → quantidade de cópias. */
export type Collection = Map<string, number>;
