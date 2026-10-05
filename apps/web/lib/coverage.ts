import type { MissingCard, Platform, Rarity, SortBy } from '@mtg-meta/core';

/** Corpo de POST /api/cobertura. */
export interface CoverageRequest {
  formato: string;
  plataforma: Platform;
  ordenar: SortBy;
  /** Texto da coleção (CSV ou lista). Sem ele, vale a coleção salva na conta. */
  colecao?: string;
}

export interface CoverageDeck {
  archetypeId: number;
  name: string;
  autoNamed: boolean;
  share: number;
  coverage: number;
  cardsNeeded: number;
  cardsOwned: number;
  missingCopies: number;
  missing: MissingCard[];
  wildcards: Record<Rarity, number>;
  costUsd: number;
  unpricedMissing: string[];
  notOnArena: string[];
}

export interface CoverageResponse {
  decks: CoverageDeck[];
  collection: { cards: number; copies: number; saved: boolean };
}

/** Corpo de PUT /api/colecao. */
export interface CollectionRequest {
  plataforma: Platform;
  texto: string;
}

export interface CollectionResponse {
  /** false = visitante sem conta: nada foi gravado no servidor. */
  saved: boolean;
  cards: number;
  copies: number;
  unknown: string[];
  ignoredLines: number;
}

export interface CollectionStatus {
  loggedIn: boolean;
  saved: { platform: Platform; cards: number; copies: number; updatedAt: string }[];
}

/** Onde a coleção de quem não tem conta fica guardada no navegador. */
export const localCollectionKey = (platform: Platform) => `mtg-meta:colecao:${platform}`;

/** Limite do texto de uma coleção: bem acima de uma coleção completa exportada em CSV. */
export const MAX_COLLECTION_BYTES = 5_000_000;
